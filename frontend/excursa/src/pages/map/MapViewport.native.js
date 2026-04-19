import React from 'react';
import { View, Text, Platform } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';

export default function MapViewport({
  mapRef,
  style,
  currentRegion,
  onRegionChangeComplete,
  onMapPanDrag,
  displayedMarkers,
  selectedPOI,
  handleMarkerPress,
  navigation,
  getCategoryColor,
  getCategoryName,
  getCategoryIcon,
  styles,
}) {
  const renderMarker = (item) => {
    if (item.type === 'cluster') {
      return (
        <Marker
          key={item.id || `cluster-${item.latitude}-${item.longitude}`}
          coordinate={{
            latitude: item.latitude,
            longitude: item.longitude,
          }}
          onPress={() => {
            if (mapRef.current && Array.isArray(item.members)) {
              mapRef.current.fitToCoordinates(
                item.members.map((member) => ({
                  latitude: member.latitude,
                  longitude: member.longitude,
                })),
                { edgePadding: { top: 60, right: 60, bottom: 120, left: 60 }, animated: true }
              );
            }
          }}
        >
          <View style={[styles.clusterMarker, { backgroundColor: '#111827' }]}>
            <Text style={styles.clusterText}>{item.count}</Text>
          </View>
        </Marker>
      );
    }

    const category = item.display_category || item.category;
    const isSelected = selectedPOI?.id === item.id;

    return (
      <Marker
        key={`poi-${item.id || `${item.latitude}-${item.longitude}`}`}
        coordinate={{
          latitude: item.latitude,
          longitude: item.longitude,
        }}
        onPress={() => handleMarkerPress(item)}
      >
        <View
          style={[
            styles.markerContainer,
            {
              backgroundColor: isSelected ? '#ffffff' : getCategoryColor(category),
              transform: [{ scale: isSelected ? 1.12 : 1 }],
            },
          ]}
        >
          <View
            style={[
              styles.markerInner,
              { backgroundColor: getCategoryColor(category) },
            ]}
          >
            <Text style={styles.markerEmoji}>{getCategoryIcon(category)}</Text>
          </View>
        </View>

        {isSelected && (
          <Callout onPress={() => navigation.navigate('POIDetail', { poiId: item.id })}>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{item.name}</Text>
              <Text style={styles.calloutCategory}>{getCategoryName(category)}</Text>
              <Text style={styles.calloutRating}>Rating {Number(item.average_rating || 0).toFixed(1)}</Text>
            </View>
          </Callout>
        )}
      </Marker>
    );
  };

  return (
    <MapView
      ref={mapRef}
      style={style}
      initialRegion={currentRegion}
      onRegionChangeComplete={onRegionChangeComplete}
      onPanDrag={onMapPanDrag}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
    >
      {displayedMarkers.map((marker) => renderMarker(marker))}
    </MapView>
  );
}
