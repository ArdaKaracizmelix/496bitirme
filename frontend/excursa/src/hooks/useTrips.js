/**
 * Custom React Hook for Trips
 * Provides convenient access to trip operations and state
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useTripStore from '../store/tripStore';
import TripService from '../services/TripService';

/**
 * Hook: Get all trips with filtering options
 */
export const useTrips = (filterStatus = null) => {
  return useQuery({
    queryKey: ['trips', filterStatus],
    queryFn: () => TripService.fetchTrips(
      filterStatus ? { status: filterStatus } : {}
    ),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Hook: Get upcoming trips
 */
export const useUpcomingTrips = () => {
  return useQuery({
    queryKey: ['trips', 'upcoming'],
    queryFn: () => TripService.fetchUpcomingTrips(),
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Hook: Get past trips
 */
export const usePastTrips = () => {
  return useQuery({
    queryKey: ['trips', 'past'],
    queryFn: () => TripService.fetchPastTrips(),
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Hook: Get single trip
 */
export const useTrip = (tripId) => {
  return useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => TripService.fetchTripById(tripId),
    enabled: !!tripId,
    staleTime: 2 * 60 * 1000,
  });
};

/**
 * Hook: Create new trip mutation
 */
export const useCreateTrip = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tripData) => TripService.createTrip(tripData),
    onSuccess: (newTrip) => {
      // Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.setQueryData(['trip', newTrip.id], newTrip);
    },
  });
};

/**
 * Hook: Update trip mutation
 */
export const useUpdateTrip = (tripId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates) => TripService.updateTrip(tripId, updates),
    onSuccess: (updatedTrip) => {
      queryClient.setQueryData(['trip', tripId], updatedTrip);
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
};

/**
 * Hook: Delete trip mutation
 */
export const useDeleteTrip = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tripId) => TripService.deleteTrip(tripId),
    onSuccess: (_, tripId) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.removeQueries({ queryKey: ['trip', tripId] });
    },
  });
};

/**
 * Hook: Add stop to trip
 */
export const useAddStop = (tripId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ poiId, orderIndex }) =>
      TripService.addStopToTrip(tripId, poiId, orderIndex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });
};

/**
 * Hook: Remove stop from trip
 */
export const useRemoveStop = (tripId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId) => TripService.removeStopFromTrip(tripId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });
};

/**
 * Hook: Reorder stops mutation
 */
export const useReorderStops = (tripId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stopsData) => TripService.reorderStops(tripId, stopsData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });
};

/**
 * Hook: Optimize route mutation
 */
export const useOptimizeRoute = (tripId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transportMode = 'DRIVING') =>
      TripService.optimizeRoute(tripId, transportMode),
    onSuccess: (optimizedTrip) => {
      queryClient.setQueryData(['trip', tripId], optimizedTrip);
    },
  });
};

/**
 * Hook: Clone trip mutation
 */
export const useCloneTrip = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tripId) => TripService.cloneTrip(tripId),
    onSuccess: (clonedTrip) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.setQueryData(['trip', clonedTrip.id], clonedTrip);
    },
  });
};

/**
 * Hook: Share trip mutation
 */
export const useShareTrip = () => {
  return useMutation({
    mutationFn: (tripId) => TripService.shareTrip(tripId),
  });
};

/**
 * Hook: Export to calendar mutation
 */
export const useExportToCalendar = () => {
  return useMutation({
    mutationFn: (tripId) => TripService.exportToCalendar(tripId),
  });
};

/**
 * Hook: Initialize trip data on mount
 */
export const useInitializeTripsData = () => {
  const refreshAllTrips = useTripStore((state) => state.refreshAllTrips);

  useEffect(() => {
    refreshAllTrips();
  }, [refreshAllTrips]);
};

export default useTrips;
