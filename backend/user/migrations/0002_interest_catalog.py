# Generated manually for DB-backed onboarding interests.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("user", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Interest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.CharField(max_length=120, unique=True)),
                ("title", models.CharField(max_length=150)),
                ("kind", models.CharField(choices=[("group", "Group"), ("type", "Type")], default="group", max_length=20)),
                ("icon", models.CharField(blank=True, default="", max_length=40)),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("parent", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="children", to="user.interest")),
            ],
            options={
                "ordering": ("sort_order", "title"),
            },
        ),
        migrations.CreateModel(
            name="UserInterest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("weight", models.FloatField(default=1.0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("interest", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="user_selections", to="user.interest")),
                ("profile", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="selected_interests", to="user.userprofile")),
            ],
        ),
        migrations.AlterUniqueTogether(
            name="userinterest",
            unique_together={("profile", "interest")},
        ),
    ]
