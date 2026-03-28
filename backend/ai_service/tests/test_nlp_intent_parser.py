import unittest
from ai_service.services.nlp_intent_parser import NLPIntentParser


class NLPIntentParserTest(unittest.TestCase):
    def setUp(self):
        self.parser = NLPIntentParser()

    def test_greeting_intent(self):
        self.assertEqual(self.parser.parse_intent("Merhaba chatbot"), "greeting")

    def test_travel_recommendation_intent(self):
        self.assertEqual(self.parser.parse_intent("Bana gezi öner"), "travel_recommendation")

    def test_location_query_intent(self):
        self.assertEqual(self.parser.parse_intent("Bu konum nerede"), "location_query")

    def test_help_intent(self):
        self.assertEqual(self.parser.parse_intent("Yardım eder misin"), "help")

    def test_general_chat_fallback(self):
        self.assertEqual(self.parser.parse_intent("Bugün biraz sohbet edelim"), "general_chat")


if __name__ == "__main__":
    unittest.main()