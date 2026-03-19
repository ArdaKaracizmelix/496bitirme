import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppNavigator from './src/navigation/AppNavigator';
import useAuthStore from './src/store/authStore';

const queryClient = new QueryClient();

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const isInitializing = useAuthStore((state) => state.isInitializing);

  /**
   * Initialize authentication state on app launch
   */
  useEffect(() => {
    initializeAuth();
  }, []);

  // Don't render until authentication is initialized
  if (isInitializing) {
    return null; // Or show a splash screen
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppNavigator />
    </QueryClientProvider>
  );
}
