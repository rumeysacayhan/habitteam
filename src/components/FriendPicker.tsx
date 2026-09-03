import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';

type Friend = { uid: string; displayName: string };

type Props = {
  excludeUids: string[];
  selectedUids: string[];
  onToggle: (uid: string) => void;
};

export default function FriendPicker({ excludeUids, selectedUids, onToggle }: Props) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async veri çekmeden önce spinner göstermek için kasıtlı senkron başlatma
    setLoading(true);

    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'friendships'), where('uids', 'array-contains', user.uid))
        );
        const friendUids = snap.docs
          .map((d) => (d.data().uids as string[]).find((u) => u !== user.uid) ?? '')
          .filter(Boolean)
          .filter((uid) => !excludeUids.includes(uid));

        const profiles = (
          await Promise.all(
            friendUids.map(async (uid) => {
              try {
                const s = await getDoc(doc(db, 'users', uid));
                const displayName = s.exists()
                  ? ((s.data().displayName as string | undefined) ?? uid)
                  : uid;
                return { uid, displayName };
              } catch {
                return null;
              }
            })
          )
        ).filter((p): p is Friend => p !== null);

        if (!cancelled) setFriends(profiles);
      } catch {
        // sessiz başarısızlık
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // key değişince (excludeUids) parent bileşen yeniden mount eder
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) return <ActivityIndicator color="#561C24" style={{ paddingVertical: 8 }} />;

  if (friends.length === 0) {
    return <Text style={styles.emptyText}>Eklenebilecek başka arkadaşın yok</Text>;
  }

  return (
    <>
      {friends.map((friend) => {
        const selected = selectedUids.includes(friend.uid);
        return (
          <TouchableOpacity
            key={friend.uid}
            style={styles.row}
            onPress={() => onToggle(friend.uid)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkBox, selected && styles.checkBoxActive]}>
              {selected && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
            </View>
            <Text style={[styles.nameText, selected && styles.nameTextActive]}>
              {friend.displayName}
            </Text>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    fontSize: 13,
    color: '#8B8398',
    textAlign: 'center',
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  nameText: { fontSize: 15, color: '#8B8398', fontWeight: '500' },
  nameTextActive: { color: '#361C17', fontWeight: '600' },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#561C24',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkBoxActive: { backgroundColor: '#561C24' },
});
