import { useEffect, useState } from 'react';
import { DocumentData, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

type RawHabit = { id: string } & DocumentData;

export function useHabits(user: { uid: string } | null): {
  habits: RawHabit[];
  loading: boolean;
} {
  const [habits, setHabits] = useState<RawHabit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, 'users', user.uid, 'habits'),
      (snap) => {
        setHabits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  }, [user]);

  return { habits, loading };
}
