"""
Django admin configuration for recommendations models.
"""
from django.contrib import admin
from recommendations.models import Interaction, Review, TrendingList, BlacklistedPOI, SeasonalMetadata


@admin.register(Interaction)
class InteractionAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'poi', 'interaction_type', 'timestamp']
    list_filter = ['interaction_type', 'timestamp']
    search_fields = ['user__user__username', 'poi__name']
    readonly_fields = ['id', 'timestamp']


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'poi', 'rating', 'created_at']
    list_filter = ['rating', 'created_at', 'is_verified_purchase']
    search_fields = ['user__user__username', 'poi__name', 'comment']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(TrendingList)
class TrendingListAdmin(admin.ModelAdmin):
    list_display = ['id', 'geohash', 'created_at', 'updated_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['geohash']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(BlacklistedPOI)
class BlacklistedPOIAdmin(admin.ModelAdmin):
    list_display = ['id', 'poi', 'reason', 'created_at', 'expires_at']
    list_filter = ['created_at', 'expires_at']
    search_fields = ['poi__name', 'reason']
    readonly_fields = ['id', 'created_at']


@admin.register(SeasonalMetadata)
class SeasonalMetadataAdmin(admin.ModelAdmin):
    list_display = ['id', 'poi', 'peak_season', 'last_analyzed_at']
    list_filter = ['peak_season']
    search_fields = ['poi__name']
    readonly_fields = ['id', 'last_analyzed_at']
