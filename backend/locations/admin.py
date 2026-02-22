from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin
from .models import POI


@admin.register(POI)
class POIAdmin(GISModelAdmin):
    """
    Admin interface for POI with geospatial support.
    GISModelAdmin provides map interface for location data.
    """
    list_display = ['name', 'category', 'average_rating', 'created_at']
    list_filter = ['category', 'average_rating', 'created_at']
    search_fields = ['name', 'address', 'external_id']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('id', 'name', 'address')
        }),
        ('Location', {
            'fields': ('location',)
        }),
        ('Classification', {
            'fields': ('category', 'external_id')
        }),
        ('Rating & Quality', {
            'fields': ('average_rating',)
        }),
        ('Metadata', {
            'fields': ('metadata', 'tags')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

