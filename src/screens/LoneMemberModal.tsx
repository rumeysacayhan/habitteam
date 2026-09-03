import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { cancelCoopRoutineNotifications } from '../utils/coopNotifications';

export type LoneRoutine = {
  id: string;
  name: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  routine: LoneRoutine | null;
  onActionDone?: () => void;
};

export default function LoneMemberModal({ visible, onClose, routine, onActionDone }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);

  const handleDelete = () => {
    if (!routine || !user) return;
    Alert.alert(
      'Ortak Rutini Sil',
      'Bu ortak rutini ve tüm tamamlanma kayıtlarını silmek istediğine emin misin?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const completionsSnap = await getDocs(
                query(collection(db, 'coopCompletions'), where('routineId', '==', routine.id))
              );
              await Promise.all(completionsSnap.docs.map((d) => deleteDoc(d.ref)));
              await deleteDoc(doc(db, 'coopRoutines', routine.id));
              cancelCoopRoutineNotifications(routine.id).catch(() => {});
              onClose();
              onActionDone?.();
            } catch {
              Alert.alert('Hata', 'Rutin silinirken bir sorun oluştu.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleConvert = async () => {
    if (!routine) return;
    setSaving(true);
    try {
      // U7: affectedKeys = ['status'] — sadece bu alan
      await updateDoc(doc(db, 'coopRoutines', routine.id), { status: 'individual' });
      onClose();
      onActionDone?.();
    } catch {
      Alert.alert('Hata', 'Rutin dönüştürülürken bir sorun oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {routine ? (
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>&quot;{routine.name}&quot; rutininde artık yalnız kaldın.</Text>
            <Text style={styles.body}>
              Bu rutini ortak rutin olarak sonlandırabilir veya bireysel rutin olarak devam ettirebilirsin.
            </Text>

            <TouchableOpacity
              style={[styles.convertBtn, saving && styles.btnDisabled]}
              onPress={handleConvert}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.convertBtnText}>Bireysel Rutine Çevir</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteBtn, saving && styles.btnDisabled]}
              onPress={handleDelete}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={styles.deleteBtnText}>Ortak Rutini Sil</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Şimdi Değil</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#FEFCFA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E0D8DC',
    alignSelf: 'center', marginBottom: 20,
  },
  title: {
    fontSize: 20, fontWeight: '800', color: '#361C17',
    marginBottom: 10, textAlign: 'center',
  },
  body: {
    fontSize: 14, color: '#6B5B6E', lineHeight: 20,
    textAlign: 'center', marginBottom: 24,
  },
  convertBtn: {
    backgroundColor: '#561C24', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginBottom: 10,
  },
  convertBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  deleteBtn: {
    backgroundColor: '#F0EBEA', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginBottom: 10,
  },
  deleteBtnText: { fontSize: 15, fontWeight: '600', color: '#D98A8A' },
  cancelBtn: {
    paddingVertical: 12, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, color: '#8B8398' },
  btnDisabled: { opacity: 0.5 },
});
