import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { getFirebaseErrorMessage } from '../utils/firebaseErrors';
import DecorativeBackground from '../components/DecorativeBackground';
import PressableScale from '../components/PressableScale';
import AnimatedInput from '../components/AnimatedInput';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signIn, resendVerificationEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resending, setResending] = useState(false);

  const translateY = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // Alt geçiş linki ("Hesabın yok mu?") karttan ~80ms sonra girsin
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

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Tüm alanları doldurun.');
      return;
    }
    setError('');
    setEmailNotVerified(false);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/email-not-verified') {
        setEmailNotVerified(true);
      } else {
        setError(getFirebaseErrorMessage(code));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerificationEmail(email.trim(), password);
      Alert.alert('Gönderildi', 'Doğrulama maili tekrar gönderildi. Email kutunuzu kontrol edin.');
    } catch {
      Alert.alert('Hata', 'Mail gönderilemedi. Email ve şifrenizi kontrol edin.');
    } finally {
      setResending(false);
    }
  };

  const clearError = () => {
    if (error) setError('');
    if (emailNotVerified) setEmailNotVerified(false);
  };

  return (
    <DecorativeBackground>
    <View style={[styles.container, styles.transparentBg]}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />



      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={28} color="#361C17" />
      </TouchableOpacity>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity, transform: [{ translateY }] }}>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { textAlign: 'center' }]}>Hoş geldin</Text>

              <AnimatedInput
                style={styles.input}
                placeholder="E-posta"
                placeholderTextColor="#8B8398"
                value={email}
                onChangeText={(t) => { setEmail(t); clearError(); }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                returnKeyType="next"
              />

              <View style={styles.passwordWrap}>
                <AnimatedInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Şifre"
                  placeholderTextColor="#8B8398"
                  value={password}
                  onChangeText={(t) => { setPassword(t); clearError(); }}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#8B8398"
                  />
                </TouchableOpacity>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {emailNotVerified && (
                <View style={styles.verificationBox}>
                  <Text style={styles.verificationText}>
                    Email adresiniz henüz doğrulanmamış. Lütfen email kutunuzu kontrol edin.
                  </Text>
                  <TouchableOpacity onPress={handleResend} disabled={resending} activeOpacity={0.7}>
                    <Text style={styles.resendLink}>
                      {resending ? 'Gönderiliyor…' : 'Tekrar gönder'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <PressableScale
                style={[styles.loginBtn, submitting && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.loginBtnText}>Giriş Yap</Text>}
              </PressableScale>

              <TouchableOpacity
                style={styles.forgotWrap}
                onPress={() => navigation.navigate('ForgotPassword')}
                activeOpacity={0.7}
              >
                <Text style={styles.forgotText}>Şifremi unuttum</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: opacity2, transform: [{ translateY: translateY2 }] }}>
            <TouchableOpacity
              style={styles.switchWrap}
              onPress={() => navigation.navigate('Register')}
              activeOpacity={0.7}
            >
              <Text style={styles.switchText}>
                Hesabın yok mu?{'  '}
                <Text style={styles.switchLink}>Kayıt Ol</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
    </DecorativeBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FEFCFA' },
  // DecorativeBackground içindeyken dekoratif katman görünsün diye container
  // opak zemini örtmemeli (stil tanımı korunuyor, sadece bu ekranlarda geçersiz).
  transparentBg: { backgroundColor: 'transparent' },
  flex: { flex: 1 },


  backBtn: { position: 'absolute', left: 16, zIndex: 10, padding: 4 },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    gap: 14,
    shadowColor: '#561C24',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: { fontSize: 26, fontWeight: '800', color: '#361C17' },

  input: {
    borderWidth: 1.5,
    borderColor: '#A9C1D1',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: '#361C17',
    backgroundColor: '#FFFFFF',
  },
  passwordWrap: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1 },
  eyeBtn: { position: 'absolute', right: 14, padding: 4 },

  error: { fontSize: 13, color: '#D98A8A', marginTop: -6 },

  verificationBox: {
    backgroundColor: 'rgba(201,166,181,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(201,166,181,0.35)',
    padding: 12,
    gap: 6,
  },
  verificationText: { fontSize: 13, color: '#361C17', lineHeight: 19 },
  resendLink: { fontSize: 13, fontWeight: '700', color: '#561C24' },

  loginBtn: {
    backgroundColor: '#561C24',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.7 },
  loginBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  forgotWrap: { alignItems: 'center', marginTop: -6 },
  forgotText: { fontSize: 14, color: '#8B8398' },

  switchWrap: { alignItems: 'center' },
  switchText: { fontSize: 14, color: '#8B8398' },
  switchLink: { color: '#561C24', fontWeight: '700' },
});
