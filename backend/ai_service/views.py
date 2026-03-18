import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from ai_service.services.chat_session import ChatSession

# Geçici olarak tek bir session
chat_session = ChatSession(user_id="default-user")


@csrf_exempt
def chat_api(request):
    if request.method != "POST":
        return JsonResponse({"error": "Only POST method is allowed."}, status=405)

    try:
        body = json.loads(request.body)
        message = body.get("message", "").strip()

        if not message:
            return JsonResponse({"error": "Message cannot be empty."}, status=400)

        result = chat_session.process_message(message)

        return JsonResponse({
            "intent": result["intent"],
            "response": result["response"],
            "history": result["history"]
        }, status=200)

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)