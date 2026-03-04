"""
Core app views for health checks and system status.
"""

from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status


class HealthCheckView(APIView):
    """
    Simple health check endpoint.
    
    Used by load balancers and monitoring tools to verify the application is running.
    """
    
    def get(self, request):
        """
        Check application health status.
        
        Returns:
            Response: Simple JSON response indicating the application is healthy.
        """
        return Response(
            {
                "status": "ok",
                "message": "Application is running successfully",
            },
            status=status.HTTP_200_OK
        )

