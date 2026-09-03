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
import { PendingInvite, useInvites } from '../context/InvitesContext';
import { useAuth } from '../context/AuthContext';

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function formatRepeat(repeatType?: string, repeatDays?: number[], onceDate?: string | null): string {
  if (repeatType === 'once') return onceDate ? `Bir kez • ${onceDate}` : 'Bir kez';
  if (!repeatDays || repeatDays.length === 0) return 'Her gün';
  if (repeatDays.length === 7) return 'Her gün';
  return repeatDays.map((d) => DAY_LABELS[d]).join(', ');
}

function InviteCard({ invite }: { invite: PendingInvite }) {
  const { acceptInvite, declineInvite } = useInvites();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Creator zaten "X seni davet ediyor" satırında gösteriliyor.
  // Diğerleri: kabul etmiş olanlar (participantIds'te, creator hariç) + henüz cevap vermemişler (pendingIds'te, kendisi hariç).
  const otherNames = [
    ...invite.participantIds.filter((u) => u !== invite.creatorId && u !== user?.uid),
    ...invite.pendingIds.filter((u) => u !== user?.uid),
  ].map((uid) => invite.participantNames[uid] ?? '…');

  const handleAccept = async () => {
    setLoading(true);
    try {
      await acceptInvite(invite.id);
    } catch (error: any) {
      console.error('[InvitesModal] acceptInvite hata:', error.code, error.message);
      Alert.alert('Hata', 'Davet kabul edilirken bir sorun oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    Alert.alert('Reddet', 'Bu daveti reddetmek istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Reddet', style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await declineInvite(invite.id);
          } catch {
            Alert.alert('Hata', 'Davet reddedilirken bir sorun oluştu.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const repeatLabel = formatRepeat(invite.repeatType, invite.repeatDays, invite.onceDate);
  const timeLabel = invite.reminderTime ? ` • ${invite.reminderTime}` : '';

  return (
    <View style={styles.card}>
      <Text style={styles.inviterText}>
        <Text style={styles.inviterName}>{invite.creatorName}</Text>
        {' '}seni ortak rutine davet ediyor
      </Text>
      {otherNames.length > 0 && (
        <Text style={styles.coParticipantsText}>
          {'Katılımcılar: '}
          <Text style={styles.coParticipantsNames}>
            {[invite.creatorName, ...otherNames].join(', ')}
          </Text>
        </Text>
      )}
      <View style={styles.routineRow}>
        <Text style={styles.routineIcon}>{invite.icon}</Text>
        <View style={styles.routineInfo}>
          <Text style={styles.routineName} numberOfLines={1}>{invite.name}</Text>
          <Text style={styles.routineMeta}>{repeatLabel}{timeLabel}</Text>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color="#561C24" style={{ marginTop: 12 }} />
      ) : (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={handleDecline}
            activeOpacity={0.8}
          >
            <Ionicons name="close-outline" size={16} color="#8B8398" />
            <Text style={styles.declineBtnText}>Reddet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={handleAccept}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-outline" size={16} color="#FFFFFF" />
            <Text style={styles.acceptBtnText}>Kabul Et</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function InvitesModal() {
  const { isModalOpen, closeModal, pendingInvites } = useInvites();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={isModalOpen}
      transparent
      animationType="slide"
      onRequestClose={closeModal}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Davetler</Text>
            <TouchableOpacity onPress={closeModal} hitSlop={8} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color="#8B8398" />
            </TouchableOpacity>
          </View>
          {pendingInvites.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color="#8B8398" />
              <Text style={styles.emptyText}>Bekleyen davet yok</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
              {pendingInvites.map((invite) => (
                <InviteCard key={invite.id} invite={invite} />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
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
    maxHeight: '80%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E0D8DC',
    alignSelf: 'center', marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#361C17' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 15, color: '#8B8398' },

  list: { paddingHorizontal: 16 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#561C24',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  inviterText: { fontSize: 13, color: '#8B8398', marginBottom: 4 },
  inviterName: { fontWeight: '700', color: '#361C17' },
  coParticipantsText: { fontSize: 12, color: '#8B8398', marginBottom: 10 },
  coParticipantsNames: { fontWeight: '600', color: '#361C17' },

  routineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routineIcon: { fontSize: 28 },
  routineInfo: { flex: 1 },
  routineName: { fontSize: 16, fontWeight: '700', color: '#361C17' },
  routineMeta: { fontSize: 12, color: '#8B8398', marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  declineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#F0EBEA',
  },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: '#8B8398' },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#561C24',
  },
  acceptBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});
