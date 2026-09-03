import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../config/firebase';
import { getAutoEmoji } from '../utils/iconHelpers';
import { getLocalDateString } from '../utils/dateHelpers';
import { useCoopRoutines } from '../hooks/useCoopRoutines';
import { useCoopCompletions } from '../hooks/useCoopCompletions';
import InvitesButton from '../components/InvitesButton';

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return code;
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function InitialAvatar({
  name,
  size = 36,
  color = '#561C24',
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const letter = name[0]?.toLocaleUpperCase('tr-TR') ?? '?';
  return (
    <LinearGradient
      colors={[color, color]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{letter}</Text>
    </LinearGradient>
  );
}

// Collapsed snap: handle bar + "Davet Kodu Oluştur" butonu + alt boşluk
// handleWrap(26) + button(~78) + marginBottom(10) ≈ 114 → 118 buffer
const COLLAPSED_HEIGHT = 118;
// Gap between panel bottom and nav bar top
const PANEL_GAP = 12;

type Props = { navBarInset?: number };

export default function FriendsScreen({ navBarInset }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();

  // ── Panel geometry ────────────────────────────────────────────────
  // NAV_OFFSET = nav bar top edge from screen bottom (tab 60 + bottom margin 8 + safe area)
  const NAV_OFFSET = navBarInset ?? insets.bottom + 68;
  // Panel bottom sits PANEL_GAP above the nav bar top edge
  const PANEL_BOTTOM = NAV_OFFSET + PANEL_GAP;
  // Max expanded height: from PANEL_BOTTOM up to just below the status bar
  const PANEL_MAX_HEIGHT = Math.max(
    COLLAPSED_HEIGHT + 80,
    windowH - PANEL_BOTTOM - insets.top - 20,
  );

  // Keep a ref for use inside PanResponder closures (closures capture only once)
  const panelMaxRef = useRef(PANEL_MAX_HEIGHT);
  panelMaxRef.current = PANEL_MAX_HEIGHT;

  // ── Height animation ──────────────────────────────────────────────
  // Animating HEIGHT (not translateY) with overflow:'hidden' ensures
  // content is physically clipped — nothing renders beyond the container boundary.
  const panHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const [isExpanded, setIsExpanded] = useState(false);

  // Track current height value for PanResponder grant capture
  const currentHeightRef = useRef(COLLAPSED_HEIGHT);
  useEffect(() => {
    const id = panHeight.addListener(({ value }) => {
      currentHeightRef.current = value;
    });
    return () => panHeight.removeListener(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Height value captured at the start of each gesture
  const grantHeightRef = useRef(COLLAPSED_HEIGHT);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Only claim the gesture when vertical movement dominates
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dy) > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderGrant: () => {
        panHeight.stopAnimation();
        // currentHeightRef is updated by addListener — reliable base for this gesture
        grantHeightRef.current = currentHeightRef.current;
      },
      onPanResponderMove: (_, gs) => {
        // Dragging UP (dy < 0) → height increases. Clamp to [COLLAPSED, MAX].
        const next = Math.max(
          COLLAPSED_HEIGHT,
          Math.min(panelMaxRef.current, grantHeightRef.current - gs.dy),
        );
        panHeight.setValue(next);
      },
      onPanResponderRelease: (_, gs) => {
        const currentH = Math.max(
          COLLAPSED_HEIGHT,
          Math.min(panelMaxRef.current, grantHeightRef.current - gs.dy),
        );
        const midPoint = (COLLAPSED_HEIGHT + panelMaxRef.current) / 2;
        // Velocity < 0 = moving up quickly → expand; velocity > 0 = moving down → collapse
        const expand =
          gs.vy < -0.5 || (Math.abs(gs.vy) < 0.5 && currentH > midPoint);
        Animated.spring(panHeight, {
          toValue: expand ? panelMaxRef.current : COLLAPSED_HEIGHT,
          useNativeDriver: false,
          friction: 10,
          tension: 80,
        }).start(() => setIsExpanded(expand));
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // ── Arkadaş listesi ───────────────────────────────────────────────
  const [friends, setFriends] = useState<{ uid: string; displayName: string }[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'friendships'),
      where('uids', 'array-contains', user.uid),
    );
    const unsubscribe = onSnapshot(
      q,
      async (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const friendUids = snap.docs
          .map((d) => (d.data().uids as string[]).find((u) => u !== user.uid) ?? '')
          .filter(Boolean);
        const profiles = (
          await Promise.all(
            friendUids.map(async (uid) => {
              try {
                const userSnap = await getDoc(doc(db, 'users', uid));
                const displayName = userSnap.exists()
                  ? ((userSnap.data().displayName as string | undefined) ?? uid)
                  : uid;
                return { uid, displayName };
              } catch {
                return null;
              }
            }),
          )
        ).filter((p): p is { uid: string; displayName: string } => p !== null);
        setFriends(profiles);
      },
      (error) => {
        console.error('[Friends] onSnapshot hatası:', error.code, error.message);
      },
    );
    return unsubscribe;
  }, [user]);

  // ── Ortak rutinler ────────────────────────────────────────────────
  const { coopRoutines, partnerNames, loading: routinesLoading } = useCoopRoutines(user);
  const coopRoutineIds = useMemo(
    () => coopRoutines
      .filter((r) => (r.status as string | undefined) !== 'pending')
      .map((r) => r.id as string),
    [coopRoutines],
  );
  const displayedCoopRoutines = useMemo(
    () => coopRoutines.filter(
      (r) =>
        (r.status as string | undefined) !== 'pending' &&
        (r.status as string | undefined) !== 'individual',
    ),
    [coopRoutines],
  );
  const { completions } = useCoopCompletions(user, coopRoutineIds);
  const today = getLocalDateString();

  const isCompletedToday = (routineId: string, uid: string) =>
    completions.some(
      (c) => c.routineId === routineId && c.date === today && c.completedBy === uid,
    );

  // ── Davet kodu oluştur ────────────────────────────────────────────
  const handleCreateInvite = async () => {
    if (!auth.currentUser) return;
    setInviteLoading(true);
    try {
      const code = generateCode();
      const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
      await setDoc(doc(db, 'friendInvites', code), {
        ownerId: auth.currentUser.uid,
        used: false,
        expiresAt,
        createdAt: serverTimestamp(),
        code,
      });
      setInviteCode(code);
    } catch {
      Alert.alert('Hata', 'Davet kodu oluşturulamadı. Tekrar dene.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleShareInvite = async () => {
    if (!inviteCode) return;
    try {
      await Share.share({
        message: `HabitTeam'de birlikte rutin yapalım! Davet kodun: ${inviteCode}\n(24 saat geçerli)`,
      });
    } catch {
      // kullanıcı iptal etti
    }
  };

  // ── Kod kullan ────────────────────────────────────────────────────
  const handleRedeem = async () => {
    const code = redeemInput.trim().toUpperCase();
    if (code.length !== 6) {
      Alert.alert('Hata', 'Kod 6 karakter olmalı.');
      return;
    }
    if (!auth.currentUser) return;
    setRedeemLoading(true);
    try {
      const inviteRef = doc(db, 'friendInvites', code);
      const inviteSnap = await getDoc(inviteRef);
      if (!inviteSnap.exists()) { Alert.alert('Hata', 'Geçersiz kod.'); return; }
      const data = inviteSnap.data();
      if (data.used === true) { Alert.alert('Hata', 'Bu kod zaten kullanılmış.'); return; }
      if ((data.expiresAt as Timestamp).toMillis() < Date.now()) {
        Alert.alert('Hata', 'Kodun süresi dolmuş.'); return;
      }
      if (data.ownerId === auth.currentUser.uid) {
        Alert.alert('Hata', 'Kendi kodunu kullanamazsın.'); return;
      }

      const ownerId: string = data.ownerId;
      const myUid = auth.currentUser.uid;
      const friendshipId = [ownerId, myUid].sort().join('_');
      const friendshipRef = doc(db, 'friendships', friendshipId);
      const existing = await getDoc(friendshipRef);
      if (existing.exists()) { Alert.alert('Bilgi', 'Bu kişi zaten arkadaşın.'); return; }

      await setDoc(friendshipRef, { uids: [ownerId, myUid], viaInviteCode: code });
      await updateDoc(inviteRef, { used: true });

      try {
        const ownerSnap = await getDoc(doc(db, 'users', ownerId));
        const displayName = ownerSnap.exists()
          ? ((ownerSnap.data().displayName as string | undefined) ?? ownerId)
          : ownerId;
        setFriends((prev) => {
          if (prev.some((f) => f.uid === ownerId)) return prev;
          return [...prev, { uid: ownerId, displayName }];
        });
      } catch { /* onSnapshot yakalar */ }

      setRedeemInput('');
      Alert.alert('Başarılı', 'Arkadaş eklendi!');
    } catch (err) {
      const errCode = (err as { code?: string }).code ?? '';
      Alert.alert(
        'Hata',
        errCode === 'permission-denied'
          ? 'Bu kod artık geçerli değil.'
          : 'Bir sorun oluştu. Tekrar dene.',
      );
    } finally {
      setRedeemLoading(false);
    }
  };

  // ── Arkadaşı sil ──────────────────────────────────────────────────
  const handleDeleteFriend = (friend: { uid: string; displayName: string }) => {
    if (!user) return;
    Alert.alert(
      'Arkadaşlıktan Çıkar',
      `${friend.displayName} arkadaşlıktan çıkarılsın mı? Varsa aranızdaki ortak rutinler de silinecek.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              const friendshipId = [user.uid, friend.uid].sort().join('_');
              const routinesSnap = await getDocs(
                query(
                  collection(db, 'coopRoutines'),
                  where('participantIds', 'array-contains', user.uid),
                ),
              );
              const sharedRoutines = routinesSnap.docs.filter((d) =>
                (d.data().participantIds as string[]).includes(friend.uid),
              );
              const sharedRoutineIds = new Set(sharedRoutines.map((d) => d.id));
              let completionDocs: typeof routinesSnap.docs = [];
              if (sharedRoutineIds.size > 0) {
                const completionsSnap = await getDocs(
                  query(
                    collection(db, 'coopCompletions'),
                    where('participantIds', 'array-contains', user.uid),
                  ),
                );
                completionDocs = completionsSnap.docs.filter((d) =>
                  sharedRoutineIds.has(d.data().routineId as string),
                );
              }
              const batch = writeBatch(db);
              batch.delete(doc(db, 'friendships', friendshipId));
              sharedRoutines.forEach((d) => batch.delete(d.ref));
              completionDocs.forEach((d) => batch.delete(d.ref));
              await batch.commit();
            } catch (error: unknown) {
              const e = error as { code?: string; message?: string };
              console.error('[handleDeleteFriend]', e?.code, e?.message);
              Alert.alert('Hata', 'Arkadaş silinirken bir sorun oluştu.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>

      {/* ── ARKA PLAN: Ortak rutinler ── */}
      <ScrollView
        style={styles.bgScroll}
        contentContainerStyle={[
          styles.bgContent,
          { paddingTop: insets.top + 20, paddingBottom: 280 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageTitleRow}>
          <Text style={styles.pageTitle}>Ekip</Text>
          <InvitesButton />
        </View>
        <SectionHeader title="ORTAK RUTİNLER" />

        {routinesLoading ? (
          <ActivityIndicator color="#561C24" style={{ marginTop: 16 }} />
        ) : displayedCoopRoutines.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyFriends}>Henüz ortak rutinin yok</Text>
          </View>
        ) : (
          displayedCoopRoutines.map((routine) => {
            const participantIds = routine.participantIds as string[];
            const otherUids = participantIds.filter((u) => u !== user?.uid);
            const AVATAR_COLORS = ['#561C24', '#A9C1D1', '#D8C3A5'];
            const emoji = getAutoEmoji(routine.name as string);
            const isPending = (routine.status as string | undefined) === 'pending';
            const pendingIds = (routine.pendingIds as string[] | undefined) ?? [];

            let pendingSubtext: string | null = null;
            if (isPending && pendingIds.length > 0) {
              const names = pendingIds.map((uid) => partnerNames[uid] ?? '…');
              const last = names[names.length - 1];
              const rest = names.slice(0, -1);
              pendingSubtext = rest.length > 0
                ? `${rest.join(', ')} ve ${last}'nın onayı bekleniyor`
                : `${last}'nın onayı bekleniyor`;
            }

            return (
              <View key={routine.id} style={styles.coopCard}>
                <View style={styles.coopCardTop}>
                  <Text style={styles.coopEmoji}>{emoji}</Text>
                  <Text style={styles.coopName} numberOfLines={1}>{routine.name}</Text>
                  {isPending && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Onay bekleniyor</Text>
                    </View>
                  )}
                </View>
                {pendingSubtext != null && (
                  <Text style={styles.pendingSubtext}>{pendingSubtext}</Text>
                )}
                <View style={styles.coopParticipants}>
                  {participantIds.map((uid, idx) => {
                    const isMe = uid === user?.uid;
                    const name = isMe
                      ? (user?.displayName ?? 'Ben')
                      : (partnerNames[uid] ?? '…');
                    const done = isCompletedToday(routine.id, uid);
                    const otherIdx = otherUids.indexOf(uid);
                    const avatarColor = isMe
                      ? AVATAR_COLORS[0]
                      : AVATAR_COLORS[1 + (otherIdx % (AVATAR_COLORS.length - 1))];

                    return (
                      <View
                        key={uid}
                        style={[
                          styles.participantRow,
                          idx < participantIds.length - 1 && styles.participantRowGap,
                        ]}
                      >
                        <InitialAvatar name={name} size={28} color={avatarColor} />
                        <View style={styles.participantMid}>
                          <Text style={styles.participantName} numberOfLines={1}>
                            {name}{isMe ? ' (Siz)' : ''}
                          </Text>
                          <View style={styles.progressBarBg}>
                            {done && <View style={styles.progressBarFill} />}
                          </View>
                        </View>
                        <View style={[styles.statusIcon, done && styles.statusIconDone]}>
                          <Ionicons
                            name={done ? 'checkmark' : 'time-outline'}
                            size={14}
                            color={done ? '#FFFFFF' : '#8B8398'}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/*
        ── SÜRÜKLENEBILIR PANEL ──
        bottom = NAV_OFFSET + PANEL_GAP  →  panel alt kenarı nav bar üst kenarından
                                            PANEL_GAP px yukarıda, hiç temas etmez.
        height  = animated (COLLAPSED_HEIGHT ↔ PANEL_MAX_HEIGHT)
        overflow = 'hidden'  →  height sınırının ötesine hiçbir piksel render edilmez;
                                nav bar alanına içerik fiziksel olarak taşamaz.
      */}
      <Animated.View
        style={[
          styles.panel,
          {
            bottom: PANEL_BOTTOM,
            height: panHeight,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Drag handle — pan responder SADECE burada */}
        <View style={styles.handleWrap} {...panResponder.panHandlers}>
          <View style={styles.handleBar} />
        </View>

        {/* Panel içeriği */}
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={styles.panelContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={isExpanded}
          keyboardShouldPersistTaps="handled"
        >
          {/* Davet kodu butonu veya oluşturulan kod kartı */}
          {inviteCode ? (
            <View style={styles.inviteCard}>
              <Text style={styles.inviteLabel}>DAVET KODUN</Text>
              <Text style={styles.inviteCode}>{inviteCode}</Text>
              <Text style={styles.inviteExpiry}>24 saat geçerli</Text>
              <View style={styles.inviteBtnRow}>
                <TouchableOpacity
                  style={styles.shareBtn}
                  onPress={handleShareInvite}
                  activeOpacity={0.85}
                >
                  <Ionicons name="share-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.shareBtnText}>Paylaş</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.newCodeBtn}
                  onPress={handleCreateInvite}
                  activeOpacity={0.85}
                  disabled={inviteLoading}
                >
                  <Text style={styles.newCodeBtnText}>{inviteLoading ? '…' : 'Yeni Kod'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleCreateInvite}
              activeOpacity={0.85}
              disabled={inviteLoading}
              style={styles.createInviteBtn}
            >
              <Ionicons name="person-add-outline" size={22} color="#263C50" />
              <Text style={styles.createInviteBtnText}>
                {inviteLoading ? 'Oluşturuluyor…' : 'Davet Kodu Oluştur'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Kod gir & arkadaş ekle */}
          <View style={styles.redeemRow}>
            <TextInput
              style={styles.redeemInput}
              placeholder="Arkadaş kodunu gir"
              placeholderTextColor="#8B8398"
              value={redeemInput}
              onChangeText={(t) => setRedeemInput(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              editable={!redeemLoading}
            />
            <TouchableOpacity
              style={[styles.redeemBtn, redeemLoading && styles.redeemBtnDisabled]}
              onPress={handleRedeem}
              disabled={redeemLoading}
              activeOpacity={0.85}
            >
              <Text style={styles.redeemBtnText}>{redeemLoading ? '…' : 'Ekle'}</Text>
            </TouchableOpacity>
          </View>

          {/* Arkadaş listesi */}
          <SectionHeader title="ARKADAŞLARIM" />
          <View style={styles.friendsCard}>
            {friends.length === 0 ? (
              <Text style={styles.emptyFriends}>
                Henüz arkadaşın yok, davet kodu paylaş
              </Text>
            ) : (
              friends.map((friend, index) => (
                <React.Fragment key={friend.uid}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.friendRow}>
                    <InitialAvatar name={friend.displayName} size={40} />
                    <Text style={styles.friendName}>{friend.displayName}</Text>
                    <TouchableOpacity
                      onPress={() => handleDeleteFriend(friend)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#D98A8A" />
                    </TouchableOpacity>
                  </View>
                </React.Fragment>
              ))
            )}
          </View>
        </ScrollView>
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FEFCFA' },

  // ── Arka plan ────────────────────────────────────────────────────
  bgScroll: { flex: 1 },
  bgContent: { paddingHorizontal: 20 },

  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#361C17',
  },

  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8B8398',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 4,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  // ── Ortak rutin kartları ──────────────────────────────────────────
  coopCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#561C24',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  coopCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  coopEmoji: { fontSize: 18 },
  coopName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#361C17' },

  pendingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0EBEA',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#561C24',
  },
  pendingSubtext: {
    fontSize: 12,
    color: '#8B8398',
    marginBottom: 10,
  },

  coopParticipants: {},
  participantRow: { flexDirection: 'row', alignItems: 'center' },
  participantRowGap: { marginBottom: 10 },
  participantMid: { flex: 1, flexDirection: 'column', marginHorizontal: 8 },
  participantName: {
    fontSize: 13,
    lineHeight: 16,
    color: '#361C17',
  },

  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F0EBEA',
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    width: '100%',
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#561C24',
  },
  statusIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F0EBEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconDone: { backgroundColor: '#561C24' },

  // ── Avatar ───────────────────────────────────────────────────────
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700', color: '#FFFFFF' },

  // ── Sürüklenebilir panel ──────────────────────────────────────────
  // bottom ve height inline olarak geçirilir (animated & responsive).
  // overflow:'hidden' → height sınırının ötesinde hiçbir piksel render edilmez.
  panel: {
    position: 'absolute',
    left: 16,
    right: 16,
    overflow: 'hidden',
    backgroundColor: '#DDE6ED',
    borderRadius: 24,
    shadowColor: '#263C50',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 12,
  },

  handleWrap: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 10,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A9C1D1',
  },

  panelScroll: { flex: 1 },
  panelContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  // ── Davet kodu ───────────────────────────────────────────────────
  createInviteBtn: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#263C50',
    marginBottom: 10,
  },
  createInviteBtnText: {
    fontSize: 14,
    color: '#263C50',
    fontWeight: '700',
    textAlign: 'center',
  },

  inviteCard: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  inviteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8B8398',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  inviteCode: { fontSize: 34, fontWeight: '800', color: '#361C17', letterSpacing: 6 },
  inviteExpiry: { fontSize: 12, color: '#8B8398', marginTop: 2, marginBottom: 16 },
  inviteBtnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#561C24',
    borderRadius: 12,
    paddingVertical: 13,
  },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  newCodeBtn: {
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#561C24',
    paddingVertical: 13,
  },
  newCodeBtnText: { fontSize: 14, fontWeight: '600', color: '#561C24' },

  // ── Kod gir ──────────────────────────────────────────────────────
  redeemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 20,
  },
  redeemInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#561C24',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '700',
    color: '#361C17',
    backgroundColor: '#FEFCFA',
  },
  redeemBtn: {
    backgroundColor: '#561C24',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redeemBtnDisabled: { opacity: 0.6 },
  redeemBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // ── Arkadaş listesi ───────────────────────────────────────────────
  emptyFriends: {
    fontSize: 13,
    color: '#8B8398',
    textAlign: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  friendsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  divider: { height: 1, backgroundColor: '#E6DDDE', marginHorizontal: 16 },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  friendName: { flex: 1, fontSize: 15, color: '#361C17', fontWeight: '500' },
});
