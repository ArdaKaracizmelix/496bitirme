from django.urls import path
from ai_service.views import chat_api

urlpatterns = [
    path("chat/", chat_api, name="chat_api"),
]