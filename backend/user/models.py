import uuid

from django.core.validators import MinValueValidator
from django.db import models,transaction
from django.conf import settings
from django.db.models import F


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile"
    )
    id = models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
    avatar_url = models.URLField(max_length=500,blank=True,null=True)
    bio = models.TextField(editable=True,max_length=200,blank=True,default="")
    preferences_vector = models.JSONField(default=dict,blank=True)
    followers_count = models.IntegerField(validators=[MinValueValidator(0)],default=0)
    following_count = models.IntegerField(validators=[MinValueValidator(0)],default=0)
    is_verified = models.BooleanField(null=False,default=False)
    following = models.ManyToManyField(
        'self',
        through='FollowRelation',
        through_fields=('follower','following'),
        symmetrical=False,
        related_name='followers'
    )

    def update_vector(self, tag: str, weight: float):
        if self.preferences_vector is None:
            self.preferences_vector = {}
        self.preferences_vector[tag] = self.preferences_vector.get(tag, 0.0) + weight
        self.save(update_fields=['preferences_vector'])

    def get_feed_vector(self):
        return self.preferences_vector


    def follow(self,target_profile: "UserProfile"):
        if self != target_profile and not self.is_following(target_profile):
            with transaction.atomic():
                FollowRelation.objects.create(follower=self,following=target_profile)

                self.following_count = F('following_count') + 1
                self.save(update_fields=['following_count'])

                target_profile.followers_count = F('followers_count') + 1
                target_profile.save(update_fields=['followers_count'])


    def unfollow(self,target_profile: "UserProfile"):
        if self != target_profile and self.is_following(target_profile):
            with transaction.atomic():
                FollowRelation.objects.filter(follower=self,following=target_profile).delete()

                self.following_count = F('following_count') - 1
                self.save(update_fields=['following_count'])

                target_profile.followers_count = F('followers_count') - 1
                target_profile.save(update_fields=['followers_count'])


    def is_following(self,target_profile):
        return FollowRelation.objects.filter(follower=self,following =target_profile).exists()


class Interest(models.Model):
    class Kind(models.TextChoices):
        GROUP = "group", "Group"
        TYPE = "type", "Type"

    key = models.CharField(max_length=120, unique=True)
    title = models.CharField(max_length=150)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.GROUP)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="children",
        blank=True,
        null=True,
    )
    icon = models.CharField(max_length=40, blank=True, default="")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "title")

    def __str__(self):
        return self.title


class UserInterest(models.Model):
    profile = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name="selected_interests",
    )
    interest = models.ForeignKey(
        Interest,
        on_delete=models.CASCADE,
        related_name="user_selections",
    )
    weight = models.FloatField(default=1.0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("profile", "interest")

    def __str__(self):
        return f"{self.profile_id} -> {self.interest.key}"




class FollowRelation(models.Model) :
    follower = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="following_relation")
    following = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="follower_relation")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('follower', 'following')
