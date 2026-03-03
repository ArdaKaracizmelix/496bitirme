from django.contrib import admin
from .models import TaskLog


@admin.register(TaskLog)
class TaskLogAdmin(admin.ModelAdmin):
    list_display = ('task_name', 'status', 'created_at', 'completed_at')
    list_filter = ('status', 'created_at')
    search_fields = ('task_name', 'task_id')
    readonly_fields = ('task_id', 'created_at', 'completed_at')
