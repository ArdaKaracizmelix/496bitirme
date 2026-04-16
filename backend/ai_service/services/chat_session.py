from ai_service.services.nlp_intent_parser import NLPIntentParser
from ai_service.services.llm_client import LLMClient


class ChatSession:
    """
    Handles a multi-turn chatbot session.
    Keeps history, detects intent, builds prompts, and calls the LLM client.
    Falls back to a local travel assistant when LLM env/config is unavailable.
    """

    def __init__(self, user_id=None):
        self.user_id = user_id
        self.intent_parser = NLPIntentParser()
        self.llm_client = self._build_llm_client()
        self.history = []

    def process_message(self, message: str) -> dict:
        intent = self.intent_parser.parse_intent(message)

        self.history.append({
            "role": "user",
            "content": message,
        })

        messages = self._build_messages(intent=intent)
        llm_response = self._generate_response(
            messages=messages,
            intent=intent,
            message=message,
        )

        self.history.append({
            "role": "assistant",
            "content": llm_response,
        })

        return {
            "intent": intent,
            "response": llm_response,
            "history": self.history,
            "confidence": 0.85 if self.llm_client else 0.55,
        }

    def _build_llm_client(self):
        try:
            return LLMClient()
        except Exception:
            return None

    def _generate_response(self, messages: list, intent: str, message: str) -> str:
        if self.llm_client:
            try:
                return self.llm_client.generate_response(messages=messages)
            except Exception:
                pass

        return self._fallback_response(intent=intent, message=message)

    def _fallback_response(self, intent: str, message: str) -> str:
        message_lower = message.lower()

        if intent == "greeting":
            return (
                "Merhaba! Ben EXCURSA asistanin. Sehir, rota, gezi suresi veya "
                "ilgi alanlarini yazarsan sana hizlica oneriler sunabilirim."
            )

        if "istanbul" in message_lower:
            return (
                "Istanbul icin guzel bir baslangic rotasi: Sultanahmet, Ayasofya, "
                "Topkapi Sarayi, Galata ve Karakoy. Daha sakin bir plan istersen "
                "Balat, Kuzguncuk veya Moda tarafini da ekleyebiliriz."
            )

        if intent == "travel_recommendation":
            return (
                "Tabii. Sana daha iyi gezi onerisi yapmam icin sehir, kac gun "
                "kalacagin ve ilgi alanlarini yazabilir misin? Ornek: 'Istanbul, "
                "2 gun, tarih ve yemek'."
            )

        if intent == "location_query":
            return (
                "Konum icin hangi sehir veya mekanla ilgilendigini soylersen "
                "ulasim, yakin yerler ve rota onerisi seklinde yardimci olurum."
            )

        if intent == "help":
            return (
                "Sana gezi rotasi olusturma, gezilecek yer onerme, mekanlari "
                "rotaya ekleme ve seyahat fikirleri konusunda yardimci olabilirim."
            )

        if intent == "community":
            return (
                "Topluluk akisinda diger gezginlerin paylasimlarini gorebilir, "
                "yorum yapabilir ve kendi gezi anilarini paylasabilirsin."
            )

        return (
            "Bunu not aldim. Bana sehir, sure veya ilgi alanlarini biraz daha "
            "detayli yazarsan daha net bir seyahat onerisi hazirlayabilirim."
        )

    def _build_messages(self, intent: str) -> list:
        system_prompt = self._get_system_prompt(intent)

        messages = [
            {
                "role": "system",
                "content": system_prompt,
            }
        ]

        for item in self.history[-10:]:
            messages.append(item)

        return messages

    def _get_system_prompt(self, intent: str) -> str:
        base_prompt = (
            "You are a helpful AI chatbot for a travel-oriented application. "
            "You should respond naturally, clearly, and conversationally. "
            "Keep answers user-friendly and concise unless more detail is needed. "
            "If the user asks about travel, locations, routes, or recommendations, "
            "guide them in an interactive and helpful way."
        )

        intent_prompts = {
            "greeting": (
                "The user is greeting you. "
                "Respond warmly and invite them to continue."
            ),
            "travel_recommendation": (
                "The user likely wants travel recommendations. "
                "Ask follow-up questions if city, budget, duration, or interests are missing."
            ),
            "location_query": (
                "The user is asking about a location. "
                "Try to clarify which place they mean if the request is vague."
            ),
            "help": (
                "The user is asking what you can do. "
                "Explain your capabilities in the app context."
            ),
            "community": (
                "The user may be asking about community-related features. "
                "Respond in a helpful platform-assistant style."
            ),
            "general_chat": (
                "The user is chatting generally. "
                "Respond naturally and keep the conversation flowing."
            ),
        }

        return (
            f"{base_prompt}\n\nIntent guidance: "
            f"{intent_prompts.get(intent, intent_prompts['general_chat'])}"
        )
