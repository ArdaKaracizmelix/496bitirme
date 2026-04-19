import re
import unicodedata


# Types that are usually meaningful as itinerary/sightseeing POIs.
MEANINGFUL_POI_ALLOW_TYPES = {
    "tourist_attraction", "museum", "art_gallery", "art_museum", "art_studio",
    "historical_landmark", "historical_place", "historic", "monument", "memorial",
    "castle", "archaeological_site", "ruins", "fort", "cultural_landmark",
    "performing_arts_theater", "cultural_center", "opera_house", "auditorium",
    "park", "city_park", "national_park", "state_park", "botanical_garden", "garden",
    "hiking_area", "beach", "lake", "river", "woods", "nature_preserve",
    "nature_reserve", "natural", "peak", "spring", "water", "cliff",
    "cave_entrance", "scenic_spot", "viewpoint", "zoo", "aquarium",
    "observation_deck", "plaza", "visitor_center",
    "bazaar",
    "movie_theater", "amusement_park", "night_club", "stadium", "concert_hall",
    "live_music_venue", "community_center", "church", "mosque", "synagogue", "buddhist_temple",
    "hindu_temple", "tourist_information_center",
}

# Types that should almost never become destination POIs in a travel itinerary.
MEANINGFUL_POI_BLOCK_TYPES = {
    "atm", "bank", "finance", "accounting", "insurance_agency", "hospital",
    "general_hospital", "pharmacy", "drugstore",
    "doctor", "dentist", "physiotherapist", "medical_center", "medical_clinic", "medical_lab",
    "parking", "parking_garage", "parking_lot", "rest_stop",
    "airport", "airstrip", "bus_station", "bus_stop", "train_station", "train_ticket_office",
    "subway_station", "taxi_stand", "taxi_service", "transit_station", "transit_stop",
    "transit_depot", "light_rail_station", "tram_stop", "park_and_ride", "transportation_service",
    "locality", "country", "postal_code", "administrative_area_level_1", "administrative_area_level_2",
    "school_district", "school", "primary_school", "secondary_school", "high_school", "middle_school",
    "preschool", "kindergarten", "university", "college", "college_or_university", "academy", "campus",
    "education", "educational_institution", "language_school", "music_school", "driving_school",
    "trade_school", "adult_education_school", "research_institute", "academic_department",
    "university_department", "government_office", "local_government_office",
    "city_hall", "courthouse", "embassy", "fire_station", "police", "post_office",
    "corporate_office", "business_center", "coworking_space", "supplier", "manufacturer",
    "service", "storage", "moving_company", "roofing_contractor", "employment_agency",
    "lawyer", "real_estate_agency", "car_repair", "car_dealer", "car_rental",
    "gas_station", "locksmith", "electrician", "plumber", "hardware_store",
    "restaurant", "cafe", "bakery", "coffee_shop", "ice_cream_shop", "tea_house",
    "food", "fast_food", "meal_takeaway", "meal_delivery", "food_court",
    "market", "farmers_market", "flea_market", "shopping_mall", "store",
    "department_store", "clothing_store", "shoe_store", "electronics_store",
    "supermarket", "convenience_store", "book_store", "gift_shop",
}

# Generic types that should be ignored when deciding the final category.
GENERIC_GOOGLE_TYPES = {
    "point_of_interest", "establishment", "premise", "route", "street_address",
    "subpremise", "plus_code", "floor", "intersection",
}

POI_CATEGORY_RULES = {
    "HISTORICAL": {
        "strong": {
            "historical_landmark", "historical_place", "historic", "monument",
            "memorial", "archaeological_site", "ruins", "fort", "museum",
            "history_museum", "castle", "cultural_landmark", "art_museum",
        },
        "weak": {
            "tourist_attraction", "church", "mosque", "synagogue", "buddhist_temple",
            "hindu_temple", "library", "plaza", "visitor_center",
        },
    },
    "CULTURE": {
        "strong": {
            "art_gallery", "performing_arts_theater", "cultural_center", "opera_house",
            "concert_hall", "auditorium", "art_studio",
        },
        "weak": {"community_center", "tourist_information_center", "tourist_attraction"},
    },
    "NATURE": {
        "strong": {
            "park", "city_park", "national_park", "state_park", "botanical_garden",
            "hiking_area", "beach", "lake", "river", "woods", "nature_preserve",
            "nature_reserve", "natural", "peak", "spring", "water", "cliff", "cave_entrance",
        },
        "weak": {"garden", "scenic_spot", "viewpoint", "zoo", "aquarium", "observation_deck"},
    },
    "FOOD": {
        "strong": set(),
        "weak": set(),
    },
    "ENTERTAINMENT": {
        "strong": {
            "movie_theater", "amusement_park", "night_club", "stadium", "live_music_venue",
            "concert_hall",
        },
        "weak": {"tourist_attraction", "plaza", "event_venue", "community_center"},
    },
    "SHOPPING": {
        "strong": {"bazaar"},
        "weak": set(),
    },
    "WELLNESS": {
        "strong": {"spa", "wellness_center", "yoga_studio", "massage_spa", "sauna"},
        "weak": {"gym", "fitness_center", "public_bath"},
    },
    "LODGING": {
        "strong": {"lodging", "hotel", "hostel", "resort_hotel", "motel", "guest_house"},
        "weak": {"campground", "bed_and_breakfast", "inn"},
    },
    "TRANSPORTATION": {
        "strong": {"airport", "bus_station", "train_station", "subway_station", "transit_station"},
        "weak": {"taxi_stand", "tram_stop", "bus_stop", "ferry_terminal"},
    },
}

