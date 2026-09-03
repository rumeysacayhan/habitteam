import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { getLocalDateString } from '../utils/dateHelpers';
import { sendExpoPush } from '../utils/pushNotifications';
import { getRoutineOwnerId } from '../hooks/useCoopRoutines';
import FriendPicker from '../components/FriendPicker';

export type ManagedRoutine = {
  id: string;
  name: string;
  participantIds: string[];
  pendingIds?: string[];
  ownerId?: string;
  creatorId?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  routine: ManagedRoutine | null;
  partnerNames: Record<string, string>;
};

export default function ManageMembersScreen({ visible, onClose, routine, partnerNames }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedInviteUids, setSelectedInviteUids] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const ownerId = routine ? getRoutineOwnerId(routine) : undefined;
  const isOwner = !!(user && ownerId && user.uid === ownerId);
  const excludeUids = routine
    ? [...routine.participantIds, ...(routine.pendingIds ?? [])]
    : [];
  const excludeKey = [...excludeUids].sort().join(',');

  const toggleInviteUid = (uid: string) => {
    setSelectedInviteUids((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    );
  };

  const kickMember = (uidToKick: string) => {
    if (!routine) return;
    const memberName = partnerNames[uidToKick] ?? 'Bu üye';
    Alert.alert(
      'Üyeyi Çıkar',
      `${memberName}'i rutinden çıkarmak istediğine emin misin? Geçmiş ilerlemesi silinmeyecek, sadece rutinden ayrılmış olacak.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Çıkar',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await updateDoc(doc(db, 'coopRoutines', routine.id), {
                participantIds: arrayRemove(uidToKick),
                [`memberUntil.${uidToKick}`]: getLocalDateString(),
              });
            } catch {
              Alert.alert('Hata', 'Üye çıkarılırken bir sorun oluştu.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const sendInvites = async () => {
    if (!routine || selectedInviteUids.length === 0) return;
    setSaving(true);
    try {
      // U3 kuralı: her seferinde yalnızca bir arkadaş eklenebilir
      for (const uid of selectedInviteUids) {
        await updateDoc(doc(db, 'coopRoutines', routine.id), {
          pendingIds: arrayUnion(uid),
        });
      }
      // Push bildirimi
      const tokens = (await Promise.all(
        selectedInviteUids.map(async (uid) => {
          try {
            const s = await getDoc(doc(db, 'users', uid));
            return s.data()?.pushToken as string | undefined;
          } catch { return undefined; }
        })
      )).filter(Boolean) as string[];
      if (tokens.length > 0) {
        const inviterName = user?.displayName ?? 'Biri';
        await sendExpoPush(
          tokens,
          `${inviterName} seni ortak rutine davet ediyor`,
          routine.name,
          { type: 'invite', routineId: routine.id },
        );
      }
      setSelectedInviteUids([]);
    } catch {
      Alert.alert('Hata', 'Davet gönderilirken bir sorun oluştu.');
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
      {routine && user ? (
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Üyeleri Yönet</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color="#8B8398" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Mevcut üyeler */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>MEVCUT ÜYELER</Text>
                {routine.participantIds.map((uid, index) => {
                  const isMe = uid === user.uid;
                  const isThisOwner = uid === ownerId;
                  const name = isMe
                    ? (user.displayName ?? 'Sen')
                    : (partnerNames[uid] ?? uid);
                  const labels: string[] = [];
                  if (isMe) labels.push('Sen');
                  if (isThisOwner) labels.push('Sahip');
                  const canKick = isOwner && !isThisOwner && !isMe;

                  return (
                    <View
                      key={uid}
                      style={[
                        styles.memberRow,
                        index === routine.participantIds.length - 1 && styles.memberRowLast,
                      ]}
                    >
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
                        {labels.length > 0 && (
                          <Text style={styles.memberLabel}>({labels.join(', ')})</Text>
                        )}
                      </View>
                      {canKick && (
                        <TouchableOpacity
                          style={styles.kickBtn}
                          onPress={() => kickMember(uid)}
                          disabled={saving}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.kickBtnText}>Çıkar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Arkadaş davet et — yalnızca sahip için */}
              {isOwner && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>ARKADAŞ EKLE</Text>
                  <FriendPicker
                    key={excludeKey}
                    excludeUids={excludeUids}
                    selectedUids={selectedInviteUids}
                    onToggle={toggleInviteUid}
                  />
                  {selectedInviteUids.length > 0 && (
                    <TouchableOpacity
                      style={[styles.inviteBtn, saving && styles.inviteBtnDisabled]}
                      onPress={sendInvites}
                      disabled={saving}
                      activeOpacity={0.85}
                    >
                      {saving
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={styles.inviteBtnText}>Davet Et</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
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
    maxHeight: '85%',
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
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#361C17' },
  scroll: { paddingHorizontal: 16 },
  scrollContent: { paddingBottom: 8 },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#561C24',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8B8398',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0EBEA',
  },
  memberRowLast: { borderBottomWidth: 0 },
  memberInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  memberName: { fontSize: 15, fontWeight: '600', color: '#361C17' },
  memberLabel: { fontSize: 12, color: '#8B8398' },
  kickBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F0EBEA',
    marginLeft: 8,
  },
  kickBtnText: { fontSize: 13, fontWeight: '600', color: '#D98A8A' },
  inviteBtn: {
    marginTop: 14,
    backgroundColor: '#561C24',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  inviteBtnDisabled: { opacity: 0.6 },
  inviteBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
