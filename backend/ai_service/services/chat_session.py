from ai_service.services.nlp_intent_parser import NLPIntentParser
from ai_service.services.llm_client import LLMClient
from ai_service.services.travel_recommendation import TravelCandidate, TravelContext, TravelRecommendationService


OUT_OF_SCOPE_MESSAGE = (
    "Bu konu uygulama kapsamim disinda. Sana seyahat, rota planlama, gezilecek "
    "yerler ve Excursa icindeki gezi deneyimi hakkinda yardimci olabilirim."
)


class ChatSession:
    """
    Product-level chatbot pipeline:
    1. Parse intent, destination, duration and themes.
    2. Retrieve internal POIs/routes plus curated general highlights.
    3. Produce structured plans deterministically when the user asks for a route.
    4. Use the LLM as a natural-language layer when it is available.
    """

    def __init__(self, user_id=None):
        self.user_id = user_id
        self.intent_parser = NLPIntentParser()
        self.travel_service = TravelRecommendationService()
        self.llm_client = self._build_llm_client()
        self.history = []

    def process_message(self, message: str) -> dict:
        intent_result = self.intent_parser.classify(message)

        self.history.append({
            "role": "user",
            "content": message,
        })

        if not intent_result.in_scope:
            response = OUT_OF_SCOPE_MESSAGE
            self.history.append({"role": "assistant", "content": response})
            return {
                "intent": intent_result.intent,
                "response": response,
                "history": self.history,
                "confidence": intent_result.confidence,
                "metadata": {
                    "in_scope": False,
                    "reason": intent_result.reason,
                    "entities": intent_result.entities,
                    "sources": [],
                },
            }

        travel_context = self._build_travel_context(message, intent_result)
        messages = self._build_messages(
            intent=intent_result.intent,
            intent_entities=intent_result.entities,
            travel_context=travel_context,
        )
        response = self._generate_response(
            messages=messages,
            intent=intent_result.intent,
            message=message,
            travel_context=travel_context,
        )

        self.history.append({
            "role": "assistant",
            "content": response,
        })

        return {
            "intent": intent_result.intent,
            "response": response,
            "history": self.history,
            "confidence": 0.85 if self.llm_client else max(0.55, intent_result.confidence - 0.1),
            "metadata": {
                "in_scope": True,
                "entities": intent_result.entities,
                "sources": self._source_metadata(travel_context),
            },
        }

    def _build_llm_client(self):
        try:
            return LLMClient()
        except Exception:
            return None

    def _build_travel_context(self, message: str, intent_result) -> TravelContext:
        if intent_result.intent in {
            "place_recommendation",
            "historical_places",
            "food_recommendation",
            "trip_plan",
            "nature_recommendation",
            "mixed_city_guide",
            "location_query",
        }:
            return self.travel_service.build_context(
                user_id=self.user_id,
                message=message,
                intent_result=intent_result,
            )
        return TravelContext()

    def _generate_response(self, messages: list, intent: str, message: str, travel_context: TravelContext) -> str:
        if intent == "greeting":
            return (
                "Merhaba! Ben EXCURSA seyahat asistanin. Bir sehir, kac gun kalacagin "
                "ve ilgini ceken tema yazarsan sana gun gun rota cikarabilirim."
            )

        if intent == "help":
            return (
                "Sana sehir bazli gezi planlari, tarihi/kulturel yer onerileri, "
                "dogal rota fikirleri ve Excursa icindeki gezi akisinda yardimci olabilirim."
            )

        if intent == "community":
            return (
                "Excursa akisinda diger gezginlerin paylasimlarini gorebilir, rotalari "
                "kaydedebilir, yorum yapabilir ve kendi gezi deneyimini paylasabilirsin."
            )

        if intent == "food_recommendation":
            return self._food_answer(travel_context)

        if intent in {
            "trip_plan",
            "place_recommendation",
            "historical_places",
            "nature_recommendation",
            "mixed_city_guide",
            "location_query",
        }:
            if travel_context.days:
                return self._day_plan_answer(travel_context)
            if travel_context.has_travel_data():
                return self._recommendation_answer(travel_context)

        if self.llm_client:
            try:
                return self.llm_client.generate_response(messages=messages, temperature=0.72, max_tokens=900)
            except Exception:
                pass

        return self._fallback_response(intent=intent, travel_context=travel_context)

    def _day_plan_answer(self, context: TravelContext) -> str:
        city = context.city or "bu sehir"
        days = max(1, min(int(context.days or 1), 7))
        places = list(context.candidates)
        if len(places) < days * 3 and context.foods:
            for food in context.foods:
                places.append(
                    TravelCandidate(
                        name=food,
                        category="food",
                        city=context.city,
                        note="Yerel lezzet molasi olarak plana eklenebilir.",
                        tags=["food"],
                        source="city_food",
                    )
                )

        if not places:
            return (
                f"{city} icin {days} gunluk plan hazirlamak icin yeterli veri bulamadim. "
                "Sehir adini veya ilgi alanini biraz daha net yazarsan rota olusturabilirim."
            )

        needed = days * 3
        while len(places) < needed and places:
            places.extend(places[: needed - len(places)])

        lines = [f"{city} icin {days} gunluk gezi plani:"]
        cursor = 0
        for day in range(1, days + 1):
            day_places = places[cursor: cursor + 3] or places[:3]
            cursor += 3
            lines.append(f"\nGun {day}:")
            for place in day_places:
                lines.append(f"- {place.name}: {place.note}")
                if self._should_include_cultural_note(place):
                    lines.append(f"  {place.cultural_note}")

        if context.user_interests:
            lines.append(
                "\nKisisellestirme: Ilgi alanlarina gore siraladim: "
                + ", ".join(context.user_interests[:4])
            )
        elif context.themes:
            lines.append("\nTema: " + ", ".join(context.themes[:4]))

        if context.foods and ("food" in context.themes or context.intent == "food_recommendation"):
            lines.append("\nYemek molasi:")
            for food in context.foods[: min(3, len(context.foods))]:
                lines.append(f"- {food}")

        if context.routes:
            route = context.routes[0]
            stops = ", ".join(route.get("stops") or [])
            if stops:
                lines.append(f"\nExcursa'da benzer rota: {route['title']} ({stops})")

        return "\n".join(lines)

    def _food_answer(self, context: TravelContext) -> str:
        city = context.city or "Bu sehir"
        if not context.foods:
            return (
                f"{city} icin elimde guvenilir yerel yemek listesi yok. "
                "Istersen gezi rotasi veya tarihi yer onerisi hazirlayabilirim."
            )

        lines = [f"{city} icin denenebilecek yerel lezzetler:"]
        for index, food in enumerate(context.foods[:8], start=1):
            lines.append(f"{index}. {food}: Sehrin yerel mutfak kimliginde one cikan lezzetlerden.")
        lines.append("Restoran ismi uydurmuyorum; burada sehirle ozdeslesen yemekleri listeliyorum.")

        food_places = [
            place
            for place in context.candidates
            if "food" in place.category.lower() or "food" in place.tags
        ]
        if food_places:
            lines.append("\nGeziye yemek molasi olarak eklenebilecek alanlar:")
            for place in food_places[:3]:
                lines.append(f"- {place.name}: {place.note}")
        return "\n".join(lines)

    def _recommendation_answer(self, context: TravelContext) -> str:
        city = context.city or "Bu rota"
        lines = [f"{city} icin one cikan oneriler:"]

        for index, place in enumerate(context.candidates[:6], start=1):
            source_label = "Excursa POI" if place.source == "internal_poi" else "genel seyahat bilgisi"
            rating = f" - {place.rating:.1f}/5" if place.rating else ""
            lines.append(f"{index}. {place.name} ({place.category}){rating}: {place.note}")
            if self._should_include_cultural_note(place):
                lines.append(f"   {place.cultural_note}")
            lines.append(f"   Kaynak: {source_label}")

        if context.user_interests:
            lines.append(
                "Ilgi alanlarina gore oncelik verdim: "
                + ", ".join(context.user_interests[:4])
            )
        if context.foods:
            lines.append("Yerel yemekler: " + ", ".join(context.foods[:5]))
        lines.append("Istersen bunu 1, 2 veya 3 gunluk gun gun plana cevirebilirim.")
        return "\n".join(lines)

    def _should_include_cultural_note(self, place) -> bool:
        if not place.cultural_note:
            return False
        text = " ".join([place.category, " ".join(place.tags)]).lower()
        return any(token in text for token in ["historical", "history", "culture", "museum", "architecture"])

    def _fallback_response(self, intent: str, travel_context: TravelContext) -> str:
        if intent in {
            "place_recommendation",
            "historical_places",
            "food_recommendation",
            "trip_plan",
            "nature_recommendation",
            "mixed_city_guide",
            "location_query",
        }:
            if travel_context.city:
                return (
                    f"{travel_context.city} icin net rota kurmam icin biraz daha bilgi lazim: "
                    "kac gun kalacaksin ve tarih/doga/yemek gibi hangi tema oncelikli?"
                )
            return (
                "Daha iyi yardimci olabilmem icin sehir, gun sayisi ve ilgi alanini yaz. "
                "Ornek: 'Sanliurfa 2 gunluk tarihi gezi plani yap'."
            )
        return OUT_OF_SCOPE_MESSAGE

    def _build_messages(self, intent: str, intent_entities: dict, travel_context: TravelContext) -> list:
        messages = [
            {
                "role": "system",
                "content": self._get_system_prompt(intent),
            },
            {
                "role": "system",
                "content": (
                    f"Detected entities: {intent_entities}. "
                    f"Travel context:\n{self._format_travel_context(travel_context)}"
                ),
            },
        ]
        messages.extend(self.history[-8:])
        return messages

    def _get_system_prompt(self, intent: str) -> str:
        return (
            "You are Excursa Assistant, a premium travel assistant inside a social travel app. "
            "Answer in Turkish when the user writes Turkish. "
            "You are Turkey-focused for city discovery, trip planning and local food questions. "
            "You create city-based travel plans, divide plans by the exact requested number of days, "
            "and personalize suggestions using user interests such as history, nature, food, entertainment, and shopping. "
            "If the user asks what to eat or famous local dishes, answer with local foods and do not invent restaurant names. "
            "Use internal Excursa POIs and routes first, but do not limit yourself to them: if a city has obvious important "
            "landmarks missing from internal POIs, you may use general travel knowledge to complete the plan. "
            "For historical or cultural places, include short, natural cultural context explaining why the place matters. "
            "Never recommend hotels or accommodation unless the user explicitly asks for lodging. "
            "For day plans use clear headings like 'Gun 1:' and concise bullet points. "
            "If the request is outside travel/app scope, politely refuse and redirect to travel help. "
            f"Current intent: {intent}."
        )

    def _format_travel_context(self, context: TravelContext) -> str:
        if not context.has_travel_data():
            return "No internal or general travel candidates available."

        lines = [
            f"city={context.city or 'unknown'}",
            f"days={context.days or 'not specified'}",
            f"themes={context.themes}",
            f"intent={context.intent}",
            f"user_interests={context.user_interests}",
            f"foods={context.foods}",
            "candidates:",
        ]
        for place in context.candidates[:10]:
            lines.append(
                f"- {place.name} | category={place.category} | source={place.source} | "
                f"score={round(place.score, 3)} | note={place.note} | cultural_note={place.cultural_note}"
            )
        if context.routes:
            lines.append("routes:")
            for route in context.routes[:3]:
                lines.append(f"- {route.get('title')} | stops={route.get('stops')}")
        return "\n".join(lines)

    def _source_metadata(self, context: TravelContext) -> list:
        return [
            {
                "type": "poi" if place.source == "internal_poi" else "general_place",
                "name": place.name,
                "source": place.source,
                "score": round(place.score, 4),
            }
            for place in context.candidates[:8]
        ]
