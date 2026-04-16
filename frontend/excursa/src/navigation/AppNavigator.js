import React from 'react';
import { Platform, Text } from 'react-native';
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
import FollowersListScreen from '../screens/FollowersListScreen';

import useAuthStore from '../store/authStore';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const linking = {
  prefixes: [],
  config: {
    screens: {
      Login: 'login',
      Register: 'register',
      InterestSelection: 'interest-selection',
      Home: 'home',
      Social: 'social',
      Trips: 'trips',
      Chatbot: 'chatbot',
      Profile: 'profile',
    },
  },
};

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
      <Stack.Screen
        name="FollowersList"
        component={FollowersListScreen}
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
        name="FollowersList"
        component={FollowersListScreen}
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
      initialRouteName="Social"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#1a1a2e',
        tabBarInactiveTintColor: '#8f887d',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          marginTop: 2,
        },
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 86 : 72,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingHorizontal: 10,
          borderTopWidth: 0,
          backgroundColor: '#fffdf8',
          shadowColor: '#1a1a2e',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
          elevation: 12,
        },
        tabBarItemStyle: {
          borderRadius: 18,
        },
        tabBarIcon: ({ focused, color }) => {
          const icons = {
            Social: focused ? '●' : '○',
            Home: '⌖',
            Trips: '◇',
            Chatbot: '✦',
            Profile: '◉',
          };
          return (
            <Text
              style={{
                color,
                fontSize: focused ? 22 : 20,
                fontWeight: '900',
                lineHeight: 24,
              }}
            >
              {icons[route.name] || '•'}
            </Text>
          );
        },
      })}
    >
      <Tab.Screen 
        name="Social" 
        component={SocialStack}
        options={{
          tabBarLabel: 'Akis',
        }}
      />
      <Tab.Screen 
        name="Home" 
        component={MapStack}
        options={{
          tabBarLabel: 'Harita',
        }}
      />
      <Tab.Screen 
        name="Trips" 
        component={TripsStack}
        options={{
          tabBarLabel: 'Rotalar',
        }}
      />
      <Tab.Screen 
        name="Chatbot" 
        component={ChatbotPage}
        options={{
          tabBarLabel: 'Asistan',
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
  const needsInterests = isAuthenticated && user?.has_interests !== true;
  const flowKey = !isAuthenticated ? 'auth' : needsInterests ? 'onboarding' : 'app';

  return (
    <NavigationContainer key={flowKey} linking={linking}>
      {isAuthenticated ? (needsInterests ? <OnboardingStack /> : <MainTabs />) : <AuthStack />}
    </NavigationContainer>
  );
}
