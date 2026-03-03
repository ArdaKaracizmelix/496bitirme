"""
Models for task_queue app.
Currently no persistent models needed as tasks are managed by Celery.
"""
from django.db import models


# Placeholder for future task history/logging if needed
class TaskLog(models.Model):
    """Optional model to track task execution history"""
    task_name = models.CharField(max_length=255)
    task_id = models.CharField(max_length=255, unique=True)
    status = models.CharField(max_length=50)  # pending, success, failure
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name = "Task Log"
        verbose_name_plural = "Task Logs"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.task_name} - {self.status}"
