import { Linking } from 'react-native';

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildGoogleMapsUrl = ({ name, address, latitude, longitude }) => {
  const lat = toNumberOrNull(latitude);
  const lng = toNumberOrNull(longitude);
  const label = String(name || '').trim();
  const addressText = String(address || '').trim();

  if (lat !== null && lng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  const query = [label, addressText].filter(Boolean).join(' ').trim();
  if (query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  return null;
};

export const openInGoogleMaps = async (params) => {
  const url = buildGoogleMapsUrl(params);
  if (!url) {
    throw new Error('Gecerli konum veya adres bilgisi bulunamadi.');
  }

  await Linking.openURL(url);
};

