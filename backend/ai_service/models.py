"""
AI Assistant Models - Chat sessions and message storage.
"""
import uuid
from django.db import models
from django.conf import settings


class ChatSession(models.Model):
    """
    Represents a conversation session between a user and the AI assistant.
    Each session maintains conversation context and history.
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_sessions',
        null=True,
        blank=True,
        help_text="User associated with this chat session"
    )
    session_id = models.CharField(
        max_length=255,
        unique=True,
        help_text="Unique identifier for the conversation context"
    )
    title = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Optional title/topic of the conversation"
    )
    context_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Stores GPS coordinates and other context for recommendations"
    )
    conversation_history = models.JSONField(
        default=list,
        blank=True,
        help_text="Stores full conversation history for offline access"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', '-updated_at']),
            models.Index(fields=['session_id']),
        ]
    
    def __str__(self):
        return f"ChatSession({self.session_id}) - {self.user}"


class ChatMessage(models.Model):
    """
    Stores individual messages in a chat session.
    Supports text, cards, and rich content types.
    """
    
    class MessageType(models.TextChoices):
        TEXT = 'text', 'Text'
        CARD = 'card', 'Card'
        RICHTEXT = 'richtext', 'Rich Text'
        SUGGESTION = 'suggestion', 'Suggestion'
    
    class Sender(models.TextChoices):
        USER = 'user', 'User'
        BOT = 'bot', 'Bot'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name='messages',
        help_text="Chat session this message belongs to"
    )
    sender = models.CharField(
        max_length=10,
        choices=Sender.choices,
        help_text="Who sent the message (user or bot)"
    )
    message_type = models.CharField(
        max_length=50,
        choices=MessageType.choices,
        default=MessageType.TEXT,
        help_text="Type of message content"
    )
    content = models.TextField(help_text="Text content of the message")
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional data (cards, suggestions, etc.)"
    )
    intent = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Detected intent from NLP engine"
    )
    confidence = models.FloatField(
        default=0.0,
        help_text="Confidence score of intent detection (0.0-1.0)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['session', 'created_at']),
            models.Index(fields=['sender']),
        ]
    
    def __str__(self):
        return f"{self.sender}: {self.content[:50]}..."
