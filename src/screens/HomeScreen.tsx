import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  PanResponder,
  TouchableWithoutFeedback,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  serverTimestamp,
  query,
  where,
  writeBatch,
  arrayRemove,
} from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { getLocalDateString } from '../utils/dateHelpers';
import {
  cancelCoopRoutineNotifications,
  cancelOrphanCoopNotifications,
} from '../utils/coopNotifications';
import { getAutoEmoji } from '../utils/iconHelpers';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { calculatePersonalCoopStreak, getActivePartnerUidsForDate } from '../utils/coopStreak';
import { useHabits } from '../hooks/useHabits';
import { useCoopRoutines, getRoutineOwnerId } from '../hooks/useCoopRoutines';

import { useCoopCompletions } from '../hooks/useCoopCompletions';
import CheckButton from '../components/CheckButton';
import InvitesButton from '../components/InvitesButton';
import InvitesModal from '../components/InvitesModal';
import CalendarScreen from './CalendarScreen';
import CreateRoutineScreen from './CreateRoutineScreen';
import FriendsScreen from './FriendsScreen';
import SettingsScreen from './SettingsScreen';
import ManageMembersScreen, { ManagedRoutine } from './ManageMembersScreen';
import TransferOwnershipScreen, { TransferRoutine } from './TransferOwnershipScreen';
import LoneMemberModal, { LoneRoutine } from './LoneMemberModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Habit = {
  id: string;
  name: string;
  completedDate: string | null;
  createdAt: string;
  reminderTime?: string;
  repeatDays?: number[];
  repeatType?: string;
  onceDate?: string;
  startDate?: string;
};

type CoopRoutine = {
  id: string;
  creatorId: string;
  ownerId?: string;
  memberSince?: Record<string, string>;
  memberUntil?: Record<string, string>;
  participantIds: string[];
  name: string;
  icon: string;
  repeatDays?: number[];
  repeatType?: string;
  onceDate?: string;
  reminderTime?: string | null;
  status?: string;
  startDate?: string;
};

type TimelineItem =
  | { kind: 'solo'; data: Habit }
  | { kind: 'coop'; data: CoopRoutine };

type TabKey = 'home' | 'calendar' | 'friends' | 'stats' | 'profile';

type Tab = {
  key: TabKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

const TABS: Tab[] = [
  { key: 'home',     label: 'Ana Sayfa', icon: 'home-outline' },
  { key: 'calendar', label: 'Takvim',    icon: 'calendar-outline' },
  { key: 'friends',  label: 'Ekip', icon: 'people-outline' },
  { key: 'profile',  label: 'Ayarlar',   icon: 'settings-outline' },
];

const MONTHS = [
  'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık',
];
const DAYS = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];

function getTurkishDate(): string {
  const now = new Date();
  return `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}, ${DAYS[now.getDay()]}`;
}

function titleCase(text: string): string {
  return text
    .split(' ')
    .map(w => w.length > 0 ? w[0].toLocaleUpperCase('tr-TR') + w.slice(1) : w)
    .join(' ');
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return titleCase('Günaydın ☀️');
  if (h >= 12 && h < 18) return titleCase('İyi günler 🌤️');
  if (h >= 18 && h < 21) return titleCase('İyi akşamlar 🌆');
  return titleCase('İyi geceler 🌙');
}

const WEEK_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

// selectedDate'in içinde bulunduğu haftayı döndürür (Pzt-Paz).
function getWeekForDate(
  dateStr: string,
): { label: string; dayNum: number; dateStr: string; isToday: boolean; isSelected: boolean }[] {
  const date = new Date(dateStr + 'T12:00:00');
  const jsDay = date.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const today = getLocalDateString();
  return WEEK_LABELS.map((label, i) => {
    const d = new Date(date);
    d.setDate(date.getDate() + mondayOffset + i);
    const ds = getLocalDateString(d);
    return { label, dayNum: d.getDate(), dateStr: ds, isToday: ds === today, isSelected: ds === dateStr };
  });
}

function isCompletedToday(completedDate: string | null): boolean {
  if (!completedDate) return false;
  return completedDate === getLocalDateString();
}

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function formatRepeatDays(days?: number[]): string {
  if (!days || days.length === 0) return '';
  if (days.length === 7) return 'Her gün';
  return days.map((d) => DAY_LABELS[d]).join(', ');
}

function sortItems(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    const tA = a.data.reminderTime ?? '';
    const tB = b.data.reminderTime ?? '';
    if (!tA && !tB) return 0;
    if (!tA) return 1;
    if (!tB) return -1;
    return tA.localeCompare(tB);
  });
}

// Firestore'daki 'once'|'weekly' değerlerini calculateCoopStreak'in beklediği
// 'once'|'daily'|'specificDays' formatına dönüştürür.
function toStreakRepeatType(
  repeatType: string | undefined,
  repeatDays: number[] | undefined,
): 'once' | 'daily' | 'specificDays' {
  if (repeatType === 'once') return 'once';
  return repeatDays?.length === 7 ? 'daily' : 'specificDays';
}

