const LEGACY_ROUTE_TITLE = /^Rota:\s*(.+)$/i;
const LEGACY_ROUTE_DATE = /^Baslangic:\s*(.+)$/i;
const LEGACY_ROUTE_STOPS = /^Durak:\s*(.+)$/i;
const URL_PATTERN = /(https?:\/\/\S+|\/trips\/share\/\S+|excursa:\/\/\S+)/i;

const normalizeStop = (stop, index = 0) => {
  const poi = stop?.poi || stop || {};
  const metadata = poi?.metadata || {};
  const tags = Array.isArray(poi?.tags) ? poi.tags.filter(Boolean) : [];

  return {
    id: stop?.id || poi?.id || `stop-${index}`,
    order: Number(stop?.order_index ?? index) + 1,
    name: poi?.name || `Durak ${index + 1}`,
    category: poi?.category || metadata?.category || tags[0] || null,
    subtitle: stop?.notes || poi?.address || metadata?.summary || null,
    latitude: poi?.latitude ?? null,
    longitude: poi?.longitude ?? null,
  };
};

const buildSummaryFromStops = (stops = []) => {
  const stopNames = stops.map((stop) => stop?.name).filter(Boolean).slice(0, 3);
  if (!stopNames.length) {
    return 'Rotadaki duraklari modern kart deneyimiyle kesfet.';
  }
  return `${stopNames.join(', ')}${stops.length > 3 ? ' ve daha fazlasi' : ''}`;
};

export const buildRouteShareData = (trip, shareLink, authorName) => {
  if (!trip?.id) return null;

  const stops = Array.isArray(trip?.stops) ? trip.stops.map(normalizeStop) : [];
  const totalStops = Number(trip?.total_stops) || stops.length;
  const durationMinutes = Number(trip?.total_duration) || null;
  const estimatedCost = trip?.estimated_cost ?? null;
  const visibility = trip?.visibility || null;
  const transportMode = trip?.transport_mode || null;
  const summary = buildSummaryFromStops(stops);

  return {
    id: String(trip.id),
    title: trip.title || 'Paylasilan rota',
    summary,
    share_link: shareLink || null,
    author_name: authorName || trip?.username || null,
    start_date: trip?.start_date || null,
    end_date: trip?.end_date || null,
    created_at: trip?.created_at || null,
    visibility,
    transport_mode: transportMode,
    total_stops: totalStops,
    total_duration: durationMinutes,
    estimated_cost: estimatedCost,
    stops,
    stop_categories: Array.from(
      new Set(stops.map((stop) => stop.category).filter(Boolean))
    ).slice(0, 4),
  };
};

export const normalizeRouteData = (routeData) => {
  if (!routeData || typeof routeData !== 'object') return null;

  const stops = Array.isArray(routeData.stops)
    ? routeData.stops.map((stop, index) => normalizeStop(stop, index))
    : [];

  return {
    ...routeData,
    id: routeData.id ? String(routeData.id) : null,
    title: routeData.title || 'Paylasilan rota',
    summary: routeData.summary || buildSummaryFromStops(stops),
    total_stops: Number(routeData.total_stops) || stops.length,
    total_duration:
      routeData.total_duration === 0 || routeData.total_duration
        ? Number(routeData.total_duration)
        : null,
    stops,
    stop_categories: Array.isArray(routeData.stop_categories)
      ? routeData.stop_categories.filter(Boolean).slice(0, 4)
      : Array.from(new Set(stops.map((stop) => stop.category).filter(Boolean))).slice(0, 4),
  };
};

export const parseLegacyRouteContent = (content) => {
  const lines = String(content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const route = {};
  const cleanedLines = [];

  lines.forEach((line) => {
    if (LEGACY_ROUTE_TITLE.test(line)) {
      route.title = line.replace(LEGACY_ROUTE_TITLE, '$1').trim();
      return;
    }
    if (LEGACY_ROUTE_DATE.test(line)) {
      route.start_date_label = line.replace(LEGACY_ROUTE_DATE, '$1').trim();
      return;
    }
    if (LEGACY_ROUTE_STOPS.test(line)) {
      const stopValue = line.replace(LEGACY_ROUTE_STOPS, '$1').trim();
      route.total_stops = Number.parseInt(stopValue, 10) || stopValue;
      return;
    }
    if (URL_PATTERN.test(line)) {
      route.share_link = line.match(URL_PATTERN)?.[0] || line;
      return;
    }
    cleanedLines.push(line);
  });

  const cleanedContent = cleanedLines.join('\n').trim();

  if (!route.title && !route.share_link) {
    return { cleanedContent, routeData: null };
  }

  return {
    cleanedContent,
    routeData: normalizeRouteData({
      title: route.title,
      summary: 'Rota paylasimi',
      total_stops:
        typeof route.total_stops === 'number' ? route.total_stops : null,
      legacy_start_label: route.start_date_label || null,
      share_link: route.share_link || null,
      stops: [],
    }),
  };
};

export const getPostPresentation = (post) => {
  const normalized = normalizeRouteData(post?.route_data);
  if (normalized) {
    return {
      cleanedContent: String(post?.content || '').trim(),
      routeData: normalized,
      isLegacyRoute: false,
    };
  }

  const parsed = parseLegacyRouteContent(post?.content);
  return {
    cleanedContent: parsed.cleanedContent,
    routeData: parsed.routeData,
    isLegacyRoute: !!parsed.routeData,
  };
};

export const formatRouteDuration = (minutes) => {
  if (!minutes && minutes !== 0) return null;
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
};

export const formatRouteVisibility = (value) => {
  if (value === 'PUBLIC') return 'Herkese acik';
  if (value === 'PRIVATE') return 'Ozel rota';
  return value || null;
};

export const formatTransportMode = (value) => {
  const map = {
    DRIVING: 'Arac',
    WALKING: 'Yuruyus',
    CYCLING: 'Bisiklet',
    TRANSIT: 'Toplu tasima',
  };
  return map[value] || null;
};
