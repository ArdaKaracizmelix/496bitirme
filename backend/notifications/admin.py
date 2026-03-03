from django.contrib import admin
from .models import Notification, DeviceToken


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    """Admin interface for Notification model"""
    list_display = (
        'id',
        'recipient',
        'actor',
        'verb',
        'title',
        'is_read',
        'created_at',
    )
    list_filter = ('verb', 'is_read', 'created_at', 'updated_at')
    search_fields = ('title', 'body', 'recipient__user__username', 'actor__user__username')
    readonly_fields = ('id', 'created_at', 'updated_at')
    fieldsets = (
        ('Basic Info', {
            'fields': ('id', 'recipient', 'actor', 'verb')
        }),
        ('Content', {
            'fields': ('title', 'body', 'target_object_id', 'data')
        }),
        ('Status', {
            'fields': ('is_read',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_readonly_fields(self, request, obj=None):
        if obj:  # Editing an existing object
            return self.readonly_fields + ('recipient', 'actor', 'verb', 'title', 'body')
        return self.readonly_fields


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    """Admin interface for DeviceToken model"""
    list_display = (
        'id',
        'user',
        'platform',
        'is_active',
        'created_at',
        'updated_at',
    )
    list_filter = ('platform', 'is_active', 'created_at', 'updated_at')
    search_fields = ('user__username', 'token')
    readonly_fields = ('id', 'token', 'created_at', 'updated_at')
    fieldsets = (
        ('Device Info', {
            'fields': ('id', 'user', 'platform', 'token')
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_readonly_fields(self, request, obj=None):
        if obj:  # Editing an existing object
            return self.readonly_fields + ('user', 'platform')
        return self.readonly_fields
