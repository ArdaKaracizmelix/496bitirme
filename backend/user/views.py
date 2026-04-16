import re
from urllib.request import Request, urlopen
from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserProfile
from .interest_service import InterestService
from .serializers import (
    FollowActionSerializer,
    LoginRequestSerializer,
    LogoutRequestSerializer,
    TokenRefreshRequestSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
)
from .services import (
    AuthService,
    build_email_verification_url,
    generate_email_verification_token,
    send_verification_email,
    validate_email_verification_token,
)

User = get_user_model()

# Create your views here.

GOOGLE_INTEREST_GROUPS = {
    "CULTURE": [
        "museum",
        "art_gallery",
        "performing_arts_theater",
        "cultural_center",
        "historical_landmark",
        "monument",
        "tourist_attraction",
        "library",
    ],
    "FOOD_AND_DRINK": [
        "restaurant",
        "cafe",
        "bar",
        "bakery",
        "meal_takeaway",
        "meal_delivery",
        "coffee_shop",
        "ice_cream_shop",
    ],
    "ENTERTAINMENT_AND_RECREATION": [
        "movie_theater",
        "amusement_park",
        "night_club",
        "stadium",
        "park",
        "zoo",
        "aquarium",
        "gym",
        "spa",
    ],
    "HEALTH_AND_WELLNESS": [
        "hospital",
        "doctor",
        "pharmacy",
        "physiotherapist",
        "dentist",
        "wellness_center",
    ],
    "LODGING": [
        "lodging",
        "hotel",
        "hostel",
        "resort_hotel",
        "motel",
    ],
    "SHOPPING": [
        "shopping_mall",
        "store",
        "supermarket",
        "market",
        "book_store",
        "clothing_store",
    ],
    "TRANSPORTATION": [
        "airport",
        "bus_station",
        "subway_station",
        "train_station",
        "taxi_stand",
        "transit_station",
    ],
}

GOOGLE_TABLE_A_DOC_URL = "https://developers.google.com/maps/documentation/places/web-service/place-types#table-a"
GOOGLE_TABLE_A_CACHE_KEY = "google_places_table_a_types_v1"
GOOGLE_TABLE_A_CACHE_TTL_SECONDS = 24 * 60 * 60
GOOGLE_TABLE_A_MISS_CACHE_TTL_SECONDS = 10 * 60

