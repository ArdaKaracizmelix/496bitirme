# Authentication & Onboarding Module - Implementation Guide

## Overview
This module implements the complete Authentication & Onboarding flow for the Excursa frontend, as specified in the design document. It provides:

1. **Login Screen** - User authentication with email and password
2. **Register Screen** - New user account creation with validation
3. **Interest Selection Screen** - Onboarding to select user interests
4. **AuthManager Service** - Centralized authentication logic and token management
5. **Enhanced Auth Store** - Zustand-based state management with persistence

## Architecture

### Components

#### LoginPage (`src/pages/auth/LoginPage.js`)
- **State:**
  - `email` - Email input field
  - `password` - Password input field
  - `isPasswordVisible` - Toggle password visibility
  - `isLoading` - Loading indicator state
  - `errorMessage` - Error display

- **Methods:**
  - `validateEmail()` - Email format validation using regex
  - `toggleVisibility()` - Show/hide password
  - `handleLogin()` - Authenticate user via AuthManager

#### RegisterPage (`src/pages/auth/RegisterPage.js`)
- **State:**
  - `fullName` - User's full name
  - `email` - Email address
  - `password` - Password
  - `confirmPassword` - Password confirmation
  - `isLoading` - Loading state
  - `validationErrors` - Object mapping field names to error messages

- **Methods:**
  - `validateEmail()` - Email regex validation
  - `validateForm()` - Comprehensive form validation
  - `handleFieldChange()` - Update field and clear related errors
  - `handleRegister()` - Register new user via AuthManager

- **Validators:**
  - Full Name: Required, minimum 2 characters
  - Email: Valid email format via regex
  - Password: Minimum 8 characters
  - Password Confirmation: Must match password field

#### InterestSelectionPage (`src/pages/auth/InterestSelectionPage.js`)
- **State:**
  - `availableTags` - List of available interest categories
  - `selectedTagIds` - Set of selected interest IDs
  - `isLoading` - Data loading state
  - `isSubmitting` - Form submission state
  - `error` - Error messages

- **Methods:**
  - `fetchInterests()` - Load available interests from backend
  - `toggleInterest(id)` - Toggle an interest selection
  - `submitPreferences()` - Save selected interests
  - `skipSelection()` - Skip interest selection and continue

- **Features:**
  - Displays interests as selectable tags/buttons
  - Shows selection count
  - Prevents submission without selecting interests
  - Allows skipping the step

### Services

#### AuthManager (`src/services/AuthManager.js`)
A singleton service that manages all authentication operations:

**Storage Constants:**
- `STORAGE_KEY_TOKEN` - AsyncStorage key for access token
- `STORAGE_KEY_REFRESH` - AsyncStorage key for refresh token
- `STORAGE_KEY_USER` - AsyncStorage key for user profile

**Instance Variables:**
- `userProfile` - Cached user profile data
- `accessToken` - Current access token
- `refreshToken` - Current refresh token

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `login(credentials)` | `{email, password}` | `Promise<{user, access, refresh}>` | Authenticate existing user |
| `register(data)` | `{fullName, email, password}` | `Promise<{user, access, refresh}>` | Create new account |
| `submitInterestPreferences(tagIds)` | `Array<Number>` | `Promise<Object>` | Save user interests |
| `fetchAvailableInterests()` | - | `Promise<Array>` | Get available interest categories |
| `logout()` | - | `Promise<void>` | Clear session and logout |
| `saveSession(data)` | `{user, access, refresh}` | `Promise<void>` | Persist tokens and user data |
| `clearSession()` | - | `Promise<void>` | Remove all stored session data |
| `getToken()` | - | `Promise<String\|null>` | Retrieve valid access token |
| `refreshToken()` | - | `Promise<Boolean>` | Refresh expired token |
| `isAuthenticated()` | - | `Promise<Boolean>` | Check if user is logged in |
| `restoreSession()` | - | `Promise<{user, isAuthenticated}>` | Restore session from storage |

### State Management

#### useAuthStore (`src/store/authStore.js`)
Zustand-based store for authentication state:

**State:**
- `user` - Current user profile
- `token` - Current access token
- `isAuthenticated` - Authentication status
- `isInitializing` - App initialization flag

**Actions:**
- `setAuth(user, token)` - Set authentication state
- `logout()` - Clear authentication
- `initializeAuth()` - Restore session on app launch
- `updateUser(userData)` - Update user profile
- `refreshUserToken()` - Refresh access token

### Navigation Flow

```
App Launch
    ↓
initializeAuth()
    ↓
┌─────────────────────────────────────┐
│ isAuthenticated = false?             │
└─────────────────────────────────────┘
    ↓ YES              ↓ NO
  AuthStack         MainTabs
    ↓                  ↓
  Login            Map/Social/etc
    ↓
  Register
    ↓
  InterestSelection
    ↓
  setAuth() → isAuthenticated = true → MainTabs
```

## API Integration

### Backend Endpoints Required

#### Authentication
- `POST /api/user/login/` - User login
  - Request: `{email, password}`
  - Response: `{user, access, refresh}`

