from django.contrib import admin
from django.utils.html import format_html
from .models import TimeStampedModel


class TimeStampedModelAdmin(admin.ModelAdmin):
    """
    Base admin class for models that inherit from TimeStampedModel.
    
    Provides common functionality for viewing and managing timestamp fields
    and soft-delete status across all timestamped models.
    """
    
    readonly_fields = ['created_at', 'updated_at']
    list_filter = ['is_deleted', 'created_at', 'updated_at']
    actions = ['soft_delete_action', 'restore_action']
    
    fieldsets = (
        (None, {
            'fields': ('created_at', 'updated_at', 'is_deleted'),
        }),
    )
    
    def soft_delete_action(self, request, queryset):
        """Admin action to soft-delete selected records."""
        count = 0
        for obj in queryset:
            obj.soft_delete()
            count += 1
        self.message_user(request, f"{count} record(s) soft-deleted successfully.")
    soft_delete_action.short_description = "Soft delete selected records"
    
    def restore_action(self, request, queryset):
        """Admin action to restore soft-deleted records."""
        count = queryset.filter(is_deleted=True).update(is_deleted=False)
        self.message_user(request, f"{count} record(s) restored successfully.")
    restore_action.short_description = "Restore selected records"
    
    def get_queryset(self, request):
        """Override to optionally show soft-deleted records."""
        queryset = super().get_queryset(request)
        # Show all records including soft-deleted ones in admin for recovery purposes
        return queryset
    
    def is_deleted_display(self, obj):
        """Display soft-delete status with visual indicator."""
        if obj.is_deleted:
            return format_html(
                '<span style="color: red;">🗑️ Deleted</span>'
            )
        return format_html(
            '<span style="color: green;">✓ Active</span>'
        )
    is_deleted_display.short_description = 'Status'

