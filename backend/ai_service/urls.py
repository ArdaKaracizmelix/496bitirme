"""
URL routing for AI Assistant app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChatSessionViewSet, ChatMessageViewSet, chat_api

router = DefaultRouter()
router.register(r'sessions', ChatSessionViewSet, basename='chat-session')
router.register(r'messages', ChatMessageViewSet, basename='chat-message')

app_name = 'ai_service'

urlpatterns = [
    # DRF router endpoints
    path('', include(router.urls)),
    
    # Legacy chat API endpoint for backward compatibility
    path('chat/', chat_api, name='chat_api'),
]