import os
from pathlib import Path

import requests
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[3]
load_dotenv(BASE_DIR / ".env")

class LLMClient:
    """
    Generic OpenAI-compatible LLM API client.
    Can be used with open-source hosted models if the provider exposes
    an OpenAI-compatible /chat/completions endpoint.
    """

    def __init__(self):
        self.api_key = os.getenv("LLM_API_KEY")
        self.api_url = os.getenv("LLM_API_URL")
        self.model = os.getenv("LLM_MODEL", "open-source-model")

        if not self.api_url:
            raise ValueError("LLM_API_URL is not set.")
        if not self.api_key:
            raise ValueError("LLM_API_KEY is not set.")

    def generate_response(self, messages: list, temperature: float = 0.7, max_tokens: int = 400) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        response = requests.post(
            self.api_url,
            headers=headers,
            json=payload,
            timeout=60,
        )

        response.raise_for_status()
        data = response.json()

        return data["choices"][0]["message"]["content"].strip()