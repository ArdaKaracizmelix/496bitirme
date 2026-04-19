import unittest

from ai_service.services.nlp_intent_parser import NLPIntentParser
from ai_service.services.turkey_city_knowledge import CITY_GUIDES


class NLPIntentParserTest(unittest.TestCase):
    def setUp(self):
        self.parser = NLPIntentParser()

    def test_has_81_turkey_city_guides(self):
        self.assertEqual(len(CITY_GUIDES), 81)

    def test_food_intent_extracts_city(self):
        result = self.parser.classify("Adana'da ne yenir?")

        self.assertEqual(result.intent, "food_recommendation")
        self.assertEqual(result.entities["city"], "Adana")
        self.assertIn("food", result.entities["themes"])

    def test_trip_plan_extracts_city_and_days(self):
        result = self.parser.classify("Sanliurfa 2 gunluk tarihi gezi plani yap")

        self.assertEqual(result.intent, "trip_plan")
        self.assertEqual(result.entities["city"], "Sanliurfa")
        self.assertEqual(result.entities["days"], 2)
        self.assertIn("history", result.entities["themes"])

    def test_historical_places_intent(self):
        result = self.parser.classify("Ankara tarihi yerler oner")

        self.assertEqual(result.intent, "historical_places")
        self.assertEqual(result.entities["city"], "Ankara")

    def test_nature_intent(self):
        result = self.parser.classify("Rize dogal yerler oner")

        self.assertEqual(result.intent, "nature_recommendation")
        self.assertEqual(result.entities["city"], "Rize")

    def test_out_of_scope_math(self):
        result = self.parser.classify("2 + 2 kac eder?")

        self.assertEqual(result.intent, "out_of_scope")
        self.assertFalse(result.in_scope)


if __name__ == "__main__":
    unittest.main()
