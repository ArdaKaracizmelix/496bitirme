import re
import unicodedata
from dataclasses import dataclass, field

from ai_service.services.turkey_city_knowledge import CITY_GUIDES


@dataclass
class IntentResult:
    intent: str
    confidence: float
    in_scope: bool
    reason: str = ""
    entities: dict = field(default_factory=dict)


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower().strip()


class NLPIntentParser:
    """
    Deterministic parser for Excursa travel scope.

    It extracts city, duration and topic before the LLM gets involved, so food
    and route questions do not fall into vague general chat.
    """

    THEME_KEYWORDS = {
        "history": [
            "tarih", "tarihi", "kultur", "kulturel", "muze", "museum", "antik",
            "kale", "saray", "arkeoloji", "camii", "cami", "kilise", "medrese",
        ],
        "nature": [
            "doga", "dogal", "park", "sahil", "deniz", "manzara", "yuruyus",
            "gol", "göl", "vadi", "orman", "yayla", "selale", "tabiat",
        ],
        "food": [
            "yemek", "yenir", "yiyeyim", "yemeliyim", "lezzet", "gastronomi",
            "restaurant", "restoran", "cafe", "kahve", "kebap", "tatli",
            "meshuru", "meşhuru", "meshur", "meşhur", "mutfak",
        ],
        "entertainment": ["eglence", "gece", "bar", "konser", "aktivite", "festival"],
        "shopping": ["alisveris", "pazar", "market", "carsi", "çarşı", "mall", "magaza"],
    }

    INTENT_KEYWORDS = {
        "trip_plan": ["rota", "plan", "program", "itinerary", "gunluk", "gun gun", "planla", "hazirla"],
        "food_recommendation": THEME_KEYWORDS["food"],
        "historical_places": THEME_KEYWORDS["history"],
        "nature_recommendation": THEME_KEYWORDS["nature"],
        "place_recommendation": ["gezilecek", "gezi", "gez", "yer", "mekan", "oner", "oneri", "tavsiye", "nereye"],
        "mixed_city_guide": ["ne yapilir", "ne yapılır", "rehber", "sehir", "şehir", "kesif", "keşif"],
        "location_query": ["konum", "location", "nerede", "where", "adres", "yakin"],
        "help": ["yardim", "help", "destek", "ne yapabilirsin", "neler yaparsin"],
        "community": ["topluluk", "community", "akis", "feed", "profil", "yorum", "post"],
        "greeting": ["merhaba", "selam", "hello", "hi", "hey"],
    }

    OUT_OF_SCOPE_KEYWORDS = [
        "matematik", "denklem", "integral", "kod yaz", "python", "java",
        "siyaset", "borsa", "kripto", "bitcoin", "doktor", "hukuk",
        "odev", "haber", "film oner", "oyun",
    ]

    TRAVEL_NOISE = {
        "bana", "icin", "için", "gun", "gün", "gunde", "günde", "gunluk",
        "gezi", "gezilecek", "oner", "öner", "oneri", "öneri", "plan",
        "rota", "yap", "hazirla", "hazırla", "nereleri", "nereye",
        "tarihi", "tarih", "kultur", "kültür", "doga", "doğa", "yemek",
        "yenir", "meshuru", "meşhuru", "meshur", "meşhur",
    }

    def __init__(self):
        self.city_aliases = {
            city: [normalize_text(city), *[normalize_text(alias) for alias in guide.get("aliases", [])]]
            for city, guide in CITY_GUIDES.items()
        }

    def parse_intent(self, message: str) -> str:
        return self.classify(message).intent

    def classify(self, message: str) -> IntentResult:
        normalized = normalize_text(message)
        entities = self.extract_entities(normalized, original_message=message)

        if not normalized:
            return IntentResult("out_of_scope", 0.9, False, "empty_message", entities)

        if any(keyword in normalized for keyword in self.OUT_OF_SCOPE_KEYWORDS):
            return IntentResult("out_of_scope", 0.88, False, "non_travel_topic", entities)

        if self._looks_like_math_or_code(normalized):
            return IntentResult("out_of_scope", 0.85, False, "math_or_code", entities)

        intent = self._score_intent(normalized, entities)
        if intent in {"greeting", "help", "community"}:
            return IntentResult(intent, 0.78, True, entities=entities)

        if entities.get("city") and intent == "general_chat":
            intent = "mixed_city_guide"

        if intent != "general_chat":
            return IntentResult(intent, 0.82, True, entities=entities)

        return IntentResult("out_of_scope", 0.64, False, "no_travel_signal", entities)

    def extract_entities(self, normalized_message: str, original_message: str = "") -> dict:
        entities = {}
        city = self._extract_city(normalized_message)
        if city:
            entities["city"] = city

        day_match = re.search(
            r"(\d+)\s*(gunluk|gun|gunde|gune|days?|day)|"
            r"(bir|iki|uc|üç|dort|dört|bes|beş|alti|altı|yedi)\s*(gunluk|gun|gunde|gune)",
            normalized_message,
        )
        if day_match:
            entities["days"] = self._parse_day_value(day_match.group(1) or day_match.group(3))

        themes = [
            theme
            for theme, keywords in self.THEME_KEYWORDS.items()
            if any(self._keyword_matches(normalized_message, keyword) for keyword in keywords)
        ]
        if themes:
            entities["themes"] = themes
            entities["interests"] = themes

        if "city" not in entities:
            destination = self._extract_destination_candidate(normalized_message, original_message)
            if destination:
                entities["destination_candidate"] = destination
                entities["city"] = destination

        return entities

    def _extract_city(self, normalized_message: str) -> str:
        for city, aliases in self.city_aliases.items():
            for alias in aliases:
                if alias and self._phrase_matches(normalized_message, alias):
                    return city
        return ""

    def _score_intent(self, normalized: str, entities: dict) -> str:
        scores = {}
        for intent, keywords in self.INTENT_KEYWORDS.items():
            scores[intent] = sum(1 for keyword in keywords if self._keyword_matches(normalized, keyword))

        if entities.get("days") and entities.get("city"):
            scores["trip_plan"] = scores.get("trip_plan", 0) + 3
        if "food" in entities.get("themes", []):
            scores["food_recommendation"] = scores.get("food_recommendation", 0) + 3
        if "history" in entities.get("themes", []):
            scores["historical_places"] = scores.get("historical_places", 0) + 2
        if "nature" in entities.get("themes", []):
            scores["nature_recommendation"] = scores.get("nature_recommendation", 0) + 2
        if entities.get("city"):
            scores["place_recommendation"] = scores.get("place_recommendation", 0) + 1

        best_intent, best_score = max(scores.items(), key=lambda item: item[1])
        return best_intent if best_score > 0 else "general_chat"

    def _parse_day_value(self, raw_value) -> int:
        word_numbers = {
            "bir": 1,
            "iki": 2,
            "uc": 3,
            "üç": 3,
            "dort": 4,
            "dört": 4,
            "bes": 5,
            "beş": 5,
            "alti": 6,
            "altı": 6,
            "yedi": 7,
        }
        value = str(raw_value or "").lower()
        if value.isdigit():
            return max(1, min(int(value), 7))
        return word_numbers.get(value, 1)

    def _extract_destination_candidate(self, normalized_message: str, original_message: str) -> str:
        tokens = [
            token.strip(".,!?;:()[]{}")
            for token in str(original_message or normalized_message).split()
        ]
        candidates = []
        for token in tokens:
            normalized_token = normalize_text(token)
            if (
                len(normalized_token) >= 3
                and normalized_token.replace("-", "").isalpha()
                and normalized_token not in self.TRAVEL_NOISE
                and normalized_token not in self.OUT_OF_SCOPE_KEYWORDS
            ):
                candidates.append(token.strip(".,!?;:()[]{}"))

        if not candidates:
            return ""
        if any(self._keyword_matches(normalized_message, keyword) for keyword in self.INTENT_KEYWORDS["place_recommendation"] + self.INTENT_KEYWORDS["trip_plan"]):
            candidate = candidates[0]
            return candidate[:1].upper() + candidate[1:]
        return ""

    def _looks_like_math_or_code(self, normalized: str) -> bool:
        has_math_symbols = bool(re.search(r"\d+\s*[\+\-\*\/=]\s*\d+", normalized))
        code_terms = ["function", "class", "console.log", "select *", "def ", "import "]
        return has_math_symbols or any(term in normalized for term in code_terms)

    def _phrase_matches(self, normalized: str, phrase: str) -> bool:
        if " " in phrase:
            return phrase in normalized
        return self._keyword_matches(normalized, phrase)

    def _keyword_matches(self, normalized: str, keyword: str) -> bool:
        keyword = normalize_text(keyword)
        if len(keyword) <= 3:
            return keyword in set(re.findall(r"\w+", normalized))
        return keyword in normalized
