import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
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
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const passwordConfirmRef = useRef<TextInput>(null);

  const translateY = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // Alt geçiş linki ("Zaten hesabın var mı?") karttan ~80ms sonra girsin
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

  const handleRegister = async () => {
    if (!displayName.trim()) {
      setError('Ad Soyad gerekli.');
      return;
    }
    if (!email.trim() || !password.trim() || !passwordConfirm.trim()) {
      setError('Tüm alanları doldurun.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Şifreler eşleşmiyor.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await signUp(email.trim(), password, displayName.trim());
      // signUp artık kullanıcıyı anında giriş yaptırıyor; RootNavigator otomatik yönlendirir.
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(getFirebaseErrorMessage(code));
    } finally {
      setSubmitting(false);
    }
  };

  const clearError = () => { if (error) setError(''); };

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
              <Text style={styles.cardTitle}>Kayıt Ol</Text>

              <AnimatedInput
                style={styles.input}
                placeholder="Ad Soyad"
                placeholderTextColor="#8B8398"
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); clearError(); }}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />

              <AnimatedInput
                ref={emailRef}
                style={styles.input}
                placeholder="E-posta"
                placeholderTextColor="#8B8398"
                value={email}
                onChangeText={(t) => { setEmail(t); clearError(); }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />

              <View style={styles.passwordWrap}>
                <AnimatedInput
                  ref={passwordRef}
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Şifre"
                  placeholderTextColor="#8B8398"
                  value={password}
                  onChangeText={(t) => { setPassword(t); clearError(); }}
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordConfirmRef.current?.focus()}
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

              <View style={styles.passwordWrap}>
                <AnimatedInput
                  ref={passwordConfirmRef}
                  style={[styles.input, styles.passwordInput]}
                  hasError={passwordConfirm.length > 0 && password !== passwordConfirm}
                  placeholder="Şifre (tekrar)"
                  placeholderTextColor="#8B8398"
                  value={passwordConfirm}
                  onChangeText={(t) => { setPasswordConfirm(t); clearError(); }}
                  secureTextEntry={!showConfirm}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirm((v) => !v)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#8B8398"
                  />
                </TouchableOpacity>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PressableScale
                style={[styles.registerBtn, submitting && styles.btnDisabled]}
                onPress={handleRegister}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.registerBtnText}>Kayıt Ol</Text>}
              </PressableScale>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: opacity2, transform: [{ translateY: translateY2 }] }}>
            <TouchableOpacity
              style={styles.switchWrap}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
            >
              <Text style={styles.switchText}>
                Zaten hesabın var mı?{'  '}
                <Text style={styles.switchLink}>Giriş Yap</Text>
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

  registerBtn: {
    backgroundColor: '#561C24',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.7 },
  registerBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  switchWrap: { alignItems: 'center' },
  switchText: { fontSize: 14, color: '#8B8398' },
  switchLink: { color: '#561C24', fontWeight: '700' },
});
