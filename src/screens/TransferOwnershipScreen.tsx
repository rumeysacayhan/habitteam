import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arrayRemove, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { getLocalDateString } from '../utils/dateHelpers';

export type TransferRoutine = {
  id: string;
  name: string;
  participantIds: string[];
  ownerId?: string;
  creatorId?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  routine: TransferRoutine | null;
  partnerNames: Record<string, string>;
};

export default function TransferOwnershipScreen({ visible, onClose, routine, partnerNames }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- farklı rutin seçilince seçili adayı sıfırlamak için kasıtlı; modal ekranı, ekstra render kullanıcıya yansımaz
    setSelectedUid(null);
  }, [routine?.id]);

  const candidates = routine
    ? routine.participantIds.filter((uid) => uid !== user?.uid)
    : [];

  const confirmTransfer = () => {
    if (!routine || !user || !selectedUid) return;
    const newOwnerName = partnerNames[selectedUid] ?? selectedUid;
    Alert.alert(
      'Sahipliği Devret ve Ayrıl',
      `${newOwnerName}'e devredip bu rutinden ayrılmak istediğine emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Devret ve Ayrıl',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              // U6: affectedKeys = ['ownerId', 'participantIds', 'memberUntil'] — tam bu üç alan
              await updateDoc(doc(db, 'coopRoutines', routine.id), {
                ownerId: selectedUid,
                participantIds: arrayRemove(user.uid),
                [`memberUntil.${user.uid}`]: getLocalDateString(),
              });
              onClose();
            } catch {
              Alert.alert('Hata', 'Sahiplik devredilirken bir sorun oluştu.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {routine && user ? (
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Sahipliği Devret</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color="#8B8398" />
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>
              Yeni sahip seç. Devrettikten sonra bu rutinden ayrılacaksın.
            </Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
            >
              {candidates.map((uid) => {
                const name = partnerNames[uid] ?? uid;
                const selected = uid === selectedUid;
                return (
                  <TouchableOpacity
                    key={uid}
                    style={[styles.candidateRow, selected && styles.candidateRowSelected]}
                    onPress={() => setSelectedUid(uid)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.candidateName, selected && styles.candidateNameSelected]}>
                      {name}
                    </Text>
                    {selected && <Ionicons name="checkmark-circle" size={20} color="#561C24" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.confirmBtn, (!selectedUid || saving) && styles.confirmBtnDisabled]}
              onPress={confirmTransfer}
              disabled={!selectedUid || saving}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmBtnText}>Devret ve Ayrıl</Text>
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
    maxHeight: '75%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0D8DC',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#361C17' },
  subtitle: {
    fontSize: 13,
    color: '#8B8398',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  scroll: { paddingHorizontal: 16 },
  scrollContent: { paddingBottom: 16 },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F7F2F0',
  },
  candidateRowSelected: {
    backgroundColor: '#F0E8E6',
    borderWidth: 1.5,
    borderColor: '#561C24',
  },
  candidateName: { fontSize: 15, fontWeight: '600', color: '#361C17' },
  candidateNameSelected: { color: '#561C24' },
  confirmBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#561C24',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
