from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page

from .models import Notification, DeviceToken, NotificationVerb
from .serializers import (
    NotificationSerializer,
    NotificationCreateSerializer,
    NotificationListSerializer,
    NotificationUpdateSerializer,
    DeviceTokenSerializer,
    DeviceTokenRegisterSerializer,
    BulkNotificationSerializer,
)
from .services import get_push_service


class NotificationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing user notifications.
    
    GET /notifications/ - List user's notifications
    POST /notifications/ - Create a notification (admin only)
    GET /notifications/{id}/ - Get notification detail
    PATCH /notifications/{id}/ - Mark as read/unread
    DELETE /notifications/{id}/ - Delete notification
    
    Custom actions:
    - POST /notifications/mark-as-read/ - Mark multiple as read
    - POST /notifications/mark-as-unread/ - Mark multiple as unread
    - POST /notifications/bulk-delete/ - Delete multiple
    - GET /notifications/unread-count/ - Get count of unread notifications
    - GET /notifications/by-verb/ - Filter by notification type
    """
    
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return NotificationCreateSerializer
        elif self.action == 'list':
            return NotificationListSerializer
        elif self.action in ['update', 'partial_update']:
            return NotificationUpdateSerializer
        return NotificationSerializer
    
    def get_queryset(self):
        """Return notifications for the current user"""
        user = self.request.user
        try:
            user_profile = user.profile
            queryset = Notification.objects.filter(recipient=user_profile)
            
            # Filter by read status if provided
            is_read = self.request.query_params.get('is_read')
            if is_read is not None:
                is_read = is_read.lower() == 'true'
                queryset = queryset.filter(is_read=is_read)
            
            # Filter by verb if provided
            verb = self.request.query_params.get('verb')
            if verb and verb in NotificationVerb.values:
                queryset = queryset.filter(verb=verb)
            
            return queryset.order_by('-created_at')
        except:
            return Notification.objects.none()
    
    def perform_create(self, serializer):
        """Create a notification"""
        serializer.save()
    
    def perform_destroy(self, instance):
        """Delete a notification"""
        instance.delete()
    
    @action(detail=True, methods=['patch'])
    def mark_as_read(self, request, pk=None):
        """Mark a single notification as read"""
        notification = self.get_object()
        notification.mark_as_read()
        serializer = self.get_serializer(notification)
        return Response(serializer.data)
    
    @action(detail=True, methods=['patch'])
    def mark_as_unread(self, request, pk=None):
        """Mark a single notification as unread"""
        notification = self.get_object()
        notification.is_read = False
        notification.save(update_fields=['is_read', 'updated_at'])
        serializer = self.get_serializer(notification)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def mark_all_as_read(self, request):
        """Mark all unread notifications as read"""
        user = request.user
        try:
            user_profile = user.profile
            updated_count, _ = Notification.objects.filter(
                recipient=user_profile,
                is_read=False
            ).update(is_read=True)
            
            return Response(
                {'message': f'Marked {updated_count} notifications as read'},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get count of unread notifications for current user"""
        user = request.user
        try:
            user_profile = user.profile
            count = Notification.objects.filter(
                recipient=user_profile,
                is_read=False
            ).count()
            
            return Response(
                {'unread_count': count},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """Perform bulk operations on notifications"""
        serializer = BulkNotificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        user = request.user
        notification_ids = serializer.validated_data['notification_ids']
        action_type = serializer.validated_data['action']
        
        try:
            user_profile = user.profile
            # Ensure user can only modify their own notifications
            queryset = Notification.objects.filter(
                recipient=user_profile,
                id__in=notification_ids
            )
            
            if action_type == 'mark_as_read':
                updated_count, _ = queryset.update(is_read=True)
            elif action_type == 'mark_as_unread':
                updated_count, _ = queryset.update(is_read=False)
            elif action_type == 'delete':
                updated_count, _ = queryset.delete()
            else:
                return Response(
                    {'error': f'Unknown action: {action_type}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            return Response(
                {'message': f'Updated {updated_count} notifications', 'count': updated_count},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def by_verb(self, request):
        """Filter notifications by verb/type"""
        verb = request.query_params.get('verb')
        
        if not verb or verb not in NotificationVerb.values:
            return Response(
                {'error': f'Invalid verb. Must be one of: {", ".join(NotificationVerb.values)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user = request.user
        try:
            user_profile = user.profile
            notifications = Notification.objects.filter(
                recipient=user_profile,
                verb=verb
            ).order_by('-created_at')
            
            serializer = self.get_serializer(notifications, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class DeviceTokenViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing device tokens for push notifications.
    
    GET /device-tokens/ - List device tokens for current user
    POST /device-tokens/ - Register a new device token
    DELETE /device-tokens/{id}/ - Remove a device token
    
    Custom actions:
    - POST /device-tokens/register/ - Register device with token and platform
    """
    
    permission_classes = [IsAuthenticated]
    serializer_class = DeviceTokenSerializer
    
    def get_queryset(self):
        """Return device tokens for the current user"""
        return DeviceToken.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        """Create a device token for the current user"""
        serializer.save(user=self.request.user)
    
    @action(detail=False, methods=['post'])
    def register(self, request):
        """
        Register a new device token for push notifications.
        
        Expected payload:
        {
            "token": "abc123xyz",
            "platform": "Android" | "iOS" | "Web"
        }
        """
        serializer = DeviceTokenRegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        token = serializer.validated_data['token']
        platform = serializer.validated_data['platform']
        
        try:
            push_service = get_push_service()
            success = push_service.register_device(
                user=request.user,
                token=token,
                platform=platform
            )
            
            if success:
                device_token, _ = DeviceToken.objects.get_or_create(
                    token=token,
                    defaults={'user': request.user, 'platform': platform}
                )
                return Response(
                    {
                        'message': 'Device registered successfully',
                        'device_id': device_token.id
                    },
                    status=status.HTTP_201_CREATED
                )
            else:
                return Response(
                    {'error': 'Failed to register device'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active device tokens for current user"""
        tokens = self.get_queryset().filter(is_active=True)
        serializer = self.get_serializer(tokens, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def disable(self, request, pk=None):
        """Disable a device token"""
        token = self.get_object()
        token.is_active = False
        token.save()
        return Response(
            {'message': 'Device token disabled'},
            status=status.HTTP_200_OK
        )
    
    @action(detail=True, methods=['post'])
    def enable(self, request, pk=None):
        """Enable a device token"""
        token = self.get_object()
        token.is_active = True
        token.save()
        return Response(
            {'message': 'Device token enabled'},
            status=status.HTTP_200_OK
        )
    
    def perform_destroy(self, instance):
        """Delete a device token"""
        instance.delete()