GOOGLE_TABLE_A_STATIC_TYPES = {
    # Automotive
    "car_dealer", "car_rental", "car_repair", "car_wash", "ebike_charging_station",
    "electric_vehicle_charging_station", "gas_station", "parking", "parking_garage",
    "parking_lot", "rest_stop", "tire_shop", "truck_dealer",
    # Business
    "business_center", "corporate_office", "coworking_space", "farm", "manufacturer",
    "ranch", "supplier", "television_studio",
    # Culture
    "art_gallery", "art_museum", "art_studio", "auditorium", "castle", "cultural_landmark",
    "fountain", "historical_place", "history_museum", "monument", "museum",
    "performing_arts_theater", "sculpture",
    # Education
    "academic_department", "educational_institution", "library", "preschool",
    "primary_school", "research_institute", "school", "secondary_school", "university",
    # Entertainment and Recreation
    "adventure_sports_center", "amphitheatre", "amusement_center", "amusement_park",
    "aquarium", "banquet_hall", "barbecue_area", "botanical_garden", "bowling_alley",
    "casino", "childrens_camp", "city_park", "comedy_club", "community_center",
    "concert_hall", "convention_center", "cultural_center", "cycling_park", "dance_hall",
    "dog_park", "event_venue", "ferris_wheel", "garden", "go_karting_venue",
    "hiking_area", "historical_landmark", "indoor_playground", "internet_cafe", "karaoke",
    "live_music_venue", "marina", "miniature_golf_course", "movie_rental", "movie_theater",
    "national_park", "night_club", "observation_deck", "off_roading_area", "opera_house",
    "paintball_center", "park", "philharmonic_hall", "picnic_ground", "planetarium",
    "plaza", "roller_coaster", "skateboard_park", "state_park", "tourist_attraction",
    "video_arcade", "vineyard", "visitor_center", "water_park", "wedding_venue",
    "wildlife_park", "wildlife_refuge", "zoo",
    # Facilities / Finance
    "public_bath", "public_bathroom", "stable", "accounting", "atm", "bank",
    # Food and Drink (core + common)
    "acai_shop", "afghani_restaurant", "african_restaurant", "american_restaurant",
    "asian_restaurant", "bakery", "bar", "bar_and_grill", "barbecue_restaurant",
    "beer_garden", "bistro", "breakfast_restaurant", "brewery", "brunch_restaurant",
    "buffet_restaurant", "cafe", "cafeteria", "cake_shop", "candy_store", "cat_cafe",
    "chinese_restaurant", "chocolate_shop", "cocktail_bar", "coffee_shop",
    "coffee_roastery", "confectionery", "deli", "dessert_restaurant", "dessert_shop",
    "diner", "dog_cafe", "donut_shop", "fast_food_restaurant", "fine_dining_restaurant",
    "food_court", "french_restaurant", "gastropub", "greek_restaurant", "halal_restaurant",
    "hamburger_restaurant", "ice_cream_shop", "indian_restaurant", "indonesian_restaurant",
    "irish_pub", "italian_restaurant", "japanese_restaurant", "juice_shop", "kebab_shop",
    "korean_restaurant", "latin_american_restaurant", "lebanese_restaurant",
    "meal_delivery", "meal_takeaway", "mediterranean_restaurant", "mexican_restaurant",
    "middle_eastern_restaurant", "noodle_shop", "pastry_shop", "pizza_delivery",
    "pizza_restaurant", "pub", "ramen_restaurant", "restaurant", "salad_shop",
    "sandwich_shop", "seafood_restaurant", "snack_bar", "soup_restaurant",
    "south_indian_restaurant", "spanish_restaurant", "sports_bar", "steak_house",
    "sushi_restaurant", "tea_house", "thai_restaurant", "turkish_restaurant",
    "vegan_restaurant", "vegetarian_restaurant", "vietnamese_restaurant", "wine_bar",
    "winery",
    # Geographical Areas / Government
    "administrative_area_level_1", "administrative_area_level_2", "country", "locality",
    "postal_code", "school_district", "city_hall", "courthouse", "embassy",
    "fire_station", "government_office", "local_government_office",
    "neighborhood_police_station", "police", "post_office",
    # Health and Wellness
    "chiropractor", "dental_clinic", "dentist", "doctor", "drugstore",
    "general_hospital", "hospital", "massage", "massage_spa", "medical_center",
    "medical_clinic", "medical_lab", "pharmacy", "physiotherapist", "sauna",
    "skin_care_clinic", "spa", "tanning_studio", "wellness_center", "yoga_studio",
    # Housing / Lodging
    "apartment_building", "apartment_complex", "condominium_complex", "housing_complex",
    "bed_and_breakfast", "budget_japanese_inn", "campground", "camping_cabin",
    "cottage", "extended_stay_hotel", "farmstay", "guest_house", "hostel", "hotel",
    "inn", "japanese_inn", "lodging", "mobile_home_park", "motel", "private_guest_room",
    "resort_hotel", "rv_park",
    # Natural Features / Worship
    "beach", "island", "lake", "mountain_peak", "nature_preserve", "river",
    "scenic_spot", "woods", "buddhist_temple", "church", "hindu_temple", "mosque",
    "shinto_shrine", "synagogue",
    # Services
    "aircraft_rental_service", "association_or_organization", "astrologer", "barber_shop",
    "beautician", "beauty_salon", "body_art_service", "catering_service", "cemetery",
    "chauffeur_service", "child_care_agency", "consultant", "courier_service", "electrician",
    "employment_agency", "florist", "food_delivery", "foot_care", "funeral_home",
    "hair_care", "hair_salon", "insurance_agency", "laundry", "lawyer", "locksmith",
    "makeup_artist", "marketing_consultant", "moving_company", "nail_salon",
    "non_profit_organization", "painter", "pet_boarding_service", "pet_care", "plumber",
    "psychic", "real_estate_agency", "roofing_contractor", "service",
    "shipping_service", "storage", "summer_camp_organizer", "tailor",
    "telecommunications_service_provider", "tour_agency", "tourist_information_center",
    "travel_agency", "veterinary_care",
    # Shopping
    "asian_grocery_store", "auto_parts_store", "bicycle_store", "book_store",
    "building_materials_store", "butcher_shop", "cell_phone_store", "clothing_store",
    "convenience_store", "cosmetics_store", "department_store", "discount_store",
    "discount_supermarket", "electronics_store", "farmers_market", "flea_market",
    "food_store", "furniture_store", "garden_center", "general_store", "gift_shop",
    "grocery_store", "hardware_store", "health_food_store", "home_goods_store",
    "home_improvement_store", "hypermarket", "jewelry_store", "liquor_store", "market",
    "pet_store", "shoe_store", "shopping_mall", "sporting_goods_store", "sportswear_store",
    "store", "supermarket", "tea_store", "thrift_store", "toy_store", "warehouse_store",
    "wholesaler", "womens_clothing_store",
    # Sports
    "arena", "athletic_field", "fishing_charter", "fishing_pier", "fishing_pond",
    "fitness_center", "golf_course", "gym", "ice_skating_rink", "indoor_golf_course",
    "playground", "race_course", "ski_resort", "sports_activity_location",
    "sports_club", "sports_coaching", "sports_complex", "sports_school", "stadium",
    "swimming_pool", "tennis_court",
    # Transportation
    "airport", "airstrip", "bike_sharing_station", "bridge", "bus_station", "bus_stop",
    "ferry_service", "ferry_terminal", "heliport", "international_airport",
    "light_rail_station", "park_and_ride", "subway_station", "taxi_service",
    "taxi_stand", "toll_station", "train_station", "train_ticket_office", "tram_stop",
    "transit_depot", "transit_station", "transit_stop", "transportation_service",
    "truck_stop",
}


def build_user_payload(profile: UserProfile) -> dict:
    user = profile.user
    interest_keys = []
    if isinstance(profile.preferences_vector, dict):
        interest_keys = list(profile.preferences_vector.keys())
    return {
        "id": str(profile.id),
        "username": user.username,
        "email": user.email,
        "full_name": f"{user.first_name} {user.last_name}".strip(),
        "avatar_url": profile.avatar_url,
        "bio": profile.bio,
        "is_verified": profile.is_verified,
        "has_interests": bool(profile.preferences_vector),
        "interests": interest_keys,
        "followers_count": profile.followers_count,
        "following_count": profile.following_count,
    }


def _format_interest_label(value: str) -> str:
    cleaned = re.sub(r"[_\-]+", " ", str(value or "").strip())
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.title() if cleaned else ""


def _interest_catalog():
    catalog = []
    group_names = sorted(GOOGLE_INTEREST_GROUPS.keys(), key=lambda x: x.lower())
    table_a_types = sorted(_fetch_google_table_a_types(), key=lambda x: x.lower())
    # Fallback: keep mapped subtype list available even if remote Table A fetch fails.
    fallback_children = sorted(
        {child for children in GOOGLE_INTEREST_GROUPS.values() for child in children},
        key=lambda x: x.lower(),
    )
    type_names = table_a_types if table_a_types else fallback_children

    index = 1
    for name in group_names + type_names:
        children = GOOGLE_INTEREST_GROUPS.get(name, [])
        catalog.append(
            {
                "id": index,
                "name": name,
                "title": _format_interest_label(name),
                "kind": "group" if children else "type",
                "children": children,
            }
        )
        index += 1
    return catalog


def _fetch_google_table_a_types(include_static: bool = True) -> set[str]:
    try:
        cached = cache.get(GOOGLE_TABLE_A_CACHE_KEY)
        if cached is not None:
            cached_set = set(cached)
            if include_static:
                return cached_set | GOOGLE_TABLE_A_STATIC_TYPES
            return cached_set
    except Exception:
        cached = None

    try:
        request = Request(
            GOOGLE_TABLE_A_DOC_URL,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        with urlopen(request, timeout=8) as response:
            html = response.read().decode("utf-8", errors="ignore")

        table_a_types = _extract_table_a_types_from_html(html)
        merged_table_a_types = table_a_types | GOOGLE_TABLE_A_STATIC_TYPES

        try:
            cache.set(
                GOOGLE_TABLE_A_CACHE_KEY,
                sorted(table_a_types),
                timeout=GOOGLE_TABLE_A_CACHE_TTL_SECONDS,
            )
        except Exception:
            pass
        if include_static:
            return merged_table_a_types
        return table_a_types
    except Exception:
        if include_static:
            return set(GOOGLE_TABLE_A_STATIC_TYPES)
        return set()


def _extract_table_a_types_from_html(html: str) -> set[str]:
    start = html.find("### Table A")
    if start == -1:
        start = html.find("Table A")
    end = html.find("### Table B", start + 1) if start != -1 else -1
    if end == -1 and start != -1:
        end = html.find("Table B", start + 1)

    section = html[start:end] if start != -1 and end != -1 else html

    candidates = set()
    # Pattern 1: Markdown-style inline code if present.
    candidates.update(re.findall(r"`([a-z0-9_]+)`", section))
    # Pattern 2: HTML <code> token blocks.
    candidates.update(re.findall(r"<code[^>]*>\s*([a-z0-9_]+)\s*</code>", section))
    # Pattern 3: Plain tokens in rendered/flattened text, constrained via known snapshot set.
    plain_tokens = set(re.findall(r"\b[a-z][a-z0-9_]{2,}\b", section))
    candidates.update(plain_tokens.intersection(GOOGLE_TABLE_A_STATIC_TYPES))
    return {
        token.strip()
        for token in candidates
        if token
        and token not in {"regions", "cities"}
        and ("_" in token or token in GOOGLE_TABLE_A_STATIC_TYPES)
    }


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = AuthService().authenticate_user(
            serializer.validated_data["email"],
            serializer.validated_data["password"],
        )
        return Response(AuthService().generate_tokens(user), status=status.HTTP_200_OK)


class RegisterView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, _profile, verification_url = AuthService().register_user(serializer, request=request)
        response_payload = {
            "detail": "Registration successful. Please verify your email.",
            "email": user.email,
            "requires_verification": True,
        }
        if settings.DEBUG and verification_url:
            response_payload["verification_url"] = verification_url
        return Response(response_payload, status=status.HTTP_201_CREATED)


class RefreshTokenView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TokenRefreshRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            AuthService().refresh_access_token(serializer.validated_data["refresh"]),
            status=status.HTTP_200_OK,
        )


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get("token", "").strip()
        if not token:
            return Response(
                {"detail": "Verification token is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload = validate_email_verification_token(token)
        except signing.SignatureExpired:
            return Response(
                {"detail": "Verification link has expired"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except signing.BadSignature:
            return Response(
                {"detail": "Invalid verification token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(id=payload.get("uid"), email__iexact=payload.get("email", "")).first()
        if user is None:
            return Response(
                {"detail": "Invalid verification token"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = UserProfile.objects.get_or_create(user=user)
        if profile.is_verified:
            return Response(
                {"detail": "Email is already verified"},
                status=status.HTTP_200_OK,
            )

        if not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])

        profile.is_verified = True
        profile.save(update_fields=["is_verified"])

        return Response(
            {"detail": "Email verified successfully. You can now log in."},
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = LogoutRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            AuthService().revoke_token(auth_header.split(" ", 1)[1])
        refresh_token = serializer.validated_data.get("refresh")
        if refresh_token:
            AuthService().revoke_token(refresh_token)
        return Response({"detail": "Logged out successfully"}, status=status.HTTP_200_OK)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self,request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        serializer = UserProfileSerializer(profile, context={"request": request})
        return Response(serializer.data)

    def patch(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        user = request.user

        username = request.data.get("username")
        full_name = request.data.get("full_name")
        bio = request.data.get("bio")
        avatar_url = request.data.get("avatar_url")
        current_password = request.data.get("current_password")
        new_password = request.data.get("new_password")

        user_updates = []
        if username is not None:
            normalized_username = str(username).strip()
            if len(normalized_username) < 3:
                return Response(
                    {"detail": "username must be at least 3 characters"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            username_taken = User.objects.filter(username__iexact=normalized_username).exclude(id=user.id).exists()
            if username_taken:
                return Response(
                    {"detail": "username is already taken"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.username = normalized_username
            user_updates.append("username")

        if full_name is not None:
            normalized_name = str(full_name).strip()
            if len(normalized_name) < 2:
                return Response(
                    {"detail": "full_name must be at least 2 characters"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            name_parts = normalized_name.split(maxsplit=1)
            user.first_name = name_parts[0]
            user.last_name = name_parts[1] if len(name_parts) > 1 else ""
            user_updates.extend(["first_name", "last_name"])

        if new_password is not None:
            if not current_password:
                return Response(
                    {"detail": "current_password is required to set a new password"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not user.check_password(str(current_password)):
                return Response(
                    {"detail": "current_password is incorrect"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                validate_password(new_password, user=user)
            except ValidationError as exc:
                return Response(
                    {"detail": " ".join(exc.messages)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(str(new_password))
            user_updates.append("password")

        if user_updates:
            if "password" in user_updates:
                user.save()
            else:
                user.save(update_fields=list(dict.fromkeys(user_updates)))

        profile_updates = []
        if bio is not None:
            profile.bio = str(bio).strip()
            profile_updates.append("bio")
        if avatar_url is not None:
            profile.avatar_url = str(avatar_url).strip()
            profile_updates.append("avatar_url")

        if profile_updates:
            profile.save(update_fields=profile_updates)

        return Response(
            {"user": build_user_payload(profile)},
            status=status.HTTP_200_OK,
        )

class ProfileView(APIView):
    permission_classes = [AllowAny]

    def get(self,request,id):
        profile = get_object_or_404(UserProfile,id=id)
        serializer = UserProfileSerializer(profile, context={"request": request})
        return Response(serializer.data)

class FollowView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self,request,id):
        follower = request.user.profile
        followed_profile = get_object_or_404(UserProfile,id=id)

        if follower == followed_profile:
            return Response(
                {"success":False,"message":"An account can not follow itself"},
                status =status.HTTP_400_BAD_REQUEST,

            )
        if follower.is_following(followed_profile):
            return Response(
                {"success":False,"message":"Followed account is already followed"},
                status = status.HTTP_400_BAD_REQUEST,
            )

        follower.follow(followed_profile)
        follower.refresh_from_db()
        followed_profile.refresh_from_db()
        serializer = FollowActionSerializer({
            "success": True,
            "message": "Successfully followed",
            "is_following": True,
            "followers_count": followed_profile.followers_count,
            "following_count": follower.following_count,
        })
        return Response(
            serializer.data,
            status = status.HTTP_200_OK

        )

class UnfollowView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self,request,id):
        follower = request.user.profile
        followed = get_object_or_404(UserProfile,id=id)

        if follower == followed:
            return Response(
                {"success": False, "message": "An account can not unfollow itself"},
                status=status.HTTP_400_BAD_REQUEST,

            )
        if not follower.is_following(followed):
            return Response(
                {"success": False, "message": "Unfollowed account can not unfollowed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        follower.unfollow(followed)
        follower.refresh_from_db()
        followed.refresh_from_db()
        serializer = FollowActionSerializer({
            "success": True,
            "message": "Successfully unfollowed",
            "is_following": False,
            "followers_count": followed.followers_count,
            "following_count": follower.following_count,
        })
        return Response(
            serializer.data,
            status=status.HTTP_200_OK

        )


class InterestAvailableView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        interests = InterestService().list_available_interests()
        return Response(
            {
                "interests": interests,
                "source": "database",
                "count": len(interests),
            },
            status=status.HTTP_200_OK,
        )


class InterestSourceHealthView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(InterestService().get_health(), status=status.HTTP_200_OK)


class InterestSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        interest_ids = request.data.get("interest_ids", [])
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        interests = InterestService().save_user_interests(profile, interest_ids)
        preference_keys = list((profile.preferences_vector or {}).keys())

        return Response(
            {
                "interests": interests,
                "preference_keys": preference_keys,
                "message": "Interests updated successfully",
            },
            status=status.HTTP_200_OK,
        )
