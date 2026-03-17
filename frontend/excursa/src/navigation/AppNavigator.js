import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import LoginPage from '../pages/auth/LoginPage';
import RegisterPage from '../pages/auth/RegisterPage';
import MapPage from '../pages/map/MapPage';
import SocialPage from '../pages/social/SocialPage';
import ItineraryPage from '../pages/itinerary/ItineraryPage';
import ChatbotPage from '../pages/chatbot/ChatbotPage';
import ProfilePage from '../pages/social/ProfilePage';

import useAuthStore from '../store/authStore';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Map" component={MapPage} />
      <Tab.Screen name="Social" component={SocialPage} />
      <Tab.Screen name="Itinerary" component={ItineraryPage} />
      <Tab.Screen name="Chatbot" component={ChatbotPage} />
      <Tab.Screen name="Profile" component={ProfilePage} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginPage} />
      <Stack.Screen name="Register" component={RegisterPage} />
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