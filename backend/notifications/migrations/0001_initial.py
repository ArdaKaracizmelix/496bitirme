# Generated migration for initial notifications app setup

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('user', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('verb', models.CharField(
                    choices=[
                        ('LIKE', 'Like'),
                        ('COMMENT', 'Comment'),
                        ('FOLLOW', 'Follow'),
                        ('TRIP_INVITE', 'Trip Invite'),
                        ('SYSTEM_ALERT', 'System Alert'),
                    ],
                    help_text='Type of notification: LIKE, COMMENT, FOLLOW, TRIP_INVITE, SYSTEM_ALERT',
                    max_length=20,
                )),
                ('title', models.CharField(max_length=200)),
                ('body', models.TextField()),
                ('target_object_id', models.UUIDField(blank=True, null=True)),
                ('is_read', models.BooleanField(default=False)),
                ('data', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='triggered_notifications', to='user.userprofile')),
                ('recipient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='received_notifications', to='user.userprofile')),
            ],
            options={
                'db_table': 'notifications_notification',
            },
        ),
        migrations.CreateModel(
            name='DeviceToken',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('token', models.CharField(max_length=500, unique=True)),
                ('platform', models.CharField(
                    choices=[
                        ('iOS', 'iOS'),
                        ('ANDROID', 'Android'),
                        ('WEB', 'Web'),
                    ],
                    default='ANDROID',
                    max_length=20,
                )),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='device_tokens', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'notifications_device_token',
            },
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['recipient', 'created_at'], name='notification_recipient_created_idx'),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['recipient', 'is_read'], name='notification_recipient_read_idx'),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['created_at'], name='notification_created_idx'),
        ),
        migrations.AddIndex(
            model_name='devicetoken',
            index=models.Index(fields=['user', 'is_active'], name='devicetoken_user_active_idx'),
        ),
        migrations.AddIndex(
            model_name='devicetoken',
            index=models.Index(fields=['token'], name='devicetoken_token_idx'),
        ),
    ]