// Proje gün indeksi: 0=Pzt, 1=Sal, ..., 5=Cmt, 6=Paz (repeatDays kodlamasıyla eşleşir)
function getProjectDayIndex(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const js = d.getDay(); // 0=Paz (JS)
  return js === 0 ? 6 : js - 1;
}

// Bir rutinin verilen tarihte aktif olup olmadığını kontrol eder.
// startDate mevcutsa yalnızca o tarih ve sonrasında aktif sayılır (geriye sızma koruması).
// startDate yoksa (eski dokümanlar) kısıtlama uygulanmaz — geriye dönük uyumluluk.
function isActiveOnDate(
  repeatType: string | undefined,
  repeatDays: number[] | undefined,
  onceDate: string | undefined,
  dateStr: string,
  startDate?: string,
): boolean {
  if (repeatType === 'once') return onceDate === dateStr;
  if (startDate && dateStr < startDate) return false;
  if (!repeatDays || repeatDays.length === 0) return true;
  return repeatDays.includes(getProjectDayIndex(dateStr));
}

const CARD_TONES = ['#561C24', '#A9C1D1', '#D8C3A5'];

export default function HomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [navBarHeight, setNavBarHeight] = useState(68);

  // ── Modal state ──────────────────────────────────────────────────
  const [actionHabit, setActionHabit] = useState<Habit | null>(null);
  const [editHabit, setEditHabit] = useState<Habit | null>(null);
  const [actionCoopRoutine, setActionCoopRoutine] = useState<CoopRoutine | null>(null);
  const [editCoopRoutine, setEditCoopRoutine] = useState<CoopRoutine | null>(null);
  const [manageMembersRoutineId, setManageMembersRoutineId] = useState<string | null>(null);
  const [transferRoutine, setTransferRoutine] = useState<TransferRoutine | null>(null);
  const [loneMemberRoutine, setLoneMemberRoutine] = useState<LoneRoutine | null>(null);

  // Güne göre yeniden hesaplama — gece yarısı tetikleyici ile güncellenir
  const [todayDate, setTodayDate] = useState(() => getLocalDateString());
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const id = setTimeout(() => setTodayDate(getLocalDateString()), nextMidnight.getTime() - now.getTime());
    return () => clearTimeout(id);
  }, [todayDate]);

  // Seçili gün — varsayılan: bugün
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());

  // 'past' | 'today' | 'future': tamamlama izni ve aksiyon sheet görünürlüğü için
  const dayStatus: 'past' | 'today' | 'future' =
    selectedDate < todayDate ? 'past' : selectedDate > todayDate ? 'future' : 'today';

  // Swipe: sağa kaydırma → önceki gün, sola kaydırma → sonraki gün
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -50) {
          setSelectedDate((prev) => {
            const d = new Date(prev + 'T12:00:00');
            d.setDate(d.getDate() + 1);
            return getLocalDateString(d);
          });
        } else if (gs.dx > 50) {
          setSelectedDate((prev) => {
            const d = new Date(prev + 'T12:00:00');
            d.setDate(d.getDate() - 1);
            return getLocalDateString(d);
          });
        }
      },
    })
  ).current;

  // ── Hooks ────────────────────────────────────────────────────────
  const { habits: rawHabits, loading } = useHabits(user);
  const { coopRoutines: rawCoopRoutines, partnerNames, loading: coopLoading } = useCoopRoutines(user);
  const coopRoutineIds = useMemo(
    () => rawCoopRoutines
      .filter((r) => (r.status as string | undefined) !== 'pending')
      .map((r) => r.id as string),
    [rawCoopRoutines],
  );
  const { completions: rawCoopCompletions } = useCoopCompletions(user, coopRoutineIds);

  const habits = useMemo<Habit[]>(
    () => rawHabits.map((d) => ({ id: d.id, ...(d as unknown as Omit<Habit, 'id'>) })),
    [rawHabits],
  );

  const coopRoutines = useMemo<CoopRoutine[]>(
    () => rawCoopRoutines.map((d) => ({ id: d.id, ...(d as unknown as Omit<CoopRoutine, 'id'>) })),
    [rawCoopRoutines],
  );

  // ManageMembersScreen'e geçirilen rutin: ID-only state'ten rawCoopRoutines üzerinden
  // live türetilir — kick gibi Firestore güncellemeleri anında yansır, stale snapshot olmaz.
  // useMemo yerine düz hesaplama: küçük dizi + .find() yeterince hızlı, ek hook eklemiyor.
  const manageMembersRoutine: ManagedRoutine | null = manageMembersRoutineId
    ? ((rawCoopRoutines.find((r) => r.id === manageMembersRoutineId) as unknown as ManagedRoutine | undefined) ?? null)
    : null;

  // Yalnız kalan üye bildirimi — ilk kez yalnız kalındığında otomatik modal aç
  useEffect(() => {
    if (!user) return;
    const loneRoutines = coopRoutines.filter(
      (r) => r.status === 'active' &&
        r.participantIds.length === 1 &&
        r.participantIds[0] === user.uid,
    );
    if (loneRoutines.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const r of loneRoutines) {
        const key = `alone_notice_shown_${r.id}`;
        try {
          const shown = await AsyncStorage.getItem(key);
          if (!shown && !cancelled) {
            await AsyncStorage.setItem(key, 'true');
            setLoneMemberRoutine({ id: r.id, name: r.name });
            break;
          }
        } catch { /* yoksay */ }
      }
    })();
    return () => { cancelled = true; };
  }, [coopRoutines, user, manageMembersRoutineId]);

  // routineId → date → Set<completedByUid>
  // myCoopDoneToday: bildirim zamanlaması ve toggleCoopHabit için (bugünkü durum)
  const { rawCompletions, myCoopDoneToday } = useMemo(() => {
    const myDone = new Set<string>();
    const newRaw = new Map<string, Map<string, Set<string>>>();

    rawCoopCompletions.forEach((data) => {
      const routineId = data.routineId as string | undefined;
      const date = data.date as string | undefined;
      const completedBy = data.completedBy as string | undefined;
      const participantIds = data.participantIds as string[] | undefined;
      if (!routineId || !date || !completedBy || !participantIds) return;

      if (date === todayDate && completedBy === user?.uid) myDone.add(routineId);

      if (!newRaw.has(routineId)) newRaw.set(routineId, new Map());
      const dateMap = newRaw.get(routineId)!;
      if (!dateMap.has(date)) dateMap.set(date, new Set());
      dateMap.get(date)!.add(completedBy);
    });

    return { rawCompletions: newRaw, myCoopDoneToday: myDone };
  }, [rawCoopCompletions, todayDate, user]);

  // Seçili güne ait tamamlama durumu — renderCoopItem'da görsel için
  const myCoopDoneSelected = useMemo(() => {
    const done = new Set<string>();
    if (!user) return done;
    rawCompletions.forEach((dateMap, routineId) => {
      if (dateMap.get(selectedDate)?.has(user.uid)) done.add(routineId);
    });
    return done;
  }, [rawCompletions, selectedDate, user]);


  // ── Coop streak hesaplama ─────────────────────────────────────────
  // Grup-senkron model: tüm aktif üyeler o gün tamamlarsa seri ilerler.
  // Her üyenin sayacı kendi memberSince tarihinden öteye gidemez.
  const streaks = useMemo(() => {
    const map = new Map<string, number>();
    if (!user) return map;
    coopRoutines.forEach((routine) => {
      const dateMap = rawCompletions.get(routine.id) ?? new Map<string, Set<string>>();
      const repeatType = toStreakRepeatType(routine.repeatType, routine.repeatDays);
      const streak = calculatePersonalCoopStreak(
        user.uid,
        routine.participantIds,
        routine.memberSince,
        routine.memberUntil,
        routine.startDate,
        dateMap,
        repeatType,
        routine.repeatDays,
        new Date(),
      );
      map.set(routine.id, streak);
    });
    return map;
  }, [coopRoutines, rawCompletions, user]);

  // Tamamlanmamış coop rutinler için 21:00'de local bildirim zamanla
  useEffect(() => {
    // Firestore snapshot'ı gelmeden coopRoutines boş ([]) durur; bu haldeyken
    // aşağıdaki yetim süpürme bugüne kurulu tüm coop hatırlatmalarını siler.
    // loading bitene kadar bekle.
    if (!user || coopLoading) return;
    const today = getLocalDateString();
    const now = new Date();
    const trigger = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0);

    coopRoutines.forEach((routine) => {
      const isDueToday = routine.repeatType !== 'once' || routine.onceDate === today;
      if (!isDueToday) return;
      const identifier = `${routine.id}_${today}`;
      if (myCoopDoneToday.has(routine.id)) {
        Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
      } else if (trigger > now) {
        Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: 'Ortak Rutin',
            body: `${routine.name} rutinini tamamlamayı unutma! 🔥`,
          },
          trigger: { type: SchedulableTriggerInputTypes.DATE, date: trigger },
        }).catch(() => {});
      }
    });

    // Listeden düşmüş (silinmiş / ayrılınmış / çıkarılmış) rutinlerin yetim
    // bildirimlerini süpür — özellikle kickMember senaryosu buradan yakalanır.
    cancelOrphanCoopNotifications(coopRoutines.map((r) => r.id)).catch(() => {});
  }, [user, coopLoading, coopRoutines, myCoopDoneToday]);

  // Geçmiş gün: aksiyon sheet açılmaz (düzenleme/silme devre dışı)
  const openActionModal = (habit: Habit) => {
    if (dayStatus === 'past') return;
    setActionHabit(habit);
  };
  const closeActionModal = () => setActionHabit(null);
  const openCoopActionModal = (routine: CoopRoutine) => {
    if (dayStatus === 'past') return;
    setActionCoopRoutine(routine);
  };
  const closeCoopActionModal = () => setActionCoopRoutine(null);

  // ── Solo habit silme ─────────────────────────────────────────────
  const deleteHabit = (habit: Habit) => {
    if (!user) return;
    Alert.alert('Rutini Sil', 'Bu rutini silmek istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          try {
            const completionsSnap = await getDocs(
              query(collection(db, 'users', user.uid, 'completions'), where('habitId', '==', habit.id))
            );
            await Promise.all(completionsSnap.docs.map((d) => deleteDoc(d.ref)));
            await deleteDoc(doc(db, 'users', user.uid, 'habits', habit.id));
          } catch {
            Alert.alert('Hata', 'Rutin silinirken bir sorun oluştu.');
          }
        },
      },
    ]);
  };

  // ── Normal üye ayrılma (U4) ──────────────────────────────────────
  const leaveCoopRoutine = (routine: CoopRoutine) => {
    if (!user) return;
    Alert.alert(
      'Rutinden Ayrıl',
      'Bu rutinden ayrılmak istediğine emin misin? Geçmiş ilerlemen silinmeyecek ama artık bu rutini görmeyeceksin.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Ayrıl',
          style: 'destructive',
          onPress: async () => {
            try {
              // U4: affectedKeys = ['participantIds', 'memberUntil'] — sadece bu iki alan
              await updateDoc(doc(db, 'coopRoutines', routine.id), {
                participantIds: arrayRemove(user.uid),
                [`memberUntil.${user.uid}`]: getLocalDateString(),
              });
              cancelCoopRoutineNotifications(routine.id).catch(() => {});
            } catch (error: any) {
              console.error('[leaveCoopRoutine]', error?.code, error?.message);
              Alert.alert('Hata', 'Rutinden ayrılırken bir sorun oluştu.');
            }
          },
        },
      ]
    );
  };

  // ── Coop rutin silme ─────────────────────────────────────────────
  const deleteCoopRoutine = (routine: CoopRoutine) => {
    if (!user) return;
    Alert.alert('Ortak Rutini Sil', 'Bu ortak rutini ve tüm tamamlanma kayıtlarını silmek istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          try {
            const completionsSnap = await getDocs(
              query(collection(db, 'coopCompletions'), where('routineId', '==', routine.id))
            );
            await Promise.all(completionsSnap.docs.map((d) => deleteDoc(d.ref)));
            await deleteDoc(doc(db, 'coopRoutines', routine.id));
            cancelCoopRoutineNotifications(routine.id).catch(() => {});
          } catch (error: any) {
            console.error('[deleteCoopRoutine]', error?.code, error?.message, error);
            Alert.alert('Hata', 'Ortak rutin silinirken bir sorun oluştu.');
          }
        },
      },
    ]);
  };

  // ── Solo habit tamamla/geri al ───────────────────────────────────
  const toggleHabit = async (habit: Habit) => {
    if (!user || dayStatus !== 'today') return;
    const habitRef = doc(db, 'users', user.uid, 'habits', habit.id);
    const today = getLocalDateString();
    const completionRef = doc(db, 'users', user.uid, 'completions', `${today}_${habit.id}`);

    if (isCompletedToday(habit.completedDate)) {
      Alert.alert('Emin misin?', 'Bu alışkanlığı tamamlanmadı olarak işaretlemek istiyor musun?', [
        { text: 'Hayır', style: 'cancel' },
        {
          text: 'Evet', style: 'destructive',
          onPress: () => {
            const batch = writeBatch(db);
            batch.update(habitRef, { completedDate: null });
            batch.delete(completionRef);
            batch.commit().catch((e: any) => {
              Alert.alert('Hata', 'Rutin kaydedilemedi. İnternet bağlantını kontrol et.');
              console.error('Firestore hatası:', e.message);
            });
          },
        },
      ]);
    } else {
      const batch = writeBatch(db);
      batch.update(habitRef, { completedDate: today });
      batch.set(completionRef, {
        habitId: habit.id,
        habitName: habit.name,
        habitIcon: getAutoEmoji(habit.name),
        date: today,
        reminderTime: habit.reminderTime ?? null,
        completedAt: new Date().toISOString(),
      });
      batch.commit().catch((e: any) => {
        Alert.alert('Hata', 'Rutin kaydedilemedi. İnternet bağlantını kontrol et.');
        console.error('Firestore hatası:', e.message);
      });
    }
  };

  // ── Coop rutin tamamla/geri al ───────────────────────────────────
  const toggleCoopHabit = (routine: CoopRoutine) => {
    if (!user || dayStatus !== 'today') return;
    const today = getLocalDateString();
    const completionId = `${today}_${routine.id}_${user.uid}`;
    const ref = doc(db, 'coopCompletions', completionId);

    if (myCoopDoneToday.has(routine.id)) {
      Alert.alert('Emin misin?', 'Ortak rutini tamamlanmadı olarak işaretlemek istiyor musun?', [
        { text: 'Hayır', style: 'cancel' },
        {
          text: 'Evet', style: 'destructive',
          onPress: () => deleteDoc(ref).catch(() => {}),
        },
      ]);
    } else {
      setDoc(ref, {
        routineId: routine.id,
        participantIds: routine.participantIds,
        completedBy: user.uid,
        date: today,
        completedAt: serverTimestamp(),
      }).catch((e: any) => {
        Alert.alert('Hata', 'Rutin kaydedilemedi. İnternet bağlantını kontrol et.');
        console.error('[CoopCompletion] hatası:', e.message);
      });
      Notifications.cancelScheduledNotificationAsync(`${routine.id}_${today}`).catch(() => {});
    }
  };

  // ── Kart render: tekli ───────────────────────────────────────────
  const renderSoloItem = (item: Habit, index: number) => {
    const completed = item.completedDate === selectedDate;
    const emoji = getAutoEmoji(item.name);
    const tone = CARD_TONES[index % CARD_TONES.length];

    return (
      <View key={`solo_${item.id}`} style={styles.tlRow}>
        <Text style={styles.tlTime}>{item.reminderTime ?? '—'}</Text>
        <View style={styles.tlLineCol}>
          <View style={[styles.tlLineSegment, index === 0 && styles.tlLineTransparent]} />
          <View style={[styles.tlDot, { backgroundColor: tone }]} />
          <View style={styles.tlLineSegment} />
        </View>
        <TouchableOpacity
          style={[styles.tlCard, { borderLeftColor: tone }]}
          onPress={() => openActionModal(item)}
          activeOpacity={0.85}
        >
          <Text style={styles.tlIconEmoji}>{emoji}</Text>
          <View style={styles.tlCardContent}>
            <Text style={styles.tlHabitName} numberOfLines={1}>{item.name}</Text>
            {formatRepeatDays(item.repeatDays) ? (
              <Text style={styles.tlRepeatDays}>{formatRepeatDays(item.repeatDays)}</Text>
            ) : null}
          </View>
          <CheckButton
            completed={completed}
            onComplete={() => toggleHabit(item)}
            onUndo={() => toggleHabit(item)}
            disabled={dayStatus !== 'today'}
          />
        </TouchableOpacity>
      </View>
    );
  };

  // ── Kart render: ortak ───────────────────────────────────────────
  const renderCoopItem = (item: CoopRoutine, index: number) => {
    const isIndividual = item.status === 'individual';
    const isLone = !isIndividual &&
      item.status === 'active' &&
      item.participantIds.length === 1 &&
      item.participantIds[0] === user?.uid;

    const completed = myCoopDoneSelected.has(item.id);
    const emoji = getAutoEmoji(item.name);
    const tone = CARD_TONES[index % CARD_TONES.length];
    const repeatLabel = formatRepeatDays(item.repeatDays);

    const otherUids = getActivePartnerUidsForDate(item, selectedDate, user?.uid ?? '');
    const completedSet = rawCompletions.get(item.id)?.get(selectedDate) ?? new Set<string>();

    const streak = streaks.get(item.id) ?? 0;
    const showStreak = !isIndividual && streak > 0 && toStreakRepeatType(item.repeatType, item.repeatDays) !== 'once';

    return (
      <View key={`coop_${item.id}`} style={styles.tlRow}>
        <Text style={styles.tlTime}>{item.reminderTime ?? '—'}</Text>
        <View style={styles.tlLineCol}>
          <View style={[styles.tlLineSegment, index === 0 && styles.tlLineTransparent]} />
          <View style={[styles.tlDot, { backgroundColor: tone }]} />
          <View style={styles.tlLineSegment} />
        </View>
        <TouchableOpacity
          style={[styles.tlCard, { borderLeftColor: tone }]}
          onPress={() => openCoopActionModal(item)}
          activeOpacity={0.85}
        >
          <View style={styles.tlIconWrapper}>
            <Text style={styles.tlIconEmoji}>{emoji}</Text>
            {!isIndividual && (
              <View style={styles.coopBadge}>
                <Ionicons name="people-outline" size={14} color="#FFFFFF" />
              </View>
            )}
          </View>
          <View style={styles.tlCardContent}>
            <Text style={styles.tlHabitName} numberOfLines={1}>{item.name}</Text>
            {repeatLabel ? <Text style={styles.tlRepeatDays}>{repeatLabel}</Text> : null}
            {!isIndividual && !isLone && otherUids.map((uid) => {
              const done = completedSet.has(uid);
              return (
                <Text key={uid} style={[styles.partnerStatus, done && styles.partnerStatusDone]} numberOfLines={1}>
                  {partnerNames[uid] ?? '…'}: {done ? 'tamamladı' : 'bekliyor'}
                </Text>
              );
            })}
            {isLone && (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); setLoneMemberRoutine({ id: item.id, name: item.name }); }}
                activeOpacity={0.8}
                hitSlop={4}
              >
                <Text style={styles.loneBadge}>⚠️ Yalnız kaldın</Text>
              </TouchableOpacity>
            )}
            {showStreak ? (
              <Text style={styles.coopStreakText}>🔥{streak}</Text>
            ) : null}
          </View>
          <CheckButton
            completed={completed}
            onComplete={() => toggleCoopHabit(item)}
            onUndo={() => toggleCoopHabit(item)}
            disabled={dayStatus !== 'today'}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderItem = ({ item, index }: { item: TimelineItem; index: number }) => {
    if (item.kind === 'solo') return renderSoloItem(item.data, index);
    return renderCoopItem(item.data, index);
  };

  // ── İçerik: aktif sekmeye göre ───────────────────────────────────
  const renderContent = () => {
    if (activeTab === 'calendar') return <CalendarScreen />;
    if (activeTab === 'friends') return <FriendsScreen navBarInset={insets.bottom + navBarHeight + 8} />;
    if (activeTab === 'stats') return (
      <CreateRoutineScreen
        onSaved={() => { setEditHabit(null); setEditCoopRoutine(null); setActiveTab('home'); }}
        editHabit={editHabit ?? undefined}
        editCoopRoutine={editCoopRoutine ?? undefined}
      />
    );
    if (activeTab === 'profile') return <SettingsScreen />;
    if (activeTab !== 'home') return null;

    if (loading) return <ActivityIndicator style={styles.loader} color="#561C24" size="large" />;

    const soloItems: TimelineItem[] = habits
      .filter((h) => isActiveOnDate(h.repeatType, h.repeatDays, h.onceDate, selectedDate, h.startDate))
      .map((h) => ({ kind: 'solo', data: h }));

    const coopItems: TimelineItem[] = coopRoutines
      .filter((r) => (r.status as string | undefined) !== 'pending')
      .filter((r) => isActiveOnDate(r.repeatType, r.repeatDays, r.onceDate, selectedDate, r.startDate))
      .map((r) => ({ kind: 'coop', data: r }));

    const timelineItems = sortItems([...soloItems, ...coopItems]);

    if (timelineItems.length === 0) {
      return (
        <View style={{ flex: 1 }} {...panResponder.panHandlers}>
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>
              {dayStatus === 'today' ? 'Günlük rutinini oluştur' : 'Bu tarih için rutin yok'}
            </Text>
            {dayStatus === 'today' && (
              <Text style={styles.emptySubtitle}>Sağ alttaki + butonuna dokunarak başlayabilirsin 🌱</Text>
            )}
          </View>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <FlatList
          data={timelineItems}
          keyExtractor={(item) => item.kind === 'solo' ? item.data.id : `coop_${item.data.id}`}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: 60 + insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  };

  // ── Ana render ───────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {activeTab === 'home' && (
        <>
          <View style={[styles.headerGradient, { paddingTop: insets.top + 16 }]}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.greeting}>{getGreeting()}</Text>
                <Text style={styles.dateText}>{getTurkishDate()}</Text>
              </View>
              <InvitesButton />
            </View>
          </View>

          <View style={styles.weekCard}>
            <View style={styles.weekNavRow}>
              <TouchableOpacity
                style={styles.weekNavBtn}
                onPress={() => setSelectedDate((prev) => {
                  const d = new Date(prev + 'T12:00:00');
                  d.setDate(d.getDate() - 7);
                  return getLocalDateString(d);
                })}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={18} color="#8B8398" />
              </TouchableOpacity>

              <View style={styles.weekRow}>
                {getWeekForDate(selectedDate).map(({ label, dayNum, dateStr: ds, isToday, isSelected }) => (
                  <TouchableOpacity
                    key={ds}
                    style={styles.weekDayCol}
                    onPress={() => setSelectedDate(ds)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.weekDayLabel}>{label}</Text>
                    <View style={[
                      styles.weekDayCircle,
                      isToday && styles.weekDayCircleToday,
                      isSelected && !isToday && styles.weekDayCircleSelected,
                    ]}>
                      <Text style={[
                        styles.weekDayNum,
                        isToday && styles.weekDayNumToday,
                        isSelected && !isToday && styles.weekDayNumSelected,
                      ]}>
                        {dayNum}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.weekNavBtn}
                onPress={() => setSelectedDate((prev) => {
                  const d = new Date(prev + 'T12:00:00');
                  d.setDate(d.getDate() + 7);
                  return getLocalDateString(d);
                })}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-forward" size={18} color="#8B8398" />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {activeTab === 'calendar' && (
        <View style={{ height: insets.top + 16 }} />
      )}

      <View style={styles.contentArea}>
        {renderContent()}
      </View>

      <View
        style={[styles.bottomNav, { bottom: insets.bottom + 8 }]}
        onLayout={(e) => setNavBarHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabItem}
                onPress={() => {
                  setEditHabit(null);
                  setEditCoopRoutine(null);
                  setActiveTab(tab.key);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name={tab.icon} size={24} color={isActive ? '#561C24' : '#8B8398'} />
                <Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : styles.tabLabelInactive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => { setEditHabit(null); setEditCoopRoutine(null); setActiveTab('stats'); }}
          activeOpacity={0.85}
        >
          <View style={styles.plusIcon}>
            <View style={styles.plusH} />
            <View style={styles.plusV} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Ortak rutin aksiyon modalı */}
      <Modal
        visible={actionCoopRoutine !== null}
        transparent
        animationType="slide"
        onRequestClose={closeCoopActionModal}
      >
        <View style={styles.modalContainer}>
          <TouchableWithoutFeedback onPress={closeCoopActionModal}>
            <View style={styles.modalOverlay} />
          </TouchableWithoutFeedback>
          <View style={[styles.actionSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <View style={[styles.actionIconBox, { backgroundColor: '#561C24' }]}>
              <Text style={styles.actionIconEmoji}>
                {actionCoopRoutine ? getAutoEmoji(actionCoopRoutine.name) : '⭐'}
              </Text>
            </View>
            <Text style={styles.actionHabitName}>{actionCoopRoutine?.name}</Text>
            {actionCoopRoutine?.status !== 'individual' && (
              <Text style={styles.actionCoopLabel}>Ortak Rutin</Text>
            )}
            <View style={styles.actionGap} />
            {actionCoopRoutine?.status === 'individual' ? (
              <>
                <TouchableOpacity
                  style={styles.actionEditBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    closeCoopActionModal();
                    setEditCoopRoutine(actionCoopRoutine);
                    setActiveTab('stats');
                  }}
                >
                  <Ionicons name="pencil-outline" size={18} color="#561C24" />
                  <Text style={styles.actionEditBtnText}>Düzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionDeleteBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    closeCoopActionModal();
                    setTimeout(() => actionCoopRoutine && deleteCoopRoutine(actionCoopRoutine), 200);
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#D98A8A" />
                  <Text style={styles.actionDeleteBtnText}>Sil</Text>
                </TouchableOpacity>
              </>
            ) : actionCoopRoutine && getRoutineOwnerId(actionCoopRoutine) === user?.uid ? (
              <>
                <TouchableOpacity
                  style={styles.actionEditBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    closeCoopActionModal();
                    setEditCoopRoutine(actionCoopRoutine);
                    setActiveTab('stats');
                  }}
                >
                  <Ionicons name="pencil-outline" size={18} color="#561C24" />
                  <Text style={styles.actionEditBtnText}>Düzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionEditBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    closeCoopActionModal();
                    setTimeout(() => setManageMembersRoutineId(actionCoopRoutine?.id ?? null), 200);
                  }}
                >
                  <Ionicons name="people-outline" size={18} color="#561C24" />
                  <Text style={styles.actionEditBtnText}>Üyeleri Yönet</Text>
                </TouchableOpacity>
                {actionCoopRoutine.participantIds.length >= 2 && (
                  <TouchableOpacity
                    style={styles.actionEditBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      closeCoopActionModal();
                      setTimeout(() => setTransferRoutine(actionCoopRoutine), 200);
                    }}
                  >
                    <Ionicons name="swap-horizontal-outline" size={18} color="#561C24" />
                    <Text style={styles.actionEditBtnText}>Sahipliği Devret ve Ayrıl</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.actionDeleteBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    closeCoopActionModal();
                    setTimeout(() => actionCoopRoutine && deleteCoopRoutine(actionCoopRoutine), 200);
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#D98A8A" />
                  <Text style={styles.actionDeleteBtnText}>Sil</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.actionDeleteBtn}
                activeOpacity={0.8}
                onPress={() => {
                  closeCoopActionModal();
                  setTimeout(() => actionCoopRoutine && leaveCoopRoutine(actionCoopRoutine), 200);
                }}
              >
                <Ionicons name="exit-outline" size={18} color="#D98A8A" />
                <Text style={styles.actionDeleteBtnText}>Rutinden Ayrıl</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={closeCoopActionModal} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Tekli rutin aksiyon modalı */}
      <Modal
        visible={actionHabit !== null}
        transparent
        animationType="slide"
        onRequestClose={closeActionModal}
      >
        <View style={styles.modalContainer}>
          <TouchableWithoutFeedback onPress={closeActionModal}>
            <View style={styles.modalOverlay} />
          </TouchableWithoutFeedback>
          <View style={[styles.actionSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.actionIconBox}>
              <Text style={styles.actionIconEmoji}>
                {actionHabit ? getAutoEmoji(actionHabit.name) : '⭐'}
              </Text>
            </View>
            <Text style={styles.actionHabitName}>{actionHabit?.name}</Text>
            <View style={styles.actionGap} />
            <TouchableOpacity
              style={styles.actionEditBtn}
              activeOpacity={0.8}
              onPress={() => {
                closeActionModal();
                setEditHabit(actionHabit);
                setActiveTab('stats');
              }}
            >
              <Ionicons name="pencil-outline" size={18} color="#561C24" />
              <Text style={styles.actionEditBtnText}>Düzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionDeleteBtn}
              activeOpacity={0.8}
              onPress={() => {
                closeActionModal();
                setTimeout(() => actionHabit && deleteHabit(actionHabit), 200);
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#D98A8A" />
              <Text style={styles.actionDeleteBtnText}>Sil</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={closeActionModal} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <InvitesModal />

      <ManageMembersScreen
        visible={manageMembersRoutine !== null}
        onClose={() => setManageMembersRoutineId(null)}
        routine={manageMembersRoutine}
        partnerNames={partnerNames}
      />

      <TransferOwnershipScreen
        visible={transferRoutine !== null}
        onClose={() => setTransferRoutine(null)}
        routine={transferRoutine}
        partnerNames={partnerNames}
      />

      <LoneMemberModal
        visible={loneMemberRoutine !== null && manageMembersRoutine === null}
        onClose={() => setLoneMemberRoutine(null)}
        routine={loneMemberRoutine}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FEFCFA' },

  headerGradient: { paddingHorizontal: 24, paddingBottom: 22 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting:  { fontSize: 28, fontWeight: '800', color: '#361C17', letterSpacing: -0.3 },

  dateText:  { fontSize: 13, color: '#8B8398', fontWeight: '500', marginTop: 3 },

  weekCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  weekNavRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  weekNavBtn: { width: 28, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  weekDayCol: { flex: 1, alignItems: 'center', gap: 6 },
  weekDayLabel: { fontSize: 11, fontWeight: '600', color: '#8B8398' },
  weekDayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  weekDayCircleToday:    { backgroundColor: '#561C24' },
  weekDayCircleSelected: { backgroundColor: '#D5C6C8' },
  weekDayNum:         { fontSize: 13, fontWeight: '600', color: '#361C17' },
  weekDayNumToday:    { color: '#FFFFFF', fontWeight: '700' },
  weekDayNumSelected: { color: '#361C17', fontWeight: '700' },

  contentArea: { flex: 1 },
  loader: { flex: 1 },
  listContent: { paddingTop: 16 },

  // Timeline
  tlRow: { flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 20, paddingBottom: 10 },
  tlTime: { width: 45, textAlign: 'right', fontSize: 13, fontWeight: '700', color: '#561C24', alignSelf: 'center', marginRight: 10 },
  tlLineCol: { width: 16, alignItems: 'center', marginRight: 12 },
  tlLineSegment: { flex: 1, width: 2, backgroundColor: '#E6DDDE', minHeight: 10 },
  tlLineTransparent: { backgroundColor: 'transparent' },
  tlDot: { width: 8, height: 8, borderRadius: 4 },
  tlCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    gap: 10,
    shadowColor: '#561C24',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#561C24',
  },
  tlIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Coop badge — absolute positioned over icon
  tlIconEmoji: { fontSize: 26 },
  tlIconWrapper: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  coopBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#561C24',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FEFCFA',
  },
  tlCardContent: { flex: 1 },
  tlHabitName: { fontSize: 14, fontWeight: '700', color: '#361C17' },
  tlRepeatDays: { fontSize: 12, color: '#8B8398', marginTop: 2 },
  partnerStatus: { fontSize: 11, color: '#8B8398', marginTop: 2 },
  partnerStatusDone: { color: '#561C24' },
  coopStreakText: { fontSize: 11, fontWeight: '700', color: '#561C24', marginTop: 2 },
  loneBadge: { fontSize: 11, fontWeight: '700', color: '#C47B00', marginTop: 2 },

  // Aksiyon sheet
  actionSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: 'center',
  },
  actionIconEmoji: { fontSize: 26 },
  actionIconBox: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#561C24',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8, marginBottom: 12,
  },
  actionHabitName: { fontSize: 20, fontWeight: '700', color: '#361C17', textAlign: 'center', marginBottom: 4 },
  actionCoopLabel: { fontSize: 12, fontWeight: '600', color: '#561C24', letterSpacing: 0.4, marginBottom: 2 },
  actionGap: { height: 24 },
  actionEditBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', borderWidth: 1.5, borderColor: '#561C24', borderRadius: 14,
    paddingVertical: 14, marginBottom: 10,
  },
  actionEditBtnText: { fontSize: 15, fontWeight: '600', color: '#561C24' },
  actionDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', borderWidth: 1.5, borderColor: '#D98A8A', borderRadius: 14,
    paddingVertical: 14, marginBottom: 4,
  },
  actionDeleteBtnText: { fontSize: 15, fontWeight: '600', color: '#D98A8A' },

  // Boş durum
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 },
  emptyTitle:    { fontSize: 17, fontWeight: '700', color: '#361C17', textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#8B8398', textAlign: 'center', lineHeight: 20 },

  bottomNav: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 100,
    elevation: 10,
  },
  tabBar: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    height: 60, backgroundColor: '#FFFFFF',
    borderRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 60 },
  tabLabel: { fontSize: 10, fontWeight: '600', marginTop: 3 },
  tabLabelActive:   { color: '#561C24' },
  tabLabelInactive: { color: '#8B8398' },
  createBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#561C24',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#561C24',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  plusIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  plusH: { position: 'absolute', width: 22, height: 3.5, borderRadius: 2, backgroundColor: '#FFFFFF' },
  plusV: { position: 'absolute', width: 3.5, height: 22, borderRadius: 2, backgroundColor: '#FFFFFF' },

  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalOverlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 20 },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelBtnText: { fontSize: 15, fontWeight: '500', color: '#8B8398' },
});
