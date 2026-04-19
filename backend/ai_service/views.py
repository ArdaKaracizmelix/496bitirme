"""
API views for AI Assistant endpoints.
Handles chat sessions and message management.
"""
import logging
import json
import uuid
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import ChatSession, ChatMessage
from .serializers import (
    ChatSessionDetailSerializer,
    ChatSessionListSerializer,
    ChatSessionCreateSerializer,
    ChatMessageSerializer,
    ChatMessageCreateSerializer,
)
from .services.chat_session import ChatSession as ChatSessionService

logger = logging.getLogger(__name__)

def _build_chat_service(user_id=None, history=None):
    """
    Build an isolated chat service instance.
    Optionally hydrate with prior history.
    """
    service = ChatSessionService(user_id=user_id)

    if history:
        normalized = []
        for item in history:
            role = item.get("role")
            if role not in ("user", "assistant"):
                item_type = item.get("type")
                role = "assistant" if item_type == "bot" else "user"

            content = item.get("content")
            if role in ("user", "assistant") and isinstance(content, str):
                normalized.append({"role": role, "content": content})

        service.history = normalized

    return service


@csrf_exempt
def chat_api(request):
    """
    Legacy endpoint for chat API.
    Maintains backward compatibility with existing frontend implementations.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Only POST method is allowed."}, status=405)

    try:
        body = json.loads(request.body)
        message = body.get("message", "").strip()

        if not message:
            return JsonResponse({"error": "Message cannot be empty."}, status=400)

        service = _build_chat_service(user_id="legacy-user")
        result = service.process_message(message)

        return JsonResponse({
            "intent": result["intent"],
            "response": result["response"],
            "history": result["history"],
            "metadata": result.get("metadata", {}),
        }, status=200)

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    except Exception as e:
        logger.error(f"Chat API error: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)


class ChatSessionViewSet(viewsets.ModelViewSet):
    """
    API endpoints for managing chat sessions.
    Supports creating, listing, and retrieving conversation sessions.
    """
    
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Return sessions for current user"""
        user = self.request.user
        if user.is_authenticated:
            return ChatSession.objects.filter(user=user)
        return ChatSession.objects.none()
    
    def get_serializer_class(self):
        """Choose serializer based on action"""
        if self.action == 'list':
            return ChatSessionListSerializer
        elif self.action == 'create':
            return ChatSessionCreateSerializer
        return ChatSessionDetailSerializer
    
    def perform_create(self, serializer):
        """Create a new chat session for the user"""
        serializer.save(user=self.request.user)
    
    @action(detail=True, methods=['post'])
    def send_message(self, request, pk=None):
        """
        Send a message in a specific chat session.
        POST /api/ai_service/sessions/{pk}/send_message/
        """
        session = self.get_object()
        
        serializer = ChatMessageCreateSerializer(data=request.data)
        if serializer.is_valid():
            try:
                # Create the message
                message = serializer.save(
                    session=session,
                )
                
                # If it's a user message, process it with the chat service
                if message.sender == ChatMessage.Sender.USER:
                    service = _build_chat_service(
                        user_id=str(session.user_id) if session.user_id else None,
                        history=session.conversation_history,
                    )
                    result = service.process_message(message.content)
                    
                    # Update message with detected intent
                    message.intent = result.get("intent", "")
                    message.confidence = result.get("confidence", 0.0)
                    message.save(update_fields=['intent', 'confidence'])
                    
                    # Create bot response message
                    bot_response = ChatMessage.objects.create(
                        session=session,
                        sender=ChatMessage.Sender.BOT,
                        message_type=ChatMessage.MessageType.TEXT,
                        content=result.get("response", ""),
                        metadata=result.get("metadata", {}),
                        intent=result.get("intent", ""),
                        confidence=result.get("confidence", 0.0),
                    )
                    
                    # Update session's conversation history
                    history = session.conversation_history or []
                    history.append({
                        'type': 'user',
                        'content': message.content,
                        'timestamp': message.created_at.isoformat(),
                    })
                    history.append({
                        'type': 'bot',
                        'content': bot_response.content,
                        'timestamp': bot_response.created_at.isoformat(),
                    })
                    session.conversation_history = history
                    session.save(update_fields=['conversation_history', 'updated_at'])
                    
                    return Response({
                        'user_message': ChatMessageSerializer(message).data,
                        'bot_message': ChatMessageSerializer(bot_response).data,
                    }, status=status.HTTP_201_CREATED)
                
                return Response(
                    ChatMessageSerializer(message).data,
                    status=status.HTTP_201_CREATED
                )
            
            except Exception as e:
                logger.error(f"Error processing message: {str(e)}")
                # Graceful fallback: keep chat usable even if LLM config/service is unavailable.
                if message.sender == ChatMessage.Sender.USER:
                    bot_response = ChatMessage.objects.create(
                        session=session,
                        sender=ChatMessage.Sender.BOT,
                        message_type=ChatMessage.MessageType.TEXT,
                        content=(
                            "Asistan servisi su anda kullanilamiyor. "
                            "Lutfen daha sonra tekrar deneyin."
                        ),
                    )
                    return Response(
                        {
                            "user_message": ChatMessageSerializer(message).data,
                            "bot_message": ChatMessageSerializer(bot_response).data,
                            "warning": str(e),
                        },
                        status=status.HTTP_201_CREATED,
                    )

                return Response(
                    {"error": str(e)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def clear_history(self, request, pk=None):
        """
        Clear all messages in a chat session.
        POST /api/ai_service/sessions/{pk}/clear_history/
        """
        session = self.get_object()
        session.messages.all().delete()
        session.conversation_history = []
        session.save()
        
        return Response({"status": "History cleared"}, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        """
        Get all messages in a chat session with pagination.
        GET /api/ai_service/sessions/{pk}/messages/
        """
        session = self.get_object()
        messages = session.messages.all()
        
        # Implement pagination
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 50))
        start = (page - 1) * page_size
        end = start + page_size
        
        paginated_messages = messages[start:end]
        serializer = ChatMessageSerializer(paginated_messages, many=True)
        
        return Response({
            'count': messages.count(),
            'page': page,
            'page_size': page_size,
            'results': serializer.data,
        })

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """
        Alias endpoint for message history in a chat session.
        GET /api/ai/sessions/{pk}/history/
        """
        return self.messages(request, pk=pk)


class ChatMessageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only API for accessing chat messages.
    """
    
    permission_classes = [IsAuthenticated]
    serializer_class = ChatMessageSerializer
    
    def get_queryset(self):
        """Return messages from user's sessions"""
        user = self.request.user
        if user.is_authenticated:
            queryset = ChatMessage.objects.filter(session__user=user)

            ids = self.request.query_params.getlist("ids")
            if ids:
                queryset = queryset.filter(id__in=ids)

            query = self.request.query_params.get("q")
            if query:
                queryset = queryset.filter(content__icontains=query)

            session_id = self.request.query_params.get("session_id")
            if session_id:
                session_filter = Q(session__session_id=session_id)
                try:
                    parsed_uuid = uuid.UUID(session_id)
                    session_filter = session_filter | Q(session_id=parsed_uuid)
                except (ValueError, TypeError):
                    pass

                queryset = queryset.filter(session_filter)

            return queryset
        return ChatMessage.objects.none()

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        """
        Search message history by text, scoped to authenticated user.
        GET /api/ai/messages/search/?q=<query>&session_id=<optional>
        """
        query = (request.query_params.get("q") or "").strip()
        if not query:
            return Response(
                {"error": "Query parameter 'q' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset().filter(content__icontains=query)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="by_ids")
    def by_ids(self, request):
        """
        Fetch specific messages by IDs, scoped to authenticated user.
        GET /api/ai/messages/by_ids/?ids=<uuid>&ids=<uuid>
        """
        ids = request.query_params.getlist("ids")
        if not ids:
            return Response(
                {"error": "At least one 'ids' query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset().filter(id__in=ids)
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "count": queryset.count(),
                "results": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
