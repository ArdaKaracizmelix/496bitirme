import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

export default function AppAvatar({ uri, style, imageStyle, size }) {
  const [hasError, setHasError] = useState(false);
  const normalizedUri = useMemo(() => String(uri || '').trim(), [uri]);

  useEffect(() => {
    setHasError(false);
  }, [normalizedUri]);

  const shouldShowImage = !!normalizedUri && !hasError;

  return (
    <View
      style={[
        styles.container,
        size ? { width: size, height: size, borderRadius: size / 2 } : null,
        style,
      ]}
    >
      {shouldShowImage ? (
        <Image
          source={{ uri: normalizedUri }}
          style={[styles.image, imageStyle]}
          onError={() => setHasError(true)}
        />
      ) : (
        <View style={styles.placeholder}>
          <View style={styles.head} />
          <View style={styles.body} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#f2f2f6',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#f1f1f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  head: {
    width: '36%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: '#c9cad6',
    marginBottom: '8%',
  },
  body: {
    width: '64%',
    height: '34%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    backgroundColor: '#c9cad6',
  },
});
