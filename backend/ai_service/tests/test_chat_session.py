import unittest

from ai_service.services.chat_session import ChatSession


class ChatSessionTest(unittest.TestCase):
    def test_food_question_returns_local_foods(self):
        chat = ChatSession(user_id=None)
        chat.llm_client = None

        result = chat.process_message("Gaziantep yemek oner")

        self.assertEqual(result["intent"], "food_recommendation")
        self.assertIn("baklava", result["response"].lower())
        self.assertIn("Restoran ismi uydurmuyorum", result["response"])

    def test_general_city_uses_hybrid_catalog_when_internal_poi_is_missing(self):
        chat = ChatSession(user_id=None)
        chat.llm_client = None

        result = chat.process_message("Sanliurfa 2 gunluk tarihi gezi plani yap")

        self.assertEqual(result["intent"], "trip_plan")
        self.assertIn("Gun 1:", result["response"])
        self.assertIn("Gun 2:", result["response"])
        self.assertNotIn("Gun 3:", result["response"])
        self.assertIn("Gobeklitepe", result["response"])

    def test_historical_place_recommendations_include_context(self):
        chat = ChatSession(user_id=None)
        chat.llm_client = None

        result = chat.process_message("Ankara tarihi yerler oner")

        self.assertEqual(result["intent"], "historical_places")
        self.assertIn("Anitkabir", result["response"])
        self.assertIn("Cumhuriyet", result["response"])

    def test_nature_question_uses_nature_candidates(self):
        chat = ChatSession(user_id=None)
        chat.llm_client = None

        result = chat.process_message("Rize dogal yerler oner")

        self.assertEqual(result["intent"], "nature_recommendation")
        self.assertIn("Ayder", result["response"])

    def test_out_of_scope_is_rejected(self):
        chat = ChatSession(user_id=None)
        chat.llm_client = None

        result = chat.process_message("2 + 2 kac eder?")

        self.assertEqual(result["intent"], "out_of_scope")
        self.assertFalse(result["metadata"]["in_scope"])
        self.assertIn("uygulama kapsamim disinda", result["response"])


if __name__ == "__main__":
    unittest.main()
