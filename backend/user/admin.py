from django.contrib import admin

from .models import Interest, UserInterest, UserProfile


@admin.register(Interest)
class InterestAdmin(admin.ModelAdmin):
    list_display = ("title", "key", "kind", "parent", "is_active", "sort_order")
    list_filter = ("kind", "is_active")
    search_fields = ("title", "key")
    ordering = ("sort_order", "title")


@admin.register(UserInterest)
class UserInterestAdmin(admin.ModelAdmin):
    list_display = ("profile", "interest", "weight", "created_at")
    list_filter = ("interest__kind",)
    search_fields = ("profile__user__email", "interest__title", "interest__key")


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "is_verified", "followers_count", "following_count")
    search_fields = ("user__email", "user__username", "user__first_name", "user__last_name")
