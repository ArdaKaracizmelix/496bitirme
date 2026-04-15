"""
DRF Serializers for AI Assistant models.
"""
from rest_framework import serializers
from .models import ChatSession, ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    """
    Serializer for individual chat messages.
    Handles text and rich content rendering.
    """
    
    class Meta:
        model = ChatMessage
        fields = [
            'id',
            'sender',
            'message_type',
            'content',
            'metadata',
            'intent',
            'confidence',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'intent', 'confidence']


class ChatSessionDetailSerializer(serializers.ModelSerializer):
    """
    Detailed serializer for chat sessions with full message history.
    """
    
    messages = ChatMessageSerializer(many=True, read_only=True)
    
    class Meta:
        model = ChatSession
        fields = [
            'id',
            'session_id',
            'title',
            'context_data',
            'messages',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ChatSessionListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for chat session list view.
    """
    
    last_message = serializers.SerializerMethodField()
    message_count = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatSession
        fields = [
            'id',
            'session_id',
            'title',
            'last_message',
            'message_count',
            'updated_at',
        ]
        read_only_fields = ['id']
    
    def get_last_message(self, obj):
        """Get the most recent message in the session"""
        last_msg = obj.messages.last()
        if last_msg:
            return ChatMessageSerializer(last_msg).data
        return None
    
    def get_message_count(self, obj):
        """Get total message count in session"""
        return obj.messages.count()


class ChatSessionCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating new chat sessions.
    """
    
    class Meta:
        model = ChatSession
        fields = [
            'id',
            'session_id',
            'title',
            'context_data',
            'created_at',
            'updated_at',
        ]
        extra_kwargs = {
            'session_id': {'required': True},
            'title': {'required': False},
            'id': {'read_only': True},
            'created_at': {'read_only': True},
            'updated_at': {'read_only': True},
        }


class ChatMessageCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating new chat messages.
    """
    
    class Meta:
        model = ChatMessage
        fields = [
            'sender',
            'message_type',
            'content',
            'metadata',
        ]
        extra_kwargs = {
            'sender': {'required': True},
            'content': {'required': True},
            'message_type': {'required': False},
        }
