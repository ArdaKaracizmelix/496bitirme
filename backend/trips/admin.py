from django.contrib import admin
from .models import Itinerary, ItineraryItem


@admin.register(Itinerary)
class ItineraryAdmin(admin.ModelAdmin):
    """
    Admin interface for Itinerary model.
    """
    list_display = ['title', 'user', 'status', 'visibility', 'start_date', 'end_date', 'estimated_cost', 'created_at']
    list_filter = ['status', 'visibility', 'created_at', 'start_date']
    search_fields = ['title', 'user__username']
    readonly_fields = ['id', 'created_at', 'updated_at']
    date_hierarchy = 'created_at'

    fieldsets = (
        ('Basic Information', {
            'fields': ('id', 'user', 'title', 'created_at', 'updated_at')
        }),
        ('Trip Details', {
            'fields': ('start_date', 'end_date', 'estimated_cost')
        }),
        ('Status', {
            'fields': ('status', 'visibility')
        }),
    )

    def get_queryset(self, request):
        """Optimize queryset with select_related"""
        queryset = super().get_queryset(request)
        return queryset.select_related('user')


@admin.register(ItineraryItem)
class ItineraryItemAdmin(admin.ModelAdmin):
    """
    Admin interface for ItineraryItem model.
    """
    list_display = ['itinerary', 'poi', 'order_index', 'arrival_time', 'created_at']
    list_filter = ['itinerary__status', 'itinerary__created_at', 'order_index']
    search_fields = ['itinerary__title', 'poi__name']
    readonly_fields = ['id', 'created_at', 'updated_at']
    ordering = ['itinerary', 'order_index']

    fieldsets = (
        ('References', {
            'fields': ('itinerary', 'poi')
        }),
        ('Route Information', {
            'fields': ('order_index', 'arrival_time')
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    def get_queryset(self, request):
        """Optimize queryset with select_related"""
        queryset = super().get_queryset(request)
        return queryset.select_related('itinerary', 'poi')
