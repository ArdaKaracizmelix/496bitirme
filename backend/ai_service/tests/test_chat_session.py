import unittest
from unittest.mock import patch
from ai_service.services.chat_session import ChatSession


class ChatSessionTest(unittest.TestCase):

    @patch("ai_service.services.chat_session.LLMClient")
    def test_process_message(self, mock_llm_client_class):

        # Fake LLM cevabı
        mock_llm_instance = mock_llm_client_class.return_value
        mock_llm_instance.generate_response.return_value = (
            "Ankara'da hafta sonu için Anıtkabir ve Hamamönü'nü ziyaret edebilirsiniz."
        )

        chat = ChatSession(user_id="test-user")

        result = chat.process_message("Bana Ankara için gezi öner")

        # Intent doğru mu
        self.assertEqual(result["intent"], "travel_recommendation")

        # LLM cevabı doğru mu
        self.assertEqual(
            result["response"],
            "Ankara'da hafta sonu için Anıtkabir ve Hamamönü'nü ziyaret edebilirsiniz."
        )

        # History kontrol
        self.assertEqual(len(result["history"]), 2)
        self.assertEqual(result["history"][0]["role"], "user")
        self.assertEqual(result["history"][1]["role"], "assistant")


if __name__ == "__main__":
    unittest.main()