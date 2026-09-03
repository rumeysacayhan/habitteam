// APP_START_TIME modülünü mümkün olduğunca erken evaluate et (useFonts'tan önce)
import './src/utils/splashTiming';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from './src/context/AuthContext';
import { InvitesProvider } from './src/context/InvitesContext';
import RootNavigator from './src/navigation/RootNavigator';
import SplashScreen from './src/components/SplashScreen';
import { useFonts, Lobster_400Regular } from '@expo-google-fonts/lobster';
import * as ExpoSplashScreen from 'expo-splash-screen';

ExpoSplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [fontsLoaded] = useFonts({ Lobster_400Regular });

  if (!fontsLoaded) return <SplashScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <InvitesProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </InvitesProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
