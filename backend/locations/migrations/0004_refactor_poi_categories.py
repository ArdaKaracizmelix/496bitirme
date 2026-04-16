from django.db import migrations, models


OLD_TO_NEW_CATEGORY = {
    "HISTORICAL": "CULTURE_HISTORY",
    "NATURE": "OUTDOOR_NATURE",
    "FOOD": "FOOD_DRINK",
    "ENTERTAINMENT": "ENTERTAINMENT",
}

NEW_TO_OLD_CATEGORY = {
    "CULTURE_HISTORY": "HISTORICAL",
    "OUTDOOR_NATURE": "NATURE",
    "FOOD_DRINK": "FOOD",
    "ENTERTAINMENT": "ENTERTAINMENT",
}


def forwards_map_categories(apps, schema_editor):
    POI = apps.get_model("locations", "POI")
    for old_value, new_value in OLD_TO_NEW_CATEGORY.items():
        POI.objects.filter(category=old_value).update(category=new_value)


def backwards_map_categories(apps, schema_editor):
    POI = apps.get_model("locations", "POI")
    for new_value, old_value in NEW_TO_OLD_CATEGORY.items():
        POI.objects.filter(category=new_value).update(category=old_value)


class Migration(migrations.Migration):

    dependencies = [
        ("locations", "0003_rename_locations_s_user_id_xyz123_idx_locations_s_user_id_0871e5_idx"),
    ]

    operations = [
        migrations.RunPython(forwards_map_categories, backwards_map_categories),
        migrations.AlterField(
            model_name="poi",
            name="category",
            field=models.CharField(
                choices=[
                    ("CULTURE_HISTORY", "Culture & History"),
                    ("FOOD_DRINK", "Food & Drink"),
                    ("OUTDOOR_NATURE", "Outdoor & Nature"),
                    ("ENTERTAINMENT", "Entertainment"),
                    ("SHOPPING", "Shopping"),
                    ("HEALTH_WELLNESS", "Health & Wellness"),
                    ("TRANSPORTATION", "Transportation"),
                    ("LODGING", "Lodging"),
                ],
                help_text=(
                    "Classification: CULTURE_HISTORY, FOOD_DRINK, OUTDOOR_NATURE, "
                    "ENTERTAINMENT, SHOPPING, HEALTH_WELLNESS, TRANSPORTATION, LODGING"
                ),
                max_length=20,
            ),
        ),
    ]

