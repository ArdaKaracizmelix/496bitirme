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

    def update_vector(self,tag:str,weight:float) :
       return # TODO:

    def get_feed_vector(self):
        return #TODO:


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




class FollowRelation(models.Model) :
    follower = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="following_relation")
    following = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="follower_relation")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('follower', 'following')