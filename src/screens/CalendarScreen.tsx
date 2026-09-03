import React, { useEffect, useMemo, useState } from 'react';
import { getLocalDateString } from '../utils/dateHelpers';
import { getActivePartnerUidsForDate } from '../utils/coopStreak';
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
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { useHabits } from '../hooks/useHabits';
import { useCoopRoutines } from '../hooks/useCoopRoutines';
import { useCoopCompletions } from '../hooks/useCoopCompletions';
import { getAutoEmoji } from '../utils/iconHelpers';
import { useFonts, Lobster_400Regular } from '@expo-google-fonts/lobster';
import InvitesButton from '../components/InvitesButton';
import ManageMembersScreen, { ManagedRoutine } from './ManageMembersScreen';
import LoneMemberModal, { LoneRoutine } from './LoneMemberModal';

type HabitDoc = {
  id: string;
  name: string;
  icon?: string;
  repeatDays?: number[];
  reminderTime?: string | null;
  repeatType?: string;
  onceDate?: string;
  startDate?: string;
};

type CoopRoutineDoc = {
  id: string;
  participantIds: string[];
  pendingIds?: string[];
  ownerId?: string;
  creatorId?: string;
  memberSince?: Record<string, string>;
  memberUntil?: Record<string, string>;
  name: string;
  icon: string;
  repeatDays?: number[];
  repeatType?: string;
  onceDate?: string;
  reminderTime?: string | null;
  status?: string;
  startDate?: string;
};

type HabitStatus = {
  habitId: string;
  habitName: string;
  habitIcon: string;
  reminderTime: string | null;
  completed: boolean;
};

type CoopDayStatus = {
  routineId: string;
  routineName: string;
  routineIcon: string;
  reminderTime: string | null;
  myCompleted: boolean;
  others: { uid: string; name: string; completed: boolean }[];
  ownerId?: string;
  status?: string;
  participantIds: string[];
};

type DayCell = {
  dayNum: number;
  dateStr: string;
  habitStatuses: HabitStatus[];
  coopDots: { routineId: string; myCompleted: boolean; status?: string; name: string }[];
  isToday: boolean;
};


const TURKISH_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const TURKISH_DAYS = [
  'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi',
];
const WEEK_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const COLOR_DONE = '#561C24';
const ICON_PENDING = '#561C24';
const STYLE_PENDING = { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#561C24' } as const;
const STYLE_DONE = { backgroundColor: COLOR_DONE } as const;

const COLOR_COOP_DONE = '#263C50';
const ICON_COOP_PENDING = '#263C50';
const STYLE_COOP_PENDING = { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#263C50' } as const;
const STYLE_COOP_DONE = { backgroundColor: COLOR_COOP_DONE } as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}


function getAppDayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const jsDay = new Date(y, m - 1, d).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function isActiveOnDate(
  item: { repeatType?: string; onceDate?: string; repeatDays?: number[]; startDate?: string },
  dateStr: string,
): boolean {
  if (item.repeatType === 'once') return item.onceDate === dateStr;
  if (item.startDate && dateStr < item.startDate) return false;
  if (!item.repeatDays || item.repeatDays.length === 0) return false;
  return item.repeatDays.includes(getAppDayIndex(dateStr));
}

function computeDayHabitStatuses(
  dateStr: string,
  habits: HabitDoc[],
  completedByDate: Record<string, Set<string>>,
): HabitStatus[] {
  const completedIds = completedByDate[dateStr] ?? new Set<string>();
  return habits
    .filter((h) => isActiveOnDate(h, dateStr))
    .map((h) => ({
      habitId: h.id,
      habitName: h.name,
      habitIcon: h.icon ?? 'checkmark-circle-outline',
      reminderTime: h.reminderTime ?? null,
      completed: completedIds.has(h.id),
    }));
}

function computeCoopStatuses(
  dateStr: string,
  coopRoutines: CoopRoutineDoc[],
  coopCompletedByDate: Record<string, Record<string, Set<string>>>,
  userUid: string,
  partnerNames: Record<string, string>,
): CoopDayStatus[] {
  return coopRoutines
    .filter((r) => isActiveOnDate(r, dateStr))
    .map((r) => {
      const completers = coopCompletedByDate[dateStr]?.[r.id] ?? new Set<string>();
      const others = getActivePartnerUidsForDate(r, dateStr, userUid).map((uid) => ({
        uid,
        name: partnerNames[uid] ?? '...',
        completed: completers.has(uid),
      }));
      return {
        routineId: r.id,
        routineName: r.name,
        routineIcon: r.icon,
        reminderTime: r.reminderTime ?? null,
        myCompleted: completers.has(userUid),
        others,
        ownerId: r.ownerId ?? r.creatorId,
        status: r.status,
        participantIds: r.participantIds,
      };
    });
}

function buildGrid(
  year: number,
  month: number,
  habits: HabitDoc[],
  completedByDate: Record<string, Set<string>>,
  coopRoutines: CoopRoutineDoc[],
  coopCompletedByDate: Record<string, Record<string, Set<string>>>,
  userUid: string,
): DayCell[][] {
  const todayStr = getLocalDateString(new Date());
  const firstDay = new Date(year, month, 1);
  const lastDayNum = new Date(year, month + 1, 0).getDate();
  let startCol = firstDay.getDay() - 1;
  if (startCol < 0) startCol = 6;

  const cells: DayCell[] = [];

  for (let i = 0; i < startCol; i++) {
    cells.push({ dayNum: 0, dateStr: '', habitStatuses: [], coopDots: [], isToday: false });
  }

  for (let d = 1; d <= lastDayNum; d++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    const coopDots = coopRoutines
      .filter((r) => isActiveOnDate(r, dateStr))
      .map((r) => ({
        routineId: r.id,
        myCompleted: (coopCompletedByDate[dateStr]?.[r.id] ?? new Set()).has(userUid),
        status: r.status,
        name: r.name,
      }));
    cells.push({
      dayNum: d,
      dateStr,
      habitStatuses: computeDayHabitStatuses(dateStr, habits, completedByDate),
      coopDots,
      isToday: dateStr === todayStr,
    });
  }

  const rows: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const slice = cells.slice(i, i + 7);
    while (slice.length < 7) {
      slice.push({ dayNum: 0, dateStr: '', habitStatuses: [], coopDots: [], isToday: false });
    }
    rows.push(slice);
  }
  return rows;
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const [fontsLoaded] = useFonts({ Lobster_400Regular });

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [completedByDate, setCompletedByDate] = useState<Record<string, Set<string>>>({});
  const [selectedDay, setSelectedDay] = useState<DayCell | null>(null);
  const [manageRoutine, setManageRoutine] = useState<ManagedRoutine | null>(null);
  const [loneMemberRoutine, setLoneMemberRoutine] = useState<LoneRoutine | null>(null);

  // ── Hooks ────────────────────────────────────────────────────────
  const { habits: rawHabits } = useHabits(user);
  const { coopRoutines: rawCoopRoutines, partnerNames } = useCoopRoutines(user);
  const coopRoutineIds = useMemo(
    () => rawCoopRoutines
      .filter((r) => (r.status as string | undefined) !== 'pending')
      .map((r) => r.id as string),
    [rawCoopRoutines],
  );
  const { completions: rawCoopCompletions } = useCoopCompletions(user, coopRoutineIds);

  const habits = useMemo<HabitDoc[]>(
    () => rawHabits.map((d) => ({ id: d.id, ...(d as unknown as Omit<HabitDoc, 'id'>) })),
    [rawHabits],
  );

  const coopRoutines = useMemo<CoopRoutineDoc[]>(
    () => rawCoopRoutines.map((d) => ({ id: d.id, ...(d as unknown as Omit<CoopRoutineDoc, 'id'>) })),
    [rawCoopRoutines],
  );

  // Pending rutinler takvimde gösterilmez; buildGrid ve computeCoopStatuses bu listeyi kullanır.
  const activeCoopRoutines = useMemo<CoopRoutineDoc[]>(
    () => coopRoutines.filter((r) => (r.status as string | undefined) !== 'pending'),
    [coopRoutines],
  );

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Solo completions listener — sadece görüntülenen aya ait belgeler çekilir.
  // year/month dependency'de: ay navigasyonu → useEffect temizlenir (unsubscribe), yeni sorguyla yeniden abone olunur.
  useEffect(() => {
    if (!user) return;
    const firstDay = `${year}-${pad(month + 1)}-01`;
    const lastDayNum = new Date(year, month + 1, 0).getDate();
    const lastDay = `${year}-${pad(month + 1)}-${pad(lastDayNum)}`;
    return onSnapshot(
      query(
        collection(db, 'users', user.uid, 'completions'),
        where('date', '>=', firstDay),
        where('date', '<=', lastDay),
      ),
      (snap) => {
        const byDate: Record<string, Set<string>> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (!data.date || !data.habitId) return;
          if (!byDate[data.date]) byDate[data.date] = new Set();
          byDate[data.date].add(data.habitId as string);
        });
        setCompletedByDate(byDate);
      },
      (error) => {
        Alert.alert('CalendarScreen Firestore Hatası', `${error.message}\n\nKod: ${error.code}`);
      },
    );
  }, [user, year, month]);

  const coopCompletedByDate = useMemo(() => {
    const byDate: Record<string, Record<string, Set<string>>> = {};
    rawCoopCompletions.forEach((data) => {
      if (!data.date || !data.routineId || !data.completedBy) return;
      if (!byDate[data.date]) byDate[data.date] = {};
      if (!byDate[data.date][data.routineId]) byDate[data.date][data.routineId] = new Set();
      byDate[data.date][data.routineId].add(data.completedBy as string);
    });
    return byDate;
  }, [rawCoopCompletions]);

  const goToPrev = () => setCurrentMonth(new Date(year, month - 1, 1));
  const goToNext = () => setCurrentMonth(new Date(year, month + 1, 1));

  const grid = buildGrid(year, month, habits, completedByDate, activeCoopRoutines, coopCompletedByDate, user?.uid ?? '');

  // ── Modal statuses ────────────────────────────────────────────────
  const modalStatuses = selectedDay
    ? computeDayHabitStatuses(selectedDay.dateStr, habits, completedByDate)
    : [];

  const coopModalStatuses = selectedDay
    ? computeCoopStatuses(selectedDay.dateStr, activeCoopRoutines, coopCompletedByDate, user?.uid ?? '', partnerNames)
    : [];

  const timedStatuses = [...modalStatuses]
    .filter((h) => !!h.reminderTime)
    .sort((a, b) => a.reminderTime!.localeCompare(b.reminderTime!));

  const untimedStatuses = modalStatuses.filter((h) => !h.reminderTime);

  const timedCoopStatuses = [...coopModalStatuses]
    .filter((c) => !!c.reminderTime)
    .sort((a, b) => a.reminderTime!.localeCompare(b.reminderTime!));

  const untimedCoopStatuses = coopModalStatuses.filter((c) => !c.reminderTime);

  const renderIndividualCoopCard = (c: CoopDayStatus) => (
    <View key={c.routineId} style={[styles.eventCard, c.myCompleted ? STYLE_DONE : STYLE_PENDING]}>
      <Text style={styles.eventIconEmoji}>{getAutoEmoji(c.routineName)}</Text>
      <Text style={[styles.eventName, { color: c.myCompleted ? '#FFFFFF' : ICON_PENDING }]} numberOfLines={1}>
        {c.routineName}
      </Text>
    </View>
  );

  const modalTitle = selectedDay
    ? (() => {
        const [y, m, d] = selectedDay.dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return `${d} ${TURKISH_MONTHS[m - 1]}, ${TURKISH_DAYS[date.getDay()]}`;
      })()
    : '';

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.monthHeader}>
          <TouchableOpacity onPress={goToPrev} hitSlop={16}>
            <Ionicons name="chevron-back-outline" size={22} color="#361C17" />
          </TouchableOpacity>
          <View style={styles.monthTitleRow}>
            <View style={styles.starCluster}>
              <Text style={styles.monthTitleStarBig}>✦</Text>
              <Text style={styles.monthTitleStarSmall}>✦</Text>
              <Text style={styles.monthTitleStarTiny}>✦</Text>
            </View>
            <Text style={[styles.monthTitle, fontsLoaded && styles.monthTitleLobster]}>
              {TURKISH_MONTHS[month]}
            </Text>
            <View style={styles.starCluster}>
              <Text style={styles.monthTitleStarBig}>✦</Text>
              <Text style={styles.monthTitleStarSmall}>✦</Text>
              <Text style={styles.monthTitleStarTiny}>✦</Text>
            </View>
          </View>
          <View style={styles.monthHeaderRight}>
            <TouchableOpacity onPress={goToNext} hitSlop={16}>
              <Ionicons name="chevron-forward-outline" size={22} color="#361C17" />
            </TouchableOpacity>
            <InvitesButton />
          </View>
        </View>

        <View style={styles.weekLabelsRow}>
          {WEEK_LABELS.map((lbl) => (
            <Text key={lbl} style={styles.weekLabel}>{lbl}</Text>
          ))}
        </View>

        {grid.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((cell, ci) => (
              <TouchableOpacity
                key={ci}
                style={styles.cell}
                activeOpacity={cell.dayNum > 0 ? 0.7 : 1}
                onPress={() => cell.dayNum > 0 && setSelectedDay(cell)}
              >
                {cell.dayNum > 0 && (
                  <>
                    <View style={[styles.dayCircle, cell.isToday && styles.dayCircleToday]}>
                      <Text style={[styles.dayNum, cell.isToday && styles.dayNumToday]}>
                        {cell.dayNum}
                      </Text>
                    </View>
                    {(cell.habitStatuses.length > 0 || cell.coopDots.length > 0) && (
                      <View style={styles.iconsRow}>
                        {cell.habitStatuses.map((h, idx) => (
                          <Text
                            key={h.habitId}
                            style={[styles.iconDotEmoji, idx > 0 && styles.iconDotSoloGap]}
                          >
                            {getAutoEmoji(h.habitName)}
                          </Text>
                        ))}
                        {cell.coopDots.map((c, idx) =>
                          c.status === 'individual' ? (
                            <Text
                              key={c.routineId}
                              style={[styles.iconDotEmoji, (idx > 0 || cell.habitStatuses.length > 0) && styles.iconDotSoloGap]}
                            >
                              {getAutoEmoji(c.name)}
                            </Text>
                          ) : (
                          <View
                            key={c.routineId}
                            style={[
                              styles.iconCoopDotOuter,
                              (idx > 0 || cell.habitStatuses.length > 0) && styles.iconDotOverlap,
                            ]}
                          >
                            <View style={[styles.iconCoopDot, c.myCompleted ? STYLE_COOP_DONE : STYLE_COOP_PENDING]}>
                              <Ionicons
                                name="people-outline"
                                size={9}
                                color={c.myCompleted ? '#FFFFFF' : ICON_COOP_PENDING}
                              />
                            </View>
                          </View>
                          )
                        )}
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={selectedDay !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDay(null)}
      >
        <View style={styles.modalContainer}>
          <TouchableWithoutFeedback onPress={() => setSelectedDay(null)}>
            <View style={styles.modalOverlay} />
          </TouchableWithoutFeedback>

          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{modalTitle}</Text>

            <ScrollView
              style={styles.timelineScroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Saatsiz öğeler */}
              {(untimedStatuses.length > 0 || untimedCoopStatuses.length > 0) && (
                <View style={styles.untimedSection}>
                  {untimedStatuses.map((h) => (
                    <View
                      key={h.habitId}
                      style={[styles.eventCard, h.completed ? STYLE_DONE : STYLE_PENDING]}
                    >
                      <Text style={styles.eventIconEmoji}>{getAutoEmoji(h.habitName)}</Text>
                      <Text
                        style={[styles.eventName, { color: h.completed ? '#FFFFFF' : ICON_PENDING }]}
                        numberOfLines={1}
                      >
                        {h.habitName}
                      </Text>
                    </View>
                  ))}
                  {untimedCoopStatuses.map((c) => {
                    const isIndividual = c.status === 'individual';
                    if (isIndividual) return renderIndividualCoopCard(c);
                    const isLone =
                      c.status === 'active' &&
                      c.participantIds.length === 1 &&
                      c.participantIds[0] === user?.uid;
                    return (
                      <View
                        key={c.routineId}
                        style={[styles.eventCard, styles.coopEventCard, c.myCompleted ? STYLE_COOP_DONE : STYLE_COOP_PENDING]}
                      >
                        {!isIndividual && (
                          <Ionicons
                            name="people-outline"
                            size={10}
                            color={c.myCompleted ? '#FFFFFF' : ICON_COOP_PENDING}
                            style={{ alignSelf: 'flex-start', marginTop: 2 }}
                          />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[styles.eventName, { color: c.myCompleted ? '#FFFFFF' : ICON_COOP_PENDING }]}
                            numberOfLines={1}
                          >
                            {c.routineName}
                          </Text>
                          {!isIndividual && !isLone && c.others.map((o) => (
                            <Text
                              key={o.uid}
                              style={[
                                styles.partnerModalStatus,
                                c.myCompleted && styles.partnerModalStatusDone,
                                !c.myCompleted && o.completed && styles.partnerModalStatusDoneLight,
                              ]}
                            >
                              {o.name}: {o.completed ? 'tamamladı' : 'bekliyor'}
                            </Text>
                          ))}
                          {isLone && (
                            <TouchableOpacity
                              onPress={() => setLoneMemberRoutine({ id: c.routineId, name: c.routineName })}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.manageLink, { color: c.myCompleted ? 'rgba(255,255,255,0.8)' : '#C47B00' }]}>
                                ⚠️ Yalnız kaldın
                              </Text>
                            </TouchableOpacity>
                          )}
                          {!isIndividual && !isLone && c.ownerId === user?.uid && (
                            <TouchableOpacity
                              onPress={() => {
                                const r = activeCoopRoutines.find((x) => x.id === c.routineId);
                                if (r) { setManageRoutine(r); setSelectedDay(null); }
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.manageLink, { color: c.myCompleted ? 'rgba(255,255,255,0.8)' : COLOR_COOP_DONE }]}>
                                Üyeleri Yönet →
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* 24 saatlik zaman çizelgesi */}
              {HOURS.map((hour) => {
                const timeKey = `${String(hour).padStart(2, '0')}:00`;
                const soloEventsThisHour = timedStatuses.filter(
                  (h) => parseInt(h.reminderTime!.split(':')[0], 10) === hour
                );
                const coopEventsThisHour = timedCoopStatuses.filter(
                  (c) => parseInt(c.reminderTime!.split(':')[0], 10) === hour
                );
                return (
                  <View key={hour} style={styles.timeRow}>
                    <Text style={styles.timeLabel}>{timeKey}</Text>
                    <View style={styles.timeContent}>
                      <View style={styles.timeDivider} />
                      {soloEventsThisHour.map((h) => (
                        <View
                          key={h.habitId}
                          style={[styles.eventCard, h.completed ? STYLE_DONE : STYLE_PENDING]}
                        >
                          <Text style={styles.eventIconEmoji}>{getAutoEmoji(h.habitName)}</Text>
                          <Text
                            style={[styles.eventName, { color: h.completed ? '#FFFFFF' : ICON_PENDING }]}
                            numberOfLines={1}
                          >
                            {h.habitName}
                          </Text>
                        </View>
                      ))}
                      {coopEventsThisHour.map((c) => {
                        const isIndividual = c.status === 'individual';
                        if (isIndividual) return renderIndividualCoopCard(c);
                        const isLone =
                          c.status === 'active' &&
                          c.participantIds.length === 1 &&
                          c.participantIds[0] === user?.uid;
                        return (
                          <View
                            key={c.routineId}
                            style={[styles.eventCard, styles.coopEventCard, c.myCompleted ? STYLE_COOP_DONE : STYLE_COOP_PENDING]}
                          >
                            {!isIndividual && (
                              <Ionicons
                                name="people-outline"
                                size={10}
                                color={c.myCompleted ? '#FFFFFF' : ICON_COOP_PENDING}
                                style={{ alignSelf: 'flex-start', marginTop: 2 }}
                              />
                            )}
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[styles.eventName, { color: c.myCompleted ? '#FFFFFF' : ICON_COOP_PENDING }]}
                                numberOfLines={1}
                              >
                                {c.routineName}
                              </Text>
                              {!isIndividual && !isLone && c.others.map((o) => (
                                <Text
                                  key={o.uid}
                                  style={[
                                    styles.partnerModalStatus,
                                    c.myCompleted && styles.partnerModalStatusDone,
                                    !c.myCompleted && o.completed && styles.partnerModalStatusDoneLight,
                                  ]}
                                >
                                  {o.name}: {o.completed ? 'tamamladı' : 'bekliyor'}
                                </Text>
                              ))}
                              {isLone && (
                                <TouchableOpacity
                                  onPress={() => setLoneMemberRoutine({ id: c.routineId, name: c.routineName })}
                                  activeOpacity={0.8}
                                >
                                  <Text style={[styles.manageLink, { color: c.myCompleted ? 'rgba(255,255,255,0.8)' : '#C47B00' }]}>
                                    ⚠️ Yalnız kaldın
                                  </Text>
                                </TouchableOpacity>
                              )}
                              {!isIndividual && !isLone && c.ownerId === user?.uid && (
                                <TouchableOpacity
                                  onPress={() => {
                                    const r = activeCoopRoutines.find((x) => x.id === c.routineId);
                                    if (r) { setManageRoutine(r); setSelectedDay(null); }
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.manageLink, { color: c.myCompleted ? 'rgba(255,255,255,0.8)' : COLOR_COOP_DONE }]}>
                                    Üyeleri Yönet →
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedDay(null)} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ManageMembersScreen
        visible={manageRoutine !== null}
        onClose={() => setManageRoutine(null)}
        routine={manageRoutine}
        partnerNames={partnerNames}
      />

      <LoneMemberModal
        visible={loneMemberRoutine !== null}
        onClose={() => setLoneMemberRoutine(null)}
        routine={loneMemberRoutine}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FEFCFA' },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },

  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  monthHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  monthTitleStar: { fontSize: 16, color: '#561C24' },
  starCluster: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  monthTitleStarBig:   { fontSize: 18, color: '#561C24', position: 'absolute', bottom: 1, left: 1 },
  monthTitleStarSmall: { fontSize: 10, color: '#561C24', position: 'absolute', top: 1, right: 1 },
  monthTitleStarTiny:  { fontSize: 9,  color: '#561C24', position: 'absolute', top: 0, left: 0 },
  monthTitle: { textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#361C17' },
  monthTitleLobster: { fontFamily: 'Lobster_400Regular', fontSize: 42, color: '#561C24' },

  weekLabelsRow: { flexDirection: 'row', marginBottom: 6 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#561C24' },

  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 4, minHeight: 54 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { backgroundColor: '#561C24' },
  dayNum: { fontSize: 13, fontWeight: '700', color: '#000000' },
  dayNumToday: { color: '#FFFFFF', fontWeight: '700' },

  iconsRow: { flexDirection: 'row', marginTop: 3, alignItems: 'center' },
  iconDotEmoji: { fontSize: 10 },
  iconDotSoloGap: { marginLeft: 1 },
  iconDotOverlap: { marginLeft: -6 },
  // Coop nokta: 18px beyaz dış halka (1px kontur) + 16px renkli iç nokta
  iconCoopDotOuter: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  iconCoopDot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(54,28,23,0.35)' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E6DDDE', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#361C17', marginBottom: 16 },

  untimedSection: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },

  timelineScroll: { flexGrow: 0, maxHeight: '70%' },
  timeRow: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 36 },
  timeLabel: { width: 44, fontSize: 11, color: '#8B8398', textAlign: 'right', paddingRight: 10, paddingTop: 2 },
  timeContent: { flex: 1, paddingBottom: 2 },
  timeDivider: { height: 1, backgroundColor: '#E6DDDE' },

  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 3,
    marginRight: 4,
    gap: 6,
    alignSelf: 'flex-start',
  },
  // Coop kartlar iki satır içerdiğinden üst hizaya geçiyor
  coopEventCard: { alignItems: 'flex-start' },

  eventIconEmoji: { fontSize: 12 },
  eventName: { fontSize: 12, fontWeight: '600', color: '#FFFFFF', maxWidth: 200 },

  // Partner durumu (salt-okunur)
  partnerModalStatus: { fontSize: 10, fontWeight: '600', color: '#263C50', marginTop: 2 },
  partnerModalStatusDone: { color: '#FFFFFF' },
  partnerModalStatusDoneLight: {},
  manageLink: { fontSize: 10, fontWeight: '700', marginTop: 4 },

  closeBtn: { marginTop: 16, paddingVertical: 12, alignItems: 'center', borderRadius: 12, backgroundColor: '#E6DDDE' },
  closeBtnText: { fontSize: 15, fontWeight: '600', color: '#561C24' },
});
