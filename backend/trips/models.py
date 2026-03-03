import uuid
from decimal import Decimal

from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from django.utils import timezone


class Itinerary(models.Model):
    """
    Database entity representing a planned trip. It stores metadata about the trip
    and maintains a relationship with the POIs included in the route through ItineraryItem.
    """

    class Status(models.TextChoices):
        """Enum for trip status"""
        DRAFT = 'DRAFT', 'Draft'
        ACTIVE = 'ACTIVE', 'Active'
        COMPLETED = 'COMPLETED', 'Completed'
        ARCHIVED = 'ARCHIVED', 'Archived'

    class Visibility(models.TextChoices):
        """Enum for trip visibility"""
        PRIVATE = 'PRIVATE', 'Private'
        PUBLIC = 'PUBLIC', 'Public'

    # Primary Key
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Foreign Keys
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='itineraries',
        help_text="Reference to the owner of the itinerary"
    )

    # Basic Information
    title = models.CharField(
        max_length=255,
        help_text="User defined name for the trip"
    )

    # Date & Time
    start_date = models.DateTimeField(
        help_text="The scheduled beginning of the trip"
    )
    end_date = models.DateTimeField(
        help_text="The scheduled end of the trip"
    )

    # Status & Visibility
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        help_text="DRAFT, ACTIVE, COMPLETED, ARCHIVED"
    )
    visibility = models.CharField(
        max_length=20,
        choices=Visibility.choices,
        default=Visibility.PRIVATE,
        help_text="PRIVATE (default), PUBLIC (shared on feed)"
    )

    # Cost Management
    estimated_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Cached total cost based on POI metadata"
    )

    # Timestamp
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Relationship to POIs through ItineraryItem
    stops = models.ManyToManyField(
        'locations.POI',
        through='ItineraryItem',
        related_name='itineraries',
        help_text="The collection of places to visit. Uses a Through model (ItineraryItem) to store order/sequence."
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['status']),
            models.Index(fields=['visibility']),
        ]

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"

    def get_total_duration(self) -> int:
        """
        Sums up dwell times + transit times between stops.
        Returns total duration in minutes.
        """
        items = self.itineraryitem_set.all().order_by('order_index')
        total_duration = 0

        for i, item in enumerate(items):
            # Add dwell time (will be stored in POI metadata or as a field)
            # For now, we'll count the time until the next stop or until end_date
            if i < len(list(items)) - 1:
                next_item = items[i + 1]
                if item.arrival_time and next_item.arrival_time:
                    duration = (next_item.arrival_time.hour * 60 + next_item.arrival_time.minute -
                               item.arrival_time.hour * 60 - item.arrival_time.minute)
                    total_duration += duration

        return total_duration

    def clone(self, new_user):
        """
        Creates a copy of this (public) itinerary for another user to edit.
        """
        if self.visibility != self.Visibility.PUBLIC:
            raise ValueError("Only public itineraries can be cloned")

        # Create new itinerary
        cloned = Itinerary.objects.create(
            user=new_user,
            title=f"{self.title} (Copy)",
            start_date=self.start_date,
            end_date=self.end_date,
            status=self.Status.DRAFT,
            visibility=self.Visibility.PRIVATE,
            estimated_cost=self.estimated_cost,
        )

        # Clone all stops
        for item in self.itineraryitem_set.all():
            ItineraryItem.objects.create(
                itinerary=cloned,
                poi=item.poi,
                order_index=item.order_index,
                arrival_time=item.arrival_time,
                notes=item.notes,
            )

        return cloned

    def generate_share_link(self) -> str:
        """
        Creates a unique, signed URL for sharing this itinerary.
        Uses Django's signing framework.
        """
        from django.core.signing import TimestampSigner

        signer = TimestampSigner()
        signed_value = signer.sign(str(self.id))

        # Return a shareable link (would be used by frontend)
        return f"/trips/share/{signed_value}"


class ItineraryItem(models.Model):
    """
    An intermediate table that links an Itinerary to a POI. It stores the specific
    context of that visit such as the order in the route or arrival time.
    """

    # Foreign Keys
    itinerary = models.ForeignKey(
        Itinerary,
        on_delete=models.CASCADE,
        help_text="Reference to the parent trip"
    )
    poi = models.ForeignKey(
        'locations.POI',
        on_delete=models.CASCADE,
        help_text="Reference to the location being visited"
    )

    # Order & Timing
    order_index = models.IntegerField(
        validators=[MinValueValidator(0)],
        help_text="The sequence number (0, 1, 2...) in the route"
    )
    arrival_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Scheduled arrival time at this stop"
    )

    # Notes
    notes = models.TextField(
        blank=True,
        default="",
        max_length=500,
        help_text="User's personal notes"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['itinerary', 'order_index']
        unique_together = [['itinerary', 'order_index']]
        indexes = [
            models.Index(fields=['itinerary', 'order_index']),
        ]

    def __str__(self):
        return f"{self.itinerary.title} - Stop {self.order_index}: {self.poi.name}"
