import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { useAuth } from '../context/AuthContext';
import { AuthStackParamList } from './types';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import SplashScreen from '../components/SplashScreen';
import { APP_START_TIME, MIN_SPLASH_DURATION_MS } from '../utils/splashTiming';
import { ONBOARDING_STORAGE_KEY } from '../utils/storageKeys';

export default function RootNavigator() {
  const { isLoading, isLoggedIn } = useAuth();
  const [authInitialRoute, setAuthInitialRoute] = useState<keyof AuthStackParamList | null>(null);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);

  // onboardingCompleted bayrağını, kullanıcı giriş yapmamışken (ilk açılış VEYA
  // uygulama açıkken yapılan çıkış) yeniden oku. isLoggedIn true→false olunca
  // effect tekrar çalışır; böylece logout sonrası doğru ekran (bayrak yoksa
  // Onboarding, varsa Welcome) tam restart gerektirmeden gösterilir.
  useEffect(() => {
    if (isLoggedIn) return;
    let cancelled = false;
    // Doğru route kararı gelene kadar AuthNavigator'ı render etme (eski değerle
    // yanlış ekranın bir an görünmesini engeller). Logout başına tek ekstra render;
    // mount'ta zaten null olduğu için no-op.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async okuma öncesi kasıtlı senkron sıfırlama; logout'ta doğru ekran garantisi için
    setAuthInitialRoute(null);
    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
      .then((v) => { if (!cancelled) setAuthInitialRoute(v === 'true' ? 'Welcome' : 'Onboarding'); })
      .catch(() => { if (!cancelled) setAuthInitialRoute('Onboarding'); });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  // Splash için kalıcı minimum görünürlük süresi — çok hızlı cihazlarda
  // yanıp sönmeyi önler.
  useEffect(() => {
    const remaining = MIN_SPLASH_DURATION_MS - (Date.now() - APP_START_TIME);
    if (remaining <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- min süre mount anında zaten dolmuşsa hemen geç; tek ekstra render
      setMinSplashElapsed(true);
    } else {
      const timer = setTimeout(() => setMinSplashElapsed(true), remaining);
      return () => clearTimeout(timer);
    }
  }, []);

  const ready = !isLoading && minSplashElapsed && (isLoggedIn || authInitialRoute !== null);

  useEffect(() => {
    if (ready) {
      ExpoSplashScreen.hideAsync();
    }
  }, [ready]);

  if (isLoading || !minSplashElapsed) return <SplashScreen />;
  if (isLoggedIn) return <AppNavigator />;
  if (authInitialRoute === null) return null;

  return <AuthNavigator key={authInitialRoute} initialRouteName={authInitialRoute} />;
}
