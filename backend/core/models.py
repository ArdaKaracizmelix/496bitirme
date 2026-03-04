from django.db import models


class TimeStampedModel(models.Model):
    """
    Abstract base class that provides self-updating audit fields.
    
    By inheriting from this class instead of models.Model, every entity in the system
    (Users, POIs, Trips) automatically gains tracking for creation and modification
    times without rewriting field definitions. - will be implemented later
    
    This ensures code consistency (DRY Principle) and standardized audit trails across
    the entire application.
    """
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp set automatically when the record is first created. Used for sorting feeds and history."
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp updated automatically every time the record is saved."
    )
    
    is_deleted = models.BooleanField(
        default=False,
        help_text="Soft Delete flag. Default is False. Allows data recovery and audit trails instead of permanent deletion."
    )
    
    class Meta:
        abstract = True
        indexes = [
            models.Index(fields=['created_at']),
            models.Index(fields=['updated_at']),
            models.Index(fields=['is_deleted']),
        ]
    
    def soft_delete(self):
        """
        Sets is_deleted to True and saves the instance.
        
        Overrides the standard delete() method to prevent accidental data loss.
        Allows data recovery and maintains audit trails.
        """
        self.is_deleted = True
        self.save(update_fields=['is_deleted', 'updated_at'])
    
    def restore(self):
        """
        Sets is_deleted to False, recovering a previously removed item.
        
        Used to restore soft-deleted records from the database.
        """
        self.is_deleted = False
        self.save(update_fields=['is_deleted', 'updated_at'])
