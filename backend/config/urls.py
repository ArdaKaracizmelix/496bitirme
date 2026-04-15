from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/',include('core.urls')),
    path('api/user/',include('user.urls')),
    path('api/locations/', include('locations.urls')),
    path('api/recommendations/', include('recommendations.urls')),
    path('api/community/', include('community.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/trips/', include('trips.urls')),
    path('api/media_storage/', include('media_storage.urls')),
    path('api/ai/', include('ai_service.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
