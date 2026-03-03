from rest_framework import serializers
from .models import Notification, DeviceToken, NotificationVerb, DevicePlatform


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for Notification model"""
    actor_name = serializers.CharField(
        source='actor.user.username',
        read_only=True,
        allow_null=True
    )
    actor_id = serializers.UUIDField(
        source='actor.id',
        read_only=True,
        allow_null=True
    )
    recipient_id = serializers.UUIDField(
        source='recipient.id',
        read_only=True
    )
    deep_link = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = Notification
        fields = [
            'id',
            'recipient_id',
            'actor_id',
            'actor_name',
            'verb',
            'title',
            'body',
            'target_object_id',
            'is_read',
            'data',
            'deep_link',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
            'deep_link',
            'recipient_id',
            'actor_name',
            'actor_id',
        ]
    
    def get_deep_link(self, obj):
        """Get the deep link for the notification"""
        return obj.get_deep_link()


class NotificationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating notifications"""
    
    class Meta:
        model = Notification
        fields = [
            'recipient',
            'actor',
            'verb',
            'title',
            'body',
            'target_object_id',
            'data',
        ]
    
    def validate_verb(self, value):
        """Validate that verb is a valid choice"""
        if value not in NotificationVerb.values:
            raise serializers.ValidationError(
                f"Invalid verb. Must be one of: {', '.join(NotificationVerb.values)}"
            )
        return value


class NotificationListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing notifications"""
    actor_name = serializers.CharField(
        source='actor.user.username',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = Notification
        fields = [
            'id',
            'verb',
            'title',
            'body',
            'actor_name',
            'is_read',
            'created_at',
        ]
        read_only_fields = fields


class DeviceTokenSerializer(serializers.ModelSerializer):
    """Serializer for DeviceToken model"""
    user_id = serializers.IntegerField(
        source='user.id',
        read_only=True
    )
    username = serializers.CharField(
        source='user.username',
        read_only=True
    )
    
    class Meta:
        model = DeviceToken
        fields = [
            'id',
            'user_id',
            'username',
            'token',
            'platform',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'user_id',
            'username',
            'created_at',
            'updated_at',
        ]
        extra_kwargs = {
            'token': {'write_only': True},
        }


class DeviceTokenRegisterSerializer(serializers.Serializer):
    """Serializer for registering new device tokens"""
    token = serializers.CharField(max_length=500)
    platform = serializers.ChoiceField(
        choices=DevicePlatform.choices,
        default=DevicePlatform.ANDROID
    )
    
    def validate_platform(self, value):
        """Validate platform choice"""
        if value not in DevicePlatform.values:
            raise serializers.ValidationError(
                f"Invalid platform. Must be one of: {', '.join(DevicePlatform.values)}"
            )
        return value


class NotificationUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating notification read status"""
    
    class Meta:
        model = Notification
        fields = ['is_read']


class BulkNotificationSerializer(serializers.Serializer):
    """Serializer for bulk operations on notifications"""
    notification_ids = serializers.ListField(
        child=serializers.UUIDField(),
        help_text="List of notification IDs to update"
    )
    action = serializers.ChoiceField(
        choices=['mark_as_read', 'mark_as_unread', 'delete'],
        help_text="Action to perform on the notifications"
    )
