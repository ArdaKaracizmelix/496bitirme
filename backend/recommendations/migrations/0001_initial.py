# Generated migration for recommendations app

from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('locations', '0001_initial'),
        ('user', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Review',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('rating', models.FloatField(help_text='Rating from 0.0 to 5.0')),
                ('comment', models.TextField(blank=True, default='')),
                ('is_verified_purchase', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('poi', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reviews', to='locations.poi')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reviews', to='user.userprofile')),
            ],
            options={
                'db_table': 'recommendations_review',
            },
        ),
        migrations.CreateModel(
            name='Interaction',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('interaction_type', models.CharField(choices=[('VIEW', 'View'), ('LIKE', 'Like'), ('SHARE', 'Share'), ('VISIT', 'Visit'), ('CLICK', 'Click'), ('CHECK_IN', 'Check In')], help_text='Type of user interaction: VIEW, LIKE, SHARE, VISIT, CLICK, CHECK_IN', max_length=20)),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('poi', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='interactions', to='locations.poi')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='interactions', to='user.userprofile')),
            ],
            options={
                'db_table': 'recommendations_interaction',
            },
        ),
        migrations.CreateModel(
            name='TrendingList',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('geohash', models.CharField(help_text='Geohash string identifying geographic area', max_length=12, unique=True)),
                ('pois', models.JSONField(help_text='List of trending POI IDs')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'recommendations_trending_list',
            },
        ),
        migrations.CreateModel(
            name='SeasonalMetadata',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('peak_season', models.CharField(choices=[('SPRING', 'Spring'), ('SUMMER', 'Summer'), ('FALL', 'Fall'), ('WINTER', 'Winter')], help_text='Season with highest visit frequency', max_length=10)),
                ('visit_count_spring', models.IntegerField(default=0)),
                ('visit_count_summer', models.IntegerField(default=0)),
                ('visit_count_fall', models.IntegerField(default=0)),
                ('visit_count_winter', models.IntegerField(default=0)),
                ('last_analyzed_at', models.DateTimeField(auto_now=True)),
                ('poi', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='seasonal_metadata', to='locations.poi')),
            ],
            options={
                'db_table': 'recommendations_seasonal_metadata',
            },
        ),
        migrations.CreateModel(
            name='BlacklistedPOI',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('reason', models.TextField(help_text='Reason for blacklisting')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(help_text='When the blacklist entry expires')),
                ('poi', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='blacklist_entry', to='locations.poi')),
            ],
            options={
                'db_table': 'recommendations_blacklisted_poi',
            },
        ),
        migrations.AddIndex(
            model_name='review',
            index=models.Index(fields=['poi', 'rating'], name='recommendations_review_poi_id_rating_idx'),
        ),
        migrations.AddIndex(
            model_name='review',
            index=models.Index(fields=['created_at'], name='recommendations_review_created_at_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='review',
            unique_together={('user', 'poi')},
        ),
        migrations.AddIndex(
            model_name='interaction',
            index=models.Index(fields=['user', 'timestamp'], name='recommendations_interaction_user_id_timestamp_idx'),
        ),
        migrations.AddIndex(
            model_name='interaction',
            index=models.Index(fields=['poi', 'timestamp'], name='recommendations_interaction_poi_id_timestamp_idx'),
        ),
        migrations.AddIndex(
            model_name='trendinglist',
            index=models.Index(fields=['geohash'], name='recommendations_trending_list_geohash_idx'),
        ),
        migrations.AddIndex(
            model_name='blacklistedpoi',
            index=models.Index(fields=['expires_at'], name='recommendations_blacklisted_poi_expires_at_idx'),
        ),
    ]
