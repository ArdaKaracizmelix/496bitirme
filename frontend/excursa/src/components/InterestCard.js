import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function InterestCard({
  item,
  selected,
  disabled,
  onPress,
}) {
  const children = Array.isArray(item.children) ? item.children : [];
  const summary = children.length
    ? children.slice(0, 3).map((child) => child.title || child.name).join(' • ')
    : 'Sana uygun rota ve mekan onerilerini guclendirir.';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && !disabled && styles.cardPressed,
        disabled && styles.cardDisabled,
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
          <Text style={[styles.iconText, selected && styles.iconTextSelected]}>
            {(item.title || item.name || '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={[styles.statusPill, selected && styles.statusPillSelected]}>
          <Text style={[styles.statusText, selected && styles.statusTextSelected]}>
            {selected ? 'Secildi' : 'Sec'}
          </Text>
        </View>
      </View>

      <Text style={[styles.title, selected && styles.titleSelected]}>
        {item.title || item.name}
      </Text>
      <Text style={[styles.summary, selected && styles.summarySelected]} numberOfLines={2}>
        {summary}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 152,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e7dfd1',
    backgroundColor: '#fffdf8',
    padding: 16,
    minHeight: 158,
    shadowColor: '#111126',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  cardSelected: {
    borderColor: '#1a1a2e',
    backgroundColor: '#1a1a2e',
    shadowOpacity: 0.16,
    elevation: 4,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  cardDisabled: {
    opacity: 0.62,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0e7d6',
  },
  iconWrapSelected: {
    backgroundColor: '#d7c49e',
  },
  iconText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '900',
  },
  iconTextSelected: {
    color: '#1a1a2e',
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f3eee5',
  },
  statusPillSelected: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  statusText: {
    color: '#6f6657',
    fontSize: 11,
    fontWeight: '800',
  },
  statusTextSelected: {
    color: '#fff',
  },
  title: {
    color: '#1a1a2e',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 8,
  },
  titleSelected: {
    color: '#fff',
  },
  summary: {
    color: '#776f63',
    fontSize: 13,
    lineHeight: 18,
  },
  summarySelected: {
    color: '#dedbea',
  },
});
