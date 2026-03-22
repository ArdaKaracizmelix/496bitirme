import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import LoginPage from '../pages/auth/LoginPage';
import RegisterPage from '../pages/auth/RegisterPage';
import InterestSelectionPage from '../pages/auth/InterestSelectionPage';
import MapScreen from '../pages/map/MapScreen';
import POIDetailScreen from '../pages/map/POIDetailScreen';
import SocialPage from '../pages/social/SocialPage';
import ItineraryPage from '../pages/itinerary/ItineraryPage';
import ChatbotPage from '../pages/chatbot/ChatbotPage';
import ProfilePage from '../pages/social/ProfilePage';

import useAuthStore from '../store/authStore';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

/**
 * Map Stack Navigator - Includes MapScreen and POIDetailScreen
 */
function MapStack() {
  return (
    <Stack.Navigator 
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen 
        name="MapExplore" 
        component={MapScreen}
      />
      <Stack.Screen 
        name="POIDetail" 
        component={POIDetailScreen}
        options={{
          animationEnabled: true,
        }}
      />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen 
        name="Map" 
        component={MapStack}
        options={{
          tabBarLabel: 'Harita',
        }}
      />
      <Tab.Screen 
        name="Social" 
        component={SocialPage}
        options={{
          tabBarLabel: 'Sosyal',
        }}
      />
      <Tab.Screen 
        name="Itinerary" 
        component={ItineraryPage}
        options={{
          tabBarLabel: 'Rota',
        }}
      />
      <Tab.Screen 
        name="Chatbot" 
        component={ChatbotPage}
        options={{
          tabBarLabel: 'Chatbot',
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfilePage}
        options={{
          tabBarLabel: 'Profil',
        }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        animationEnabled: true,
      }}
    >
      <Stack.Screen 
        name="Login" 
        component={LoginPage}
        options={{
          cardStyle: { backgroundColor: '#fff' },
        }}
      />
      <Stack.Screen 
        name="Register" 
        component={RegisterPage}
        options={{
          cardStyle: { backgroundColor: '#fff' },
        }}
      />
      <Stack.Screen 
        name="InterestSelection" 
        component={InterestSelectionPage}
        options={{
          cardStyle: { backgroundColor: '#fff' },
          gestureEnabled: false, // Prevent swiping back
        }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}