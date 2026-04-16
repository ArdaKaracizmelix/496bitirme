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
  styles,
}) {
  const renderMarker = (item) => {
    if (item.type === 'cluster') {
      return (
        <Marker
          key={`cluster-${item.latitude}-${item.longitude}`}
          coordinate={{
            latitude: item.latitude,
            longitude: item.longitude,
          }}
          onPress={() => {
            if (mapRef.current) {
              mapRef.current.fitToCoordinates(
                item.members.map((member) => ({
                  latitude: member.latitude,
                  longitude: member.longitude,
                })),
                { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 } }
              );
            }
          }}
        >
          <View style={[styles.clusterMarker, { backgroundColor: '#2980b9' }]}>
            <Text style={styles.clusterText}>{item.count}</Text>
          </View>
        </Marker>
      );
    }

    return (
      <Marker
        key={item.id}
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
              backgroundColor: selectedPOI?.id === item.id ? '#fff' : getCategoryColor(item.category),
            },
          ]}
        >
          <View
            style={[
              styles.markerInner,
              { backgroundColor: getCategoryColor(item.category) },
            ]}
          >
            <Text style={styles.markerEmoji}>ğŸ“</Text>
          </View>
        </View>

        {selectedPOI?.id === item.id && (
          <Callout onPress={() => navigation.navigate('POIDetail', { poiId: item.id })}>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{item.name}</Text>
              <Text style={styles.calloutCategory}>{getCategoryName(item.category)}</Text>
              <Text style={styles.calloutRating}>â­ {item.average_rating?.toFixed(1)}</Text>
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
