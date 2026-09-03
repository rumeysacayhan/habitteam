import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStackParamList } from '../navigation/types';
import DecorativeBackground from '../components/DecorativeBackground';
import PressableScale from '../components/PressableScale';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;
};

export default function WelcomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // Buton bloğu başlıktan ~80ms sonra girsin (art arda sahneye girme hissi)
  const translateY2 = useRef(new Animated.Value(60)).current;
  const opacity2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 6 }),
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(translateY2, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 6, delay: 80 }),
      Animated.timing(opacity2, { toValue: 1, duration: 500, useNativeDriver: true, delay: 80 }),
    ]).start();
  }, [opacity, translateY, opacity2, translateY2]);

  return (
    <DecorativeBackground>
    <View style={[styles.container, styles.transparentBg]}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />



      <Animated.View
        style={[styles.titleBlock, { paddingTop: insets.top + 80 }, { opacity, transform: [{ translateY }] }]}
      >
        <Text style={styles.appName}>Küçük Adımlar, Büyük Değişim</Text>
      </Animated.View>

      <Animated.View
        style={[styles.bottom, { paddingBottom: insets.bottom + 36 }, { opacity: opacity2, transform: [{ translateY: translateY2 }] }]}
      >
        <PressableScale
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
          style={styles.loginBtn}
        >
          <Text style={styles.loginBtnText}>Giriş Yap</Text>
        </PressableScale>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>veya</Text>
          <View style={styles.dividerLine} />
        </View>

        <PressableScale
          onPress={() => navigation.navigate('Register')}
          activeOpacity={0.85}
          style={styles.registerBtn}
        >
          <Text style={styles.registerBtnText}>Kayıt Ol</Text>
        </PressableScale>
      </Animated.View>
    </View>
    </DecorativeBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FEFCFA' },
  // DecorativeBackground içindeyken dekoratif katman görünsün diye container
  // opak zemini örtmemeli (stil tanımı korunuyor, sadece bu ekranlarda geçersiz).
  transparentBg: { backgroundColor: 'transparent' },


  titleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#361C17',
    letterSpacing: -1,
    textAlign: 'center',
  },

  bottom: {
    paddingHorizontal: 28,
    gap: 14,
  },
  loginBtn: {
    backgroundColor: '#561C24',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  loginBtnText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(139,131,152,0.25)' },
  dividerText: { fontSize: 13, color: '#8B8398', fontWeight: '500' },
  registerBtn: {
    borderWidth: 1.5,
    borderColor: '#561C24',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  registerBtnText: { fontSize: 17, fontWeight: '700', color: '#561C24' },
});
