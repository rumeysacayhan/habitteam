import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  User,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { runOneTimeOrphanNotificationCleanup } from '../utils/coopNotifications';
import { ONBOARDING_STORAGE_KEY } from '../utils/storageKeys';

const EXPO_PROJECT_ID = 'c76baf44-ee3b-4513-898d-2bfe055c4a11';

type AuthContextType = {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerificationEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshUser: () => void;
};

async function registerForPushNotifications(uid: string): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Varsayılan',
        importance: Notifications.AndroidImportance.MAX,
      });
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    const pushToken = tokenData.data;
    if (pushToken) {
      await setDoc(doc(db, 'users', uid), { pushToken }, { merge: true });
    }
  } catch (e) {
    console.warn('[Notifications] token alınamadı:', e);
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // signIn/signUp sırasında onAuthStateChanged'in navigation tetiklemesini önler.
  // Race condition: Firebase, başarısız kayıt denemesinde bile mevcut kullanıcıyı
  // onAuthStateChanged ile bildirebilir. Bu flag onu engeller.
  const operationInProgress = useRef(false);

  useEffect(() => {
    // Geçmişten kalmış yetim yerel bildirimleri (silinmiş coop rutinleri vb.)
    // bir kereye mahsus temizle; HomeScreen useEffect'i aktif rutinler için
    // doğru bildirimleri yeniden kurar.
    runOneTimeOrphanNotificationCleanup().catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (operationInProgress.current) return;
      setUser(firebaseUser);
      setIsLoading(false);
      if (firebaseUser) {
        registerForPushNotifications(firebaseUser.uid).catch(() => {});
      }
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    operationInProgress.current = true;
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      setUser(result.user);
      registerForPushNotifications(result.user.uid).catch(() => {});
    } catch (err) {
      throw err;
    } finally {
      setTimeout(() => { operationInProgress.current = false; }, 0);
    }
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    operationInProgress.current = true;
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName });
      // Kullanıcı profili oluştur (henüz oturum açıkken yazmalıyız)
      await setDoc(doc(db, 'users', result.user.uid), {
        displayName,
        email,
        createdAt: serverTimestamp(),
        friendIds: [],
        pushToken: null,
      });
      // Doğrulama maili gönder (arka planda — başarısız olsa kayıt engellenmesin)
      sendEmailVerification(result.user).catch(() => {});
      // Kullanıcıyı hemen giriş yaptır
      setUser(result.user);
      registerForPushNotifications(result.user.uid).catch(() => {});
    } catch (err) {
      throw err;
    } finally {
      setTimeout(() => { operationInProgress.current = false; }, 0);
    }
  };

  const resendVerificationEmail = async (email: string, password: string) => {
    operationInProgress.current = true;
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(result.user);
      await firebaseSignOut(auth);
    } finally {
      setTimeout(() => { operationInProgress.current = false; }, 0);
    }
  };

  const signOut = async () => {
    // signOut'ta flag yok: null ile gelen onAuthStateChanged normal çalışsın
    // TEST: onboarding ekranlarını tekrar test etmek için çıkışta sıfırlanıyor.
    // Kalıcı davranışta bu satır KALDIRILACAK (bkz. PROJECT_STATE.md).
    await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
    await firebaseSignOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  // updateProfile() auth.currentUser'ı yerinde günceller ama React state referansı
  // aynı kalır — re-render tetiklenmez. Yeni nesne kopyası oluşturup state'i zorluyoruz.
  const refreshUser = () => {
    if (auth.currentUser) setUser({ ...auth.currentUser } as User);
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, isLoading, signIn, signUp, signOut, resendVerificationEmail, resetPassword, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
