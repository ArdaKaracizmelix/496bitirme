class NLPIntentParser:
    """
    Lightweight intent parser.
    Main goal is not to fully answer the user,
    but to help the chatbot shape context before calling the LLM.
    """

    def __init__(self):
        self.intent_keywords = {
            "greeting": ["merhaba", "selam", "hello", "hi"],
            "travel_recommendation": ["gezi", "trip", "rota", "öneri", "recommend", "tatil"],
            "location_query": ["konum", "location", "nerede", "where", "adres"],
            "help": ["yardım", "help", "destek"],
            "community": ["topluluk", "community", "grup", "forum"],
        }

    def parse_intent(self, message: str) -> str:
        message_lower = message.lower()

        for intent, keywords in self.intent_keywords.items():
            for keyword in keywords:
                if keyword in message_lower:
                    return intent

        return "general_chat"