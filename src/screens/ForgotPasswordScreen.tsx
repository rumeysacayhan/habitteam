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

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
};

export default function ForgotPasswordScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const translateY = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 6 }),
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Email adresi girin.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/invalid-email') {
        // Format hatası — açıklamak güvenli, kayıtlılık bilgisi vermiyor
        setError(getFirebaseErrorMessage(code));
      } else {
        // auth/user-not-found dahil tüm diğer hatalar: tarafsız mesaj göster
        // (email enumeration koruması — sistemde hangi emailin kayıtlı olduğu belli olmasın)
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
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
              <Text style={styles.cardTitle}>Şifremi Unuttum</Text>
              <Text style={styles.description}>
                Email adresinizi girin, şifre sıfırlama bağlantısı gönderelim.
              </Text>

              {sent ? (
                <View style={styles.sentBox}>
                  <Ionicons name="checkmark-circle-outline" size={22} color="#561C24" />
                  <Text style={styles.sentText}>
                    Eğer bu email kayıtlıysa, sıfırlama bağlantısı gönderildi. Spam klasörünüzü de kontrol edin.
                  </Text>
                </View>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="E-posta"
                    placeholderTextColor="#8B8398"
                    value={email}
                    onChangeText={(t) => { setEmail(t); setError(''); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    returnKeyType="send"
                    onSubmitEditing={handleSubmit}
                  />

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <TouchableOpacity
                    style={[styles.submitBtn, loading && styles.btnDisabled]}
                    onPress={handleSubmit}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.submitBtnText}>Sıfırlama Bağlantısı Gönder</Text>}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FEFCFA' },
  flex: { flex: 1 },

  backBtn: { position: 'absolute', left: 16, zIndex: 10, padding: 4 },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
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
  description: { fontSize: 14, color: '#8B8398', lineHeight: 20 },

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

  error: { fontSize: 13, color: '#D98A8A', marginTop: -6 },

  sentBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(181,121,154,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(181,121,154,0.25)',
    padding: 12,
  },
  sentText: { flex: 1, fontSize: 14, color: '#361C17', lineHeight: 20 },

  submitBtn: {
    backgroundColor: '#561C24',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.7 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
