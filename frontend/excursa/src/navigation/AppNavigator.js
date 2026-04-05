import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import LoginPage from '../pages/auth/LoginPage';
import RegisterPage from '../pages/auth/RegisterPage';
import InterestSelectionPage from '../pages/auth/InterestSelectionPage';
import MapScreen from '../pages/map/MapScreen';
import POIDetailScreen from '../pages/map/POIDetailScreen';
import ItineraryPage from '../pages/itinerary/ItineraryPage';
import ChatbotPage from '../pages/chatbot/ChatbotPage';
import SavedTripsScreen from '../screens/SavedTripsScreen';
import IterinaryBuilderScreen from '../screens/IterinaryBuilderScreen';
import CommunityFeedScreen from '../screens/CommunityFeedScreen';
import CreatePostScreen from '../screens/CreatePostScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import EditProfileScreen from '../screens/EditProfileScreen';

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

/**
 * Trips/Itinerary Stack Navigator - Includes SavedTripsScreen and IterinaryBuilderScreen
 */
function TripsStack() {
  return (
    <Stack.Navigator 
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen 
        name="SavedTrips" 
        component={SavedTripsScreen}
      />
      <Stack.Screen 
        name="IterinaryBuilder" 
        component={IterinaryBuilderScreen}
        options={{
          animationEnabled: true,
        }}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="ProfileHome"
        component={ProfileScreen}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{
          animationEnabled: true,
        }}
      />
      <Stack.Screen
        name="InterestSelection"
        component={InterestSelectionPage}
        options={{
          animationEnabled: true,
        }}
      />
    </Stack.Navigator>
  );
}

/**
 * Social Stack Navigator - Includes CommunityFeedScreen, CreatePostScreen, and ProfileScreen
 */
function SocialStack() {
  return (
    <Stack.Navigator 
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen 
        name="CommunityFeed" 
        component={CommunityFeedScreen}
        options={{
          title: 'Haberler',
        }}
      />
      <Stack.Screen 
        name="CreatePost" 
        component={CreatePostScreen}
        options={{
          animationEnabled: true,
          cardStyle: { backgroundColor: '#fff' },
        }}
      />
      <Stack.Screen 
        name="UserProfile" 
        component={ProfileScreen}
        options={{
          animationEnabled: true,
        }}
      />
      <Stack.Screen 
        name="EditProfile" 
        component={EditProfileScreen}
        options={{
          animationEnabled: true,
        }}
      />
      <Stack.Screen 
        name="InterestSelection" 
        component={InterestSelectionPage}
        options={{
          animationEnabled: true,
        }}
      />
      <Stack.Screen 
        name="PostDetail" 
        component={PostDetailScreen}
        options={{
          animationEnabled: true,
        }}
      />
      <Stack.Screen 
        name="EditPost" 
        component={CreatePostScreen}
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
        component={SocialStack}
        options={{
          tabBarLabel: 'Sosyal',
        }}
      />
      <Tab.Screen 
        name="Trips" 
        component={TripsStack}
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
        component={ProfileStack}
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
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
}

function OnboardingStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animationEnabled: true,
      }}
    >
      <Stack.Screen
        name="InterestSelection"
        component={InterestSelectionPage}
        options={{
          cardStyle: { backgroundColor: '#fff' },
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const needsInterests = isAuthenticated && user?.has_interests === false;

  return (
    <NavigationContainer>
      {isAuthenticated ? (needsInterests ? <OnboardingStack /> : <MainTabs />) : <AuthStack />}
    </NavigationContainer>
  );
}
