"""
URL configuration for task_queue app.
Note: Task queue doesn't expose API endpoints directly.
Tasks are triggered internally or via Celery Beat schedule.
"""
from django.urls import path

app_name = 'task_queue'

urlpatterns = [
    # No public API endpoints for task_queue
    # Tasks are managed internally and via Celery Beat
]
