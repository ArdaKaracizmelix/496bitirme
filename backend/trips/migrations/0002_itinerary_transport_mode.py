from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('trips', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='itinerary',
            name='transport_mode',
            field=models.CharField(
                choices=[
                    ('DRIVING', 'Driving'),
                    ('WALKING', 'Walking'),
                    ('CYCLING', 'Cycling'),
                    ('TRANSIT', 'Transit'),
                ],
                default='DRIVING',
                help_text='Preferred transportation mode for route planning',
                max_length=20,
            ),
        ),
    ]
