import os
import requests
from dotenv import load_dotenv

load_dotenv()

class LLMClient:
    def __init__(self):
        self.api_key = os.getenv("LLM_API_KEY")
        self.api_url = os.getenv("LLM_API_URL")
        self.model = os.getenv("LLM_MODEL")

        if not self.api_key:
            raise ValueError("LLM_API_KEY bulunamadı.")
        if not self.api_url:
            raise ValueError("LLM_API_URL bulunamadı.")
        if not self.model:
            raise ValueError("LLM_MODEL bulunamadı.")

    def generate_response(self, messages, temperature=0.7, max_tokens=300):
        url = f"{self.api_url}/chat/completions"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=60
        )

        response.raise_for_status()

        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise ValueError("LLM response has no choices")

        first = choices[0] or {}
        message = first.get("message") or {}
        content = message.get("content")

        if isinstance(content, str) and content.strip():
            return content

        # Some providers return a content-part list.
        if isinstance(content, list):
            parts = []
            for part in content:
                if isinstance(part, str):
                    parts.append(part)
                elif isinstance(part, dict):
                    text = part.get("text")
                    if isinstance(text, str):
                        parts.append(text)
            joined = "\n".join([p for p in parts if p and p.strip()]).strip()
            if joined:
                return joined

        # Some providers (including reasoning-capable adapters) may put output
        # into a separate reasoning field while content is empty.
        reasoning = message.get("reasoning")
        if isinstance(reasoning, str) and reasoning.strip():
            return reasoning

        # Other provider variants (text completion style)
        text = first.get("text")
        if isinstance(text, str) and text.strip():
            return text

        delta = first.get("delta") or {}
        delta_content = delta.get("content")
        if isinstance(delta_content, str) and delta_content.strip():
            return delta_content

        raise ValueError("LLM response content is empty")
