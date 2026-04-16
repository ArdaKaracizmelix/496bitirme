import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import useAuthStore from './src/store/authStore';

const queryClient = new QueryClient();

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false);

  /**
   * Initialize authentication state on app launch
   */
  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setBootstrapTimedOut(true);
    }, 4000);
    return () => clearTimeout(timeout);
  }, []);

  // Avoid blank white screen during initialization
  if (isInitializing && !bootstrapTimedOut) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color="#1a1a2e" />
        <Text style={styles.loadingText}>Yukleniyor...</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={styles.appRoot}>
        <SafeAreaProvider>
          <AppNavigator />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    gap: 12,
  },
  loadingText: {
    color: '#1a1a2e',
    fontSize: 14,
  },
});