PRIMARY_TYPE_PRIORITY = [
    "historical_landmark", "historical_place", "historic", "monument", "memorial",
    "archaeological_site", "ruins", "museum", "history_museum", "castle", "cultural_landmark",
    "art_gallery", "art_museum", "performing_arts_theater", "cultural_center", "opera_house",
    "national_park", "state_park", "botanical_garden", "park", "city_park", "hiking_area",
    "beach", "lake", "nature_preserve", "nature_reserve", "woods", "garden",
    "scenic_spot", "viewpoint", "peak", "spring", "water", "cliff", "cave_entrance",
    "movie_theater", "amusement_park", "night_club", "stadium", "market",
    "farmers_market", "flea_market", "bazaar",
    "tourist_attraction", "plaza", "visitor_center", "church", "mosque", "synagogue",
]


def normalize_google_types(types) -> list[str]:
    normalized = []
    seen = set()
    for raw in types or []:
        value = str(raw or "").strip().lower()
        value = ''.join(
            ch for ch in unicodedata.normalize("NFKD", value)
            if not unicodedata.combining(ch)
        )
        value = re.sub(r"\s+", "_", value)
        value = value.replace("-", "_")
        if not value:
            continue
        semantic_aliases = set()
        if "restaurant" in value:
            semantic_aliases.add("restaurant")
        if "cafe" in value or "coffee" in value:
            semantic_aliases.add("cafe")
        if "museum" in value:
            semantic_aliases.add("museum")
        if "gallery" in value:
            semantic_aliases.add("art_gallery")
        if "park" in value:
            semantic_aliases.add("park")
        if "historic" in value or "heritage" in value:
            semantic_aliases.add("historical_landmark")
        if "landmark" in value:
            semantic_aliases.add("historical_landmark")
        if "monument" in value:
            semantic_aliases.add("monument")
        if "viewpoint" in value or "scenic" in value:
            semantic_aliases.add("viewpoint")
        if "bakery" in value:
            semantic_aliases.add("bakery")
        if "theater" in value or "theatre" in value:
            semantic_aliases.add("performing_arts_theater")

        for candidate in [value, *sorted(semantic_aliases)]:
            if candidate in seen:
                continue
            seen.add(candidate)
            normalized.append(candidate)
    return normalized


def extract_name_based_type_hints(name: str) -> set[str]:
    lowered = str(name or "").strip().lower()
    hints = set()
    keyword_map = {
        "museum": "museum",
        "palace": "castle",
        "castle": "castle",
        "tower": "historical_landmark",
        "monument": "monument",
        "memorial": "memorial",
        "ruins": "ruins",
        "historic": "historic",
        "viewpoint": "viewpoint",
        "park": "park",
        "garden": "garden",
        "beach": "beach",
        "bazaar": "bazaar",
        "square": "plaza",
        "mosque": "mosque",
        "church": "church",
        "spa": "spa",
        "hotel": "hotel",
    }
    for token, inferred_type in keyword_map.items():
        if token in lowered:
            hints.add(inferred_type)
    return hints


