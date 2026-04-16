import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatTimeAgo } from './SocialPostCard';
import {
  formatRouteDuration,
  formatRouteVisibility,
  formatTransportMode,
} from '../utils/routeShareUtils';

const colors = {
  ink: '#1a1a2e',
  page: '#f7f3ea',
  card: '#fffdf8',
  line: '#e6dccb',
  muted: '#7c7568',
  soft: '#efe5d5',
  accent: '#9b8356',
};

function StatPill({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.statPill}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function StopRow({ stop }) {
  return (
    <View style={styles.stopRow}>
      <View style={styles.stopIndex}>
        <Text style={styles.stopIndexText}>{stop.order}</Text>
      </View>
      <View style={styles.stopContent}>
        <Text style={styles.stopTitle}>{stop.name}</Text>
        {!!stop.category && <Text style={styles.stopMeta}>{stop.category}</Text>}
        {!!stop.subtitle && (
          <Text style={styles.stopSubtitle} numberOfLines={2}>
            {stop.subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function RouteShareCard({ routeData, compact = false }) {
  const [visible, setVisible] = useState(false);

  const stats = useMemo(
    () => [
      { label: 'Durak', value: routeData?.total_stops ? String(routeData.total_stops) : null },
      { label: 'Sure', value: formatRouteDuration(routeData?.total_duration) },
      { label: 'Mod', value: formatTransportMode(routeData?.transport_mode) },
      { label: 'Gorunurluk', value: formatRouteVisibility(routeData?.visibility) },
    ].filter((item) => item.value),
    [routeData]
  );

  if (!routeData) return null;

  return (
    <>
      <Pressable style={[styles.card, compact && styles.cardCompact]} onPress={() => setVisible(true)}>
        <View style={styles.hero}>
          <View>
            <Text style={styles.kicker}>Paylasilan rota</Text>
            <Text style={styles.title} numberOfLines={2}>
              {routeData.title}
            </Text>
            <Text style={styles.summary} numberOfLines={2}>
              {routeData.summary}
            </Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>ROTA</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          {stats.slice(0, compact ? 2 : 4).map((item) => (
            <StatPill key={item.label} label={item.label} value={item.value} />
          ))}
        </View>

        {!!routeData.stop_categories?.length && (
          <View style={styles.categoryRow}>
            {routeData.stop_categories.map((category) => (
              <View key={category} style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>{category}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {routeData.author_name ? `${routeData.author_name} tarafindan paylasildi` : 'Rota detaylarini gor'}
          </Text>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>Detayi ac</Text>
          </View>
        </View>
      </Pressable>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
              <Text style={styles.sheetKicker}>Rota detayi</Text>
              <Text style={styles.sheetTitle}>{routeData.title}</Text>
              {!!routeData.summary && <Text style={styles.sheetSummary}>{routeData.summary}</Text>}

              <View style={styles.detailStatsGrid}>
                {stats.map((item) => (
                  <View key={item.label} style={styles.detailStatCard}>
                    <Text style={styles.detailStatLabel}>{item.label}</Text>
                    <Text style={styles.detailStatValue}>{item.value}</Text>
                  </View>
                ))}
                {!!routeData.author_name && (
                  <View style={styles.detailStatCard}>
                    <Text style={styles.detailStatLabel}>Olusturan</Text>
                    <Text style={styles.detailStatValue}>{routeData.author_name}</Text>
                  </View>
                )}
                {!!routeData.created_at && (
                  <View style={styles.detailStatCard}>
                    <Text style={styles.detailStatLabel}>Olusturma</Text>
                    <Text style={styles.detailStatValue}>{formatTimeAgo(routeData.created_at)}</Text>
                  </View>
                )}
              </View>

              <View style={styles.stopsBlock}>
                <Text style={styles.stopsTitle}>Duraklar</Text>
                {routeData.stops?.length ? (
                  routeData.stops.map((stop) => <StopRow key={stop.id} stop={stop} />)
                ) : (
                  <View style={styles.emptyStops}>
                    <Text style={styles.emptyStopsTitle}>Durak detaylari bu paylasimda yok</Text>
                    <Text style={styles.emptyStopsText}>
                      Yeni rota paylasimlari durak listesi ve zengin ozet ile gorunecek.
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)}>
                <Text style={styles.closeButtonText}>Kapat</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cardCompact: {
    marginHorizontal: 0,
  },
  hero: {
    padding: 18,
    backgroundColor: colors.soft,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  kicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    marginTop: 6,
  },
  summary: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 320,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.ink,
  },
  heroBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  statPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#f5efe5',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  statValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  categoryChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#f0e4d1',
  },
  categoryChipText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '800',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  cta: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.ink,
  },
  ctaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(14,14,26,0.46)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.card,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 4,
    backgroundColor: '#d3c7b4',
    marginTop: 12,
  },
  sheetContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
  },
  sheetKicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sheetTitle: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    marginTop: 8,
  },
  sheetSummary: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  detailStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  detailStatCard: {
    width: '48%',
    minHeight: 78,
    borderRadius: 18,
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  detailStatLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  detailStatValue: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
    marginTop: 6,
  },
  stopsBlock: {
    marginTop: 20,
  },
  stopsTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  stopRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
  },
  stopIndex: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stopIndexText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  stopContent: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  stopTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  stopMeta: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  stopSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  emptyStops: {
    borderRadius: 18,
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  emptyStopsTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyStopsText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  closeButton: {
    marginTop: 20,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    paddingVertical: 14,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
});
