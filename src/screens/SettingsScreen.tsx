import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../config/firebase';
import { getFirebaseErrorMessage } from '../utils/firebaseErrors';


function SettingsRow({
  label,
  onPress,
  danger = false,
  rightElement,
}: {
  label: string;
  onPress?: () => void;
  danger?: boolean;
  rightElement?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {rightElement ?? (
        <Ionicons name="chevron-forward" size={18} color="#561C24" />
      )}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function ChangePasswordModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    setError('');

    if (!currentPassword) { setError('Mevcut şifreni gir.'); return; }
    if (newPassword.length < 6) { setError('Yeni şifre en az 6 karakter olmalı.'); return; }
    if (newPassword !== confirmPassword) { setError('Yeni şifreler eşleşmiyor.'); return; }

    const user = auth.currentUser;
    if (!user || !user.email) { setError('Kullanıcı bulunamadı.'); return; }

    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      reset();
      onClose();
      Alert.alert('Başarılı', 'Şifren güncellendi.');
    } catch (e: any) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setError('Mevcut şifre hatalı.');
      } else if (e.code === 'auth/too-many-requests') {
        setError('Çok fazla deneme. Lütfen bekle.');
      } else {
        setError('Şifre güncellenemedi. Tekrar dene.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalKAV}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Şifre Değiştir</Text>

          <TextInput
            style={styles.input}
            placeholder="Mevcut Şifre"
            placeholderTextColor="#8B8398"
            secureTextEntry
            value={currentPassword}
            onChangeText={(t) => { setCurrentPassword(t); setError(''); }}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Yeni Şifre"
            placeholderTextColor="#8B8398"
            secureTextEntry
            value={newPassword}
            onChangeText={(t) => { setNewPassword(t); setError(''); }}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Yeni Şifre Tekrar"
            placeholderTextColor="#8B8398"
            secureTextEntry
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setError(''); }}
            autoCapitalize="none"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
            <Text style={styles.cancelBtnText}>İptal</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DeleteAccountModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPassword('');
    setError('');
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDelete = async () => {
    if (!password) { setError('Şifreni gir.'); return; }

    const user = auth.currentUser;
    if (!user || !user.email) { setError('Kullanıcı bulunamadı.'); return; }

    setSaving(true);
    setError('');

    // 1. Reauthenticate
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
    } catch (e: any) {
      setError(getFirebaseErrorMessage(e?.code ?? ''));
      setSaving(false);
      return;
    }

    // 2. Firestore verileri sil — hata olursa Auth'a geçme
    try {
      const uid = user.uid;

      await deleteDoc(doc(db, 'users', uid));

      const friendshipsSnap = await getDocs(
        query(collection(db, 'friendships'), where('uids', 'array-contains', uid))
      );
      if (!friendshipsSnap.empty) {
        const batch = writeBatch(db);
        friendshipsSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      const invitesSnap = await getDocs(
        query(collection(db, 'friendInvites'), where('ownerId', '==', uid))
      );
      if (!invitesSnap.empty) {
        const batch = writeBatch(db);
        invitesSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      const routinesSnap = await getDocs(
        query(collection(db, 'coopRoutines'), where('participantIds', 'array-contains', uid))
      );
      if (!routinesSnap.empty) {
        const batch = writeBatch(db);
        routinesSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      const completionsSnap = await getDocs(
        query(collection(db, 'coopCompletions'), where('participantIds', 'array-contains', uid))
      );
      if (!completionsSnap.empty) {
        const batch = writeBatch(db);
        completionsSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e: any) {
      console.error('[DeleteAccount] Firestore silme hatası:', e?.code, e?.message);
      setError('Veriler silinemedi. Tekrar dene.');
      setSaving(false);
      return;
    }

    // 3. Authentication hesabını sil — RootNavigator auth state'i dinlediği için otomatik yönlenir
    try {
      await user.delete();
    } catch {
      setError('Hesap silinemedi. Tekrar dene.');
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalKAV}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Hesabı Sil</Text>
          <Text style={styles.deleteWarning}>
            Hesabını kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Şifreni gir"
            placeholderTextColor="#8B8398"
            secureTextEntry
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            autoCapitalize="none"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.deleteBtn, saving && styles.saveBtnDisabled]}
            onPress={handleDelete}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.deleteBtnText}>
              {saving ? 'Siliniyor…' : 'Hesabı Kalıcı Olarak Sil'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
            <Text style={styles.cancelBtnText}>İptal</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function SettingsScreen() {
  const { user, signOut, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [notificationsOn, setNotificationsOn] = useState(false);
  const appState = useRef(AppState.currentState);

  const syncNotificationPermission = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationsOn(status === 'granted');
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncNotificationPermission async; setState await sonrası çalışır, senkron değil
    syncNotificationPermission();
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        syncNotificationPermission();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  const handleNotificationToggle = async () => {
    if (!notificationsOn) {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationsOn(status === 'granted');
    } else {
      Alert.alert(
        'Bildirimleri Kapat',
        'Bildirimleri kapatmak için Ayarlar\'a yönlendiriliyorsun.',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Ayarlar\'a Git', onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const initial = (() => {
    const name = user?.displayName?.trim();
    if (name) {
      const parts = name.split(' ').filter(Boolean);
      const letters = parts.length >= 2
        ? parts[0][0] + parts[1][0]
        : parts[0][0];
      return letters.toLocaleUpperCase('tr-TR');
    }
    return user?.email?.[0]?.toLocaleUpperCase('tr-TR') ?? '?';
  })();
  const email = user?.displayName?.trim() || user?.email || '';

  const handleChangeUsername = () => {
    Alert.prompt(
      'Kullanıcı Adı Değiştir',
      'Yeni kullanıcı adını gir',
      async (newName) => {
        const trimmed = newName?.trim();
        if (!trimmed) return;
        try {
          if (auth.currentUser) {
            await updateProfile(auth.currentUser, { displayName: trimmed });
            // setDoc + merge: doküman yoksa oluşturur, varsa sadece displayName günceller
            await setDoc(
              doc(db, 'users', auth.currentUser.uid),
              {
                displayName: trimmed,
                email: auth.currentUser.email ?? '',
              },
              { merge: true }
            );
          }
          refreshUser();
          Alert.alert('Başarılı', 'Kullanıcı adın güncellendi.');
        } catch (e: any) {
          console.error('[handleChangeUsername] hata:', e?.code, e?.message, e);
          Alert.alert('Hata', 'Kullanıcı adı güncellenemedi.');
        }
      },
      'plain-text',
      auth.currentUser?.displayName ?? ''
    );
  };

  const handleSignOut = () => {
    Alert.alert('Çıkış Yap', 'Hesabından çıkmak istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch {
            Alert.alert('Hata', 'Çıkış yapılırken bir sorun oluştu.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#561C24', '#561C24']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarCircle}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </LinearGradient>
        <Text style={styles.email}>{email}</Text>

        <SectionHeader title="HESAP" />
        <View style={styles.section}>
          <SettingsRow label="Kullanıcı Adı Değiştir" onPress={handleChangeUsername} />
          <View style={styles.divider} />
          <SettingsRow label="Şifre Değiştir" onPress={() => setPasswordModalVisible(true)} />
        </View>

        <SectionHeader title="BİLDİRİMLER" />
        <View style={styles.section}>
          <SettingsRow
            label="Bildirimlere İzin Ver"
            rightElement={
              <TouchableOpacity
                onPress={handleNotificationToggle}
                activeOpacity={0.8}
                style={[styles.toggleTrack, notificationsOn && styles.toggleTrackOn]}
              >
                <View style={[styles.toggleThumb, notificationsOn && styles.toggleThumbOn]} />
              </TouchableOpacity>
            }
          />
        </View>

        <SectionHeader title="HESAP YÖNETİMİ" />
        <View style={styles.section}>
          <SettingsRow label="Çıkış Yap" onPress={handleSignOut} danger />
          <View style={styles.divider} />
          <SettingsRow label="Hesabı Sil" onPress={() => setDeleteModalVisible(true)} danger />
        </View>
      </ScrollView>

      <ChangePasswordModal
        visible={passwordModalVisible}
        onClose={() => setPasswordModalVisible(false)}
      />
      <DeleteAccountModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FEFCFA' },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20 },

  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 34, fontWeight: '700', color: '#FFFFFF' },
  email: {
    fontSize: 20,
    fontWeight: '600',
    color: '#361C17',
    textAlign: 'center',
    marginBottom: 32,
  },

  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8B8398',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 4,
  },

  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#561C24',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowLabel: { fontSize: 15, color: '#361C17' },
  rowLabelDanger: { color: '#D98A8A' },

  divider: { height: 1, backgroundColor: '#E6DDDE', marginHorizontal: 16 },

  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E6DDDE',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleTrackOn: { backgroundColor: '#561C24' },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },

  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(54,28,23,0.4)',
  },
  modalKAV: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E6DDDE',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#361C17',
    marginBottom: 20,
  },

  input: {
    borderWidth: 1.5,
    borderColor: '#561C24',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#361C17',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },

  errorText: {
    fontSize: 13,
    color: '#D98A8A',
    marginBottom: 12,
  },

  saveBtn: {
    backgroundColor: '#561C24',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  deleteWarning: {
    fontSize: 13,
    color: '#8B8398',
    lineHeight: 20,
    marginBottom: 16,
  },
  deleteBtn: {
    backgroundColor: '#561C24',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, color: '#8B8398', fontWeight: '600' },
});
