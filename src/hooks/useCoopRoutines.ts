import { useEffect, useState } from 'react';
import { DocumentData, collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

type RawCoopRoutine = { id: string } & DocumentData;

// ownerId yoksa creatorId'ye düşer — eski dokümanlar için geriye dönük uyumluluk.
export function getRoutineOwnerId(routine: { ownerId?: string; creatorId?: string }): string | undefined {
  return routine.ownerId ?? routine.creatorId;
}

export function useCoopRoutines(user: { uid: string } | null): {
  coopRoutines: RawCoopRoutine[];
  partnerNames: Record<string, string>;
  loading: boolean;
} {
  const [coopRoutines, setCoopRoutines] = useState<RawCoopRoutine[]>([]);
  const [partnerNames, setPartnerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(db, 'coopRoutines'), where('participantIds', 'array-contains', user.uid)),
      (snap) => {
        // status alanı olmayan eski dokümanlar 'active' sayılır (geriye uyumluluk).
        // pending rutinler participantIds'teki herkes için dahil edilir (kabul etmiş olanlar dahil).
        // pendingIds'teki (henüz cevap vermemiş) kişiler Firestore sorgusu tarafından zaten dışlanır.
        const active = snap.docs.filter((d) => {
          const status = d.data().status as string | undefined;
          return status === 'active' || status === undefined || status === 'pending' || status === 'individual';
        });
        setCoopRoutines(active.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (error) => { console.error('[useCoopRoutines] hata:', error.code, error.message); },
    );
  }, [user]);

  useEffect(() => {
    if (!user || coopRoutines.length === 0) return;
    let cancelled = false;

    // pendingIds de dahil edilir: FriendsScreen'deki "Onay bekleniyor" alt metni için gerekli.
    // memberSince/memberUntil anahtarları da dahil edilir: ayrılmış üyelerin geçmiş tarihlerdeki
    // isimlerinin CalendarScreen ve HomeScreen'de '...' yerine doğru görünmesi için gerekli.
    const partnerUids = [...new Set(
      coopRoutines.flatMap((r) => {
        const participantIds = (r.participantIds as string[] | undefined) ?? [];
        const pendingIds = (r.pendingIds as string[] | undefined) ?? [];
        const memberSinceUids = Object.keys((r.memberSince as Record<string, string> | undefined) ?? {});
        const memberUntilUids = Object.keys((r.memberUntil as Record<string, string> | undefined) ?? {});
        return [...participantIds, ...pendingIds, ...memberSinceUids, ...memberUntilUids]
          .filter((u) => u !== user.uid);
      })
    )];

    Promise.all(
      partnerUids.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          const name = snap.exists() ? ((snap.data().displayName as string | undefined) ?? 'Bilinmeyen kullanıcı') : 'Bilinmeyen kullanıcı';
          return { uid, name };
        } catch {
          return { uid, name: 'Bilinmeyen kullanıcı' };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      results.forEach((r) => { map[r.uid] = r.name; });
      setPartnerNames(map);
    });

    return () => { cancelled = true; };
  }, [user, coopRoutines]);

  return { coopRoutines, partnerNames, loading };
}
