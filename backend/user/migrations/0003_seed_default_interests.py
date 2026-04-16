from django.db import migrations


DEFAULT_INTERESTS = [
    {
        "key": "culture",
        "title": "Kultur ve tarih",
        "icon": "landmark",
        "sort_order": 10,
        "children": [
            ("museum", "Muzeler"),
            ("historical_landmark", "Tarihi yerler"),
            ("art_gallery", "Sanat galerileri"),
            ("monument", "Anitlar"),
        ],
    },
    {
        "key": "food",
        "title": "Yeme icme",
        "icon": "restaurant",
        "sort_order": 20,
        "children": [
            ("restaurant", "Restoranlar"),
            ("cafe", "Kafeler"),
            ("bakery", "Firinlar"),
            ("coffee_shop", "Kahve"),
        ],
    },
    {
        "key": "nature",
        "title": "Doga ve acik hava",
        "icon": "park",
        "sort_order": 30,
        "children": [
            ("park", "Parklar"),
            ("beach", "Sahiller"),
            ("hiking_area", "Yuruyus rotalari"),
            ("botanical_garden", "Botanik bahceleri"),
        ],
    },
    {
        "key": "entertainment",
        "title": "Eglence",
        "icon": "ticket",
        "sort_order": 40,
        "children": [
            ("movie_theater", "Sinema"),
            ("amusement_park", "Tema parklari"),
            ("night_club", "Gece hayati"),
            ("stadium", "Stadyumlar"),
        ],
    },
    {
        "key": "shopping",
        "title": "Alisveris",
        "icon": "shopping-bag",
        "sort_order": 50,
        "children": [
            ("shopping_mall", "AVM"),
            ("market", "Pazarlar"),
            ("book_store", "Kitapcilar"),
            ("clothing_store", "Giyim"),
        ],
    },
    {
        "key": "wellness",
        "title": "Saglik ve rahatlama",
        "icon": "spa",
        "sort_order": 60,
        "children": [
            ("spa", "Spa"),
            ("gym", "Spor salonlari"),
            ("wellness_center", "Wellness"),
            ("yoga_studio", "Yoga"),
        ],
    },
    {
        "key": "transportation",
        "title": "Ulasim",
        "icon": "train",
        "sort_order": 70,
        "children": [
            ("airport", "Havalimani"),
            ("train_station", "Tren istasyonu"),
            ("bus_station", "Otobus istasyonu"),
            ("transit_station", "Toplu tasima"),
        ],
    },
    {
        "key": "lodging",
        "title": "Konaklama",
        "icon": "hotel",
        "sort_order": 80,
        "children": [
            ("hotel", "Oteller"),
            ("hostel", "Hosteller"),
            ("resort_hotel", "Tatil koyleri"),
            ("campground", "Kamp alanlari"),
        ],
    },
]


def seed_interests(apps, schema_editor):
    Interest = apps.get_model("user", "Interest")

    for group in DEFAULT_INTERESTS:
        parent, _ = Interest.objects.update_or_create(
            key=group["key"],
            defaults={
                "title": group["title"],
                "kind": "group",
                "icon": group["icon"],
                "is_active": True,
                "sort_order": group["sort_order"],
                "parent": None,
            },
        )
        for index, (key, title) in enumerate(group["children"], start=1):
            Interest.objects.update_or_create(
                key=key,
                defaults={
                    "title": title,
                    "kind": "type",
                    "icon": "",
                    "is_active": True,
                    "sort_order": group["sort_order"] + index,
                    "parent": parent,
                },
            )


def unseed_interests(apps, schema_editor):
    Interest = apps.get_model("user", "Interest")
    keys = []
    for group in DEFAULT_INTERESTS:
        keys.append(group["key"])
        keys.extend(key for key, _title in group["children"])
    Interest.objects.filter(key__in=keys).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("user", "0002_interest_catalog"),
    ]

    operations = [
        migrations.RunPython(seed_interests, unseed_interests),
    ]
