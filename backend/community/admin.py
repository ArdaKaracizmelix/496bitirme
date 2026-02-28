"""
Django admin configuration for community app.
Note: MongoDB models are not auto-registered in Django admin.
For MongoDB management, consider using a MongoDB GUI tool like MongoDB Compass.
"""
from django.contrib import admin

# Community app models use mongoengine, not Django ORM
# Therefore, they are not registered in Django admin.
# To manage MongoDB documents, use:
# 1. MongoDB Compass GUI
# 2. MongoDB CLI
# 3. Third-party mongoengine admin packages