- `POST /api/user/register/` - User registration
  - Request: `{full_name, email, password}`
  - Response: `{user, access, refresh}`

- `POST /api/user/logout/` - User logout
  - Request: `{}`
  - Response: `{}`

- `POST /api/user/token/refresh/` - Refresh access token
  - Request: `{refresh}`
  - Response: `{access}`

#### Interests
- `GET /api/user/interests/available/` - Get available interest categories
  - Response: `{interests: [{id, name, title}]}`

- `POST /api/user/interests/` - Submit user interest preferences
  - Request: `{interest_ids: [Integer]}`
  - Response: `{interests: [...]}`

### API Service

The `api.js` file provides:

1. **Request Interceptor:**
   - Automatically adds Bearer token to all requests
   - Uses `global.accessToken` for token management

2. **Response Interceptor:**
   - Handles 401 Unauthorized responses
   - Automatically attempts token refresh
   - Retries original request with new token
   - Clears session if refresh fails

## Error Handling

### Validation Errors
- **Email:** Regex pattern validation
- **Password:** Length requirements (8+ chars)
- **Passwords:** Must match
- **Full Name:** Required, minimum length (2)

### API Errors
- Extracted from response data: `detail`, `message`, or field-specific errors
- Displayed to users in error containers
- Prevents further submission while errors persist

### Token Errors
- 401 Unauthorized triggers automatic refresh
- If refresh fails, user is logged out
- App returns to login screen

## Setup & Installation

### 1. Install Dependencies
```bash
cd frontend/excursa
npm install
# or
yarn install
```

This installs the new AsyncStorage dependency and all others.

### 2. Configure Backend API URL
Update `src/services/api.js` if your backend is not on `localhost:8000`:
```javascript
const API_URL = 'http://your-backend-url:port/api';
```

### 3. Environment Variables (Optional)
Create a `.env` file in the frontend directory:
```
EXPO_PUBLIC_API_URL=http://your-backend-url:port/api
```

### 4. Start the App
```bash
npm start
# or
yarn start
```

Then select `a` for Android or `i` for iOS.

## Testing the Flow

### 1. **Registration Flow**
1. Start app → Login screen
2. Tap "Kayıt ol" (Register)
3. Fill in all fields:
   - Ad Soyad (Full Name)
   - Email
   - Password (8+ chars)
   - Confirm Password
4. Tap "Kayıt Ol" (Register button)
5. On success → Interest Selection screen
6. Select at least one interest and tap "Devam Et" (Continue)
7. On success → Main app screens

### 2. **Login Flow**
1. Start app → Login screen
2. Enter registered email and password
3. Tap "Giriş Yap" (Login)
4. On success → Main app screens

### 3. **Error Cases**
- **Invalid email format** → Error message in red
- **Password mismatch** → Error on register
- **Short password** → 8 character minimum enforced
- **API failure** → User-friendly error messages
- **Expired token** → Auto-refresh attempt, fallback to login

## Key Features

✅ **Form Validation**
- Real-time validation feedback
- Error messages per field
- Clear error display

✅ **Security**
- Password visibility toggle
- HTTPS-ready API calls
- Token refresh handling
- Automatic session persistence

✅ **User Experience**
- Beautiful UI with consistent styling
- Loading indicators
- Error recovery
- Keyboard handling
- Responsive design

✅ **State Management**
- Persistent session storage
- Auto-restore on app launch
- Centralized auth logic
- Zustand for performance

✅ **Backend Integration**
- Comprehensive error handling
- Token refresh logic
- AsyncStorage persistence
- Global token management

## Potential Enhancements

1. **Biometric Authentication** - Add fingerprint/face login
2. **Password Reset** - Forgot password flow
3. **Social Login** - Google/Facebook authentication
4. **Two-Factor Authentication** - OTP verification
5. **Email Verification** - Confirmation email step
6. **Analytics** - Track auth events
7. **Offline Support** - Cached login attempts
8. **Rate Limiting** - Prevent brute force attacks

## Troubleshooting

### AsyncStorage Not Found
```bash
npm install @react-native-async-storage/async-storage
npm install
```

### API Connection Failed
- Check backend is running on `localhost:8000`
- For physical devices, use your machine's IP instead of `localhost`
- Update `API_URL` in `src/services/api.js`

### Token Refresh Loop
- Ensure backend `/api/user/token/refresh/` endpoint works
- Check refresh token is properly stored
- Verify token structure in backend

### Navigation Not Changing
- Check `setAuth()` is called with proper user object
- Verify `isAuthenticated` state change in authStore
- Clear app cache/data if stuck

## Files Structure

```
src/
├── pages/auth/
│   ├── LoginPage.js
│   ├── RegisterPage.js
│   └── InterestSelectionPage.js
├── services/
│   ├── AuthManager.js
│   └── api.js
├── store/
│   └── authStore.js
└── navigation/
    └── AppNavigator.js
```

## Notes

- All code is in **Turkish** (UI strings) for the Turkish-speaking users
- Uses **React Native** with Expo for cross-platform support
- Compatible with existing project structure and dependencies
- Follows the design specification exactly
- Production-ready with proper error handling