def extract_name_based_block_hints(name: str) -> set[str]:
    lowered = str(name or "").strip().lower()
    hints = set()
    keyword_map = {
        "atm": "atm",
        "bank": "bank",
        "banka": "bank",
        "pharmacy": "pharmacy",
        "eczane": "pharmacy",
        "hospital": "hospital",
        "hastane": "hospital",
        "doctor": "doctor",
        "doktor": "doctor",
        "dentist": "dentist",
        "diş hekimi": "dentist",
        "dis hekimi": "dentist",
        "clinic": "medical_clinic",
        "klinik": "medical_clinic",
        "veterinary": "veterinary_care",
        "veteriner": "veterinary_care",
        "lawyer": "lawyer",
        "avukat": "lawyer",
        "insurance": "insurance_agency",
        "sigorta": "insurance_agency",
        "noter": "government_office",
        "ptt": "post_office",
        "otopark": "parking",
        "parking": "parking",
        "gas station": "gas_station",
        "benzin": "gas_station",
        "restaurant": "restaurant",
        "restoran": "restaurant",
        "burger": "fast_food",
        "mcdonald": "fast_food",
        "kfc": "fast_food",
        "cafe": "cafe",
        "coffee": "coffee_shop",
        "bakery": "bakery",
        "market": "market",
        "supermarket": "supermarket",
        "store": "store",
        "magaza": "store",
        "mağaza": "store",
        "penti": "clothing_store",
        "clothing": "clothing_store",
        "shoe": "shoe_store",
        "university": "university",
        "college": "college",
        "school": "school",
        "academy": "academy",
        "campus": "campus",
        "faculty": "academic_department",
        "kindergarten": "preschool",
        "high school": "high_school",
        "middle school": "middle_school",
        "primary school": "primary_school",
    }
    for token, inferred_type in keyword_map.items():
        if token in lowered:
            hints.add(inferred_type)
    return hints


def pick_primary_google_type(types: list[str]) -> str | None:
    if not types:
        return None
    normalized = normalize_google_types(types)
    for preferred in PRIMARY_TYPE_PRIORITY:
        if preferred in normalized:
            return preferred
    for candidate in normalized:
        if candidate not in GENERIC_GOOGLE_TYPES:
            return candidate
    return normalized[0] if normalized else None


def is_meaningful_poi(types, name: str = "") -> bool:
    normalized = set(normalize_google_types(types))
    name_allow_hints = extract_name_based_type_hints(name)
    name_block_hints = extract_name_based_block_hints(name)

    if not normalized:
        inferred = name_allow_hints | name_block_hints
        if inferred & MEANINGFUL_POI_BLOCK_TYPES:
            return False
        return bool(inferred & MEANINGFUL_POI_ALLOW_TYPES)

    effective_types = (normalized - GENERIC_GOOGLE_TYPES) | name_allow_hints | name_block_hints

    if effective_types & MEANINGFUL_POI_BLOCK_TYPES:
        return False
    if effective_types & MEANINGFUL_POI_ALLOW_TYPES:
        return True
    return False


def categorize_google_place(types, name: str = "") -> dict:
    normalized = set(normalize_google_types(types))
    name_allow_hints = extract_name_based_type_hints(name)
    name_block_hints = extract_name_based_block_hints(name)
    effective_types = (normalized - GENERIC_GOOGLE_TYPES) | name_allow_hints | name_block_hints

    blocked_types = sorted(effective_types & MEANINGFUL_POI_BLOCK_TYPES)
    allowed_types = sorted(effective_types & MEANINGFUL_POI_ALLOW_TYPES)
    is_poi = bool(allowed_types) and not bool(blocked_types)

    scores = {}
    matched = {}
    for category, rules in POI_CATEGORY_RULES.items():
        strong_matches = effective_types & set(rules["strong"])
        weak_matches = effective_types & set(rules["weak"])
        score = (3 * len(strong_matches)) + len(weak_matches)
        if score > 0:
            scores[category] = score
            matched[category] = {
                "strong": sorted(strong_matches),
                "weak": sorted(weak_matches),
            }

    if blocked_types:
        derived_category = "OTHER"
    elif scores:
        derived_category = sorted(scores.items(), key=lambda item: (-item[1], item[0]))[0][0]
    elif is_poi:
        derived_category = "CULTURE"
    else:
        derived_category = "OTHER"

    primary_type = pick_primary_google_type(sorted(effective_types or normalized))

    return {
        "is_meaningful_poi": is_poi,
        "primary_type": primary_type,
        "derived_category": derived_category,
        "raw_types": sorted(normalized),
        "effective_types": sorted(effective_types),
        "allowed_types": allowed_types,
        "blocked_types": blocked_types,
        "matched_rules": matched,
    }


def map_derived_category_to_poi_category(
    derived_category: str,
    fallback: str | None = "ENTERTAINMENT",
) -> str | None:
    normalized = str(derived_category or "").strip().upper()
    if normalized in {"HISTORICAL", "CULTURE"}:
        return "HISTORICAL"
    if normalized == "NATURE":
        return "NATURE"
    if normalized == "FOOD":
        return "FOOD"
    if normalized in {"ENTERTAINMENT", "SHOPPING", "WELLNESS", "LODGING"}:
        return "ENTERTAINMENT"
    return fallback
