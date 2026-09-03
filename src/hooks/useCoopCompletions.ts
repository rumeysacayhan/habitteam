import { useEffect, useState } from 'react';
import { DocumentData, collection, onSnapshot, query, where } from 'firebase/firestore';
import { getLocalDateString } from '../utils/dateHelpers';
import { db } from '../config/firebase';

export function useCoopCompletions(
  user: { uid: string } | null,
  routineIds: string[] = [],
): {
  completions: DocumentData[];
  loading: boolean;
} {
  const [completions, setCompletions] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  // Stable cache key — effect only re-runs when the actual id set changes.
  const routineIdsKey = routineIds.join(',');

  useEffect(() => {
    if (!user || routineIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- routineIds boşken state temizleme kasıtlı; onSnapshot callback içindeki setState ise asenkron
      setCompletions([]);
      setLoading(false);
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoff = getLocalDateString(cutoffDate);

    // Her routineId için ayrı onSnapshot — tek bozuk rutin diğerlerini etkilemez.
    const chunks: string[][] = routineIds.map((id) => [id]);

    const chunkResults: DocumentData[][] = chunks.map(() => []);
    const loadedIndices = new Set<number>();

    const unsubscribers = chunks.map((chunk, idx) =>
      onSnapshot(
        query(
          collection(db, 'coopCompletions'),
          where('routineId', 'in', chunk),
          where('date', '>=', cutoff),
        ),
        (snap) => {
          chunkResults[idx] = snap.docs.map((d) => d.data());
          loadedIndices.add(idx);
          if (loadedIndices.size >= chunks.length) setLoading(false);
          setCompletions(chunkResults.flat());
        },
        (error) => { console.error('[useCoopCompletions] hata:', error.code, error.message, 'chunk:', chunk); },
      )
    );

    return () => { unsubscribers.forEach((unsub) => unsub()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, routineIdsKey]);

  return { completions, loading };
}
