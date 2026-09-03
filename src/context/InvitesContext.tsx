import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { getLocalDateString } from '../utils/dateHelpers';
import * as Notifications from 'expo-notifications';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { sendExpoPush } from '../utils/pushNotifications';

export type PendingInvite = {
  id: string;
  creatorId: string;
  creatorName: string;
  name: string;
  icon: string;
  repeatType?: string;
  repeatDays?: number[];
  reminderTime?: string | null;
  onceDate?: string | null;
  participantIds: string[];
  pendingIds: string[];
  participantNames: Record<string, string>; // uid → displayName (creator dahil tüm UIDs)
};

type InvitesContextType = {
  pendingInvites: PendingInvite[];
  inviteCount: number;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  acceptInvite: (routineId: string) => Promise<void>;
  declineInvite: (routineId: string) => Promise<void>;
};

const InvitesContext = createContext<InvitesContextType | null>(null);

export function InvitesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Bildirime tıklanınca modali aç
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'invite' || data?.type === 'routine_active') {
        setIsModalOpen(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Bekleyen davetler listener
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- user null olunca (çıkış) davet listesini temizlemek için kasıtlı early-exit
    if (!user) { setPendingInvites([]); return; }
    const q = query(
      collection(db, 'coopRoutines'),
      where('pendingIds', 'array-contains', user.uid),
    );
    const unsub = onSnapshot(q, async (snap) => {
      const invites: PendingInvite[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const participantIds = (data.participantIds as string[]) ?? [];
        const pendingIds = (data.pendingIds as string[]) ?? [];
        const creatorId = data.creatorId as string;

        // Rutin'deki tüm UID'leri tek seferde çözümle (creator + participants + pendings)
        const allUids = [...new Set([creatorId, ...participantIds, ...pendingIds])];
        const participantNames: Record<string, string> = {};
        await Promise.all(allUids.map(async (uid) => {
          try {
            const s = await getDoc(doc(db, 'users', uid));
            participantNames[uid] = s.exists()
              ? ((s.data().displayName as string | undefined) ?? 'Bilinmeyen kullanıcı')
              : 'Bilinmeyen kullanıcı';
          } catch {
            participantNames[uid] = 'Bilinmeyen kullanıcı';
          }
        }));

        invites.push({
          id: d.id,
          creatorId,
          creatorName: participantNames[creatorId] ?? 'Bilinmeyen kullanıcı',
          name: data.name as string,
          icon: data.icon as string,
          repeatType: data.repeatType as string | undefined,
          repeatDays: data.repeatDays as number[] | undefined,
          reminderTime: data.reminderTime as string | null | undefined,
          onceDate: data.onceDate as string | null | undefined,
          participantIds,
          pendingIds,
          participantNames,
        });
      }
      setPendingInvites(invites);
    }, () => {});
    return unsub;
  }, [user]);

  const acceptInvite = async (routineId: string) => {
    if (!user) return;
    const ref = doc(db, 'coopRoutines', routineId);
    let newStatus: 'active' | null = null;
    let finalParticipantIds: string[] = [];

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const newPending = (data.pendingIds as string[]).filter((u) => u !== user.uid);
      const newParticipants = [...(data.participantIds as string[]), user.uid];
      finalParticipantIds = newParticipants;
      const updates: Record<string, unknown> = {
        pendingIds: newPending,
        participantIds: newParticipants,
        [`memberSince.${user.uid}`]: getLocalDateString(),
      };
      if (newPending.length === 0 && newParticipants.length >= 2) {
        updates.status = 'active';
        newStatus = 'active';
      }
      tx.update(ref, updates);
    });

    if (newStatus === 'active') {
      const others = finalParticipantIds.filter((u) => u !== user.uid);
      const tokens = (await Promise.all(
        others.map(async (uid) => {
          try {
            const s = await getDoc(doc(db, 'users', uid));
            return s.data()?.pushToken as string | undefined;
          } catch { return undefined; }
        }),
      )).filter(Boolean) as string[];
      try {
        const routineSnap = await getDoc(ref);
        const routineName = (routineSnap.data()?.name as string | undefined) ?? '';
        if (tokens.length > 0) {
          await sendExpoPush(tokens, 'Ortak rutin başladı! 🎉', routineName, { type: 'routine_active' });
        }
      } catch { /* yoksay */ }
    }
  };

  const declineInvite = async (routineId: string) => {
    if (!user) return;
    const ref = doc(db, 'coopRoutines', routineId);
    let shouldDelete = false;
    let newStatus: 'active' | null = null;
    let finalParticipantIds: string[] = [];

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const newPending = (data.pendingIds as string[]).filter((u) => u !== user.uid);
      const newDeclined = [...((data.declinedIds as string[]) ?? []), user.uid];
      const participantIds = data.participantIds as string[];
      finalParticipantIds = participantIds;

      if (newPending.length === 0 && participantIds.length < 2) {
        // Yeterli katılımcı kalmadı → iptal et
        shouldDelete = true;
        tx.update(ref, { pendingIds: newPending, declinedIds: newDeclined, status: 'cancelled' });
      } else if (newPending.length === 0 && participantIds.length >= 2) {
        // Tüm davetler yanıtlandı, yeterli katılımcı var → aktifleştir
        newStatus = 'active';
        tx.update(ref, { pendingIds: newPending, declinedIds: newDeclined, status: 'active' });
      } else {
        tx.update(ref, { pendingIds: newPending, declinedIds: newDeclined });
      }
    });

    if (shouldDelete) {
      try { await deleteDoc(ref); } catch { /* yoksay */ }
    }

    if (newStatus === 'active') {
      const others = finalParticipantIds.filter((u) => u !== user.uid);
      const tokens = (await Promise.all(
        others.map(async (uid) => {
          try {
            const s = await getDoc(doc(db, 'users', uid));
            return s.data()?.pushToken as string | undefined;
          } catch { return undefined; }
        }),
      )).filter(Boolean) as string[];
      try {
        const routineSnap = await getDoc(ref);
        const routineName = (routineSnap.data()?.name as string | undefined) ?? '';
        if (tokens.length > 0) {
          await sendExpoPush(tokens, 'Ortak rutin başladı! 🎉', routineName, { type: 'routine_active' });
        }
      } catch { /* yoksay */ }
    }
  };

  return (
    <InvitesContext.Provider value={{
      pendingInvites,
      inviteCount: pendingInvites.length,
      isModalOpen,
      openModal: () => setIsModalOpen(true),
      closeModal: () => setIsModalOpen(false),
      acceptInvite,
      declineInvite,
    }}>
      {children}
    </InvitesContext.Provider>
  );
}

export function useInvites() {
  const ctx = useContext(InvitesContext);
  if (!ctx) throw new Error('useInvites must be used within InvitesProvider');
  return ctx;
}
