from ai_service.services.nlp_intent_parser import NLPIntentParser
from ai_service.services.llm_client import LLMClient


class ChatSession:
    """
    Handles a multi-turn chatbot session.
    Keeps history, detects intent, builds prompts, and calls the LLM client.
    """

    def __init__(self, user_id=None):
        self.user_id = user_id
        self.intent_parser = NLPIntentParser()
        self.llm_client = LLMClient()
        self.history = []

    def process_message(self, message: str) -> dict:
        # Kullanıcının intentini bul
        intent = self.intent_parser.parse_intent(message)

        # Kullanıcı mesajını history'ye ekle
        self.history.append({
            "role": "user",
            "content": message
        })

        # LLM'e gönderilecek message listesini oluştur
        messages = self._build_messages(intent=intent)

        # LLM cevabını al
        llm_response = self.llm_client.generate_response(messages=messages)

        # Asistan cevabını history'ye ekle
        self.history.append({
            "role": "assistant",
            "content": llm_response
        })

        # Sonucu döndür
        return {
            "intent": intent,
            "response": llm_response,
            "history": self.history
        }

    def _build_messages(self, intent: str) -> list:
        system_prompt = self._get_system_prompt(intent)

        messages = [
            {
                "role": "system",
                "content": system_prompt
            }
        ]

        # Son 10 mesajı bağlam olarak ekle
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

        return f"{base_prompt}\n\nIntent guidance: {intent_prompts.get(intent, intent_prompts['general_chat'])}"