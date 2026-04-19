"""
Supported city metadata for POI generation and map discovery.

The first product-ready scope focuses on Turkey's largest metropolitan
provinces so city search does not depend on already-synced POI rows.
"""

TOP_TURKEY_CITIES = [
    {
        "name": "Istanbul",
        "aliases": ["istanbul"],
        "latitude": 41.0082,
        "longitude": 28.9784,
        "radius": 50000,
    },
    {
        "name": "Ankara",
        "aliases": ["ankara"],
        "latitude": 39.9334,
        "longitude": 32.8597,
        "radius": 40000,
    },
    {
        "name": "Izmir",
        "aliases": ["izmir", "izmir"],
        "latitude": 38.4237,
        "longitude": 27.1428,
        "radius": 45000,
    },
    {
        "name": "Bursa",
        "aliases": ["bursa"],
        "latitude": 40.1828,
        "longitude": 29.0663,
        "radius": 35000,
    },
    {
        "name": "Antalya",
        "aliases": ["antalya"],
        "latitude": 36.8969,
        "longitude": 30.7133,
        "radius": 50000,
    },
    {
        "name": "Konya",
        "aliases": ["konya"],
        "latitude": 37.8746,
        "longitude": 32.4932,
        "radius": 45000,
    },
    {
        "name": "Adana",
        "aliases": ["adana"],
        "latitude": 37.0000,
        "longitude": 35.3213,
        "radius": 40000,
    },
    {
        "name": "Sanliurfa",
        "aliases": ["sanliurfa", "sanli urfa", "urfa"],
        "latitude": 37.1674,
        "longitude": 38.7955,
        "radius": 50000,
    },
    {
        "name": "Gaziantep",
        "aliases": ["gaziantep", "antep"],
        "latitude": 37.0662,
        "longitude": 37.3833,
        "radius": 40000,
    },
    {
        "name": "Kocaeli",
        "aliases": ["kocaeli", "izmit"],
        "latitude": 40.7654,
        "longitude": 29.9408,
        "radius": 35000,
    },
]


def normalize_city_name(value: str) -> str:
    replacements = str(value or "").strip().lower()
    replacements = replacements.replace("ı", "i").replace("İ", "i")
    replacements = replacements.replace("ş", "s").replace("Ş", "s")
    replacements = replacements.replace("ğ", "g").replace("Ğ", "g")
    replacements = replacements.replace("ü", "u").replace("Ü", "u")
    replacements = replacements.replace("ö", "o").replace("Ö", "o")
    replacements = replacements.replace("ç", "c").replace("Ç", "c")
    replacements = replacements.replace("-", " ").replace("_", " ")
    return " ".join(replacements.split())


def get_supported_city(value: str) -> dict | None:
    normalized = normalize_city_name(value)
    if not normalized:
        return None
    for city in TOP_TURKEY_CITIES:
        names = [city["name"], *(city.get("aliases") or [])]
        if normalized in {normalize_city_name(name) for name in names}:
            return city
    return None


def search_supported_cities(query: str = "") -> list[dict]:
    normalized = normalize_city_name(query)
    if not normalized:
        return TOP_TURKEY_CITIES
    results = []
    for city in TOP_TURKEY_CITIES:
        names = [city["name"], *(city.get("aliases") or [])]
        if any(normalized in normalize_city_name(name) for name in names):
            results.append(city)
    return results
