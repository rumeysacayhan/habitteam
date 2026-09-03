import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { getAutoEmoji } from '../utils/iconHelpers';
import { getLocalDateString } from '../utils/dateHelpers';
import { sendExpoPush } from '../utils/pushNotifications';
import InvitesButton from '../components/InvitesButton';
import FriendPicker from '../components/FriendPicker';

type EditableHabit = {
  id: string;
  name: string;
  reminderTime?: string | null;
  repeatDays?: number[];
  repeatType?: string;
  onceDate?: string;
};

type EditableCoopRoutine = {
  id: string;
  participantIds: string[];
  name: string;
  icon: string;
  reminderTime?: string | null;
  repeatDays?: number[];
  repeatType?: string;
  onceDate?: string;
};

type Props = { onSaved: () => void; editHabit?: EditableHabit; editCoopRoutine?: EditableCoopRoutine };

const SECTION_PAD = 24;
const TAB_BAR_H = 60;


const DAYS = [
  { label: 'Pzt', value: 0 },
  { label: 'Sal', value: 1 },
  { label: 'Çar', value: 2 },
  { label: 'Per', value: 3 },
  { label: 'Cum', value: 4 },
  { label: 'Cmt', value: 5 },
  { label: 'Paz', value: 6 },
];

const DAY_ACTIVE_BG   = ['#561C24', '#A9C1D1', '#D8C3A5'];
const DAY_PASSIVE_BG  = ['#E6DDDE', '#DDE6ED', '#EFE7DB'];
const DAY_PASSIVE_TEXT = ['#561C24', '#4A6C85', '#8A6D4A'];
const DAY_SHADOW_COLOR = ['#561C24', '#A9C1D1', '#D8C3A5'];

function defaultTime(): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d;
}

function timeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timeStrToDate(s: string): Date {
  const [h, m] = s.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.8}
      style={[styles.toggleTrack, value && styles.toggleTrackOn]}
    >
      <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
    </TouchableOpacity>
  );
}

export default function CreateRoutineScreen({ onSaved, editHabit, editCoopRoutine }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();


  // ── Rutin modu (sadece yeni oluşturmada gösterilir) ───────────────
  const [routineMode, setRoutineMode] = useState<'solo' | 'coop'>(
    () => editCoopRoutine ? 'coop' : 'solo'
  );

  // ── Arkadaş seçimi (coop modu için) ──────────────────────────────
  const [selectedFriendUids, setSelectedFriendUids] = useState<string[]>(() => {
    if (!editCoopRoutine) return [];
    return editCoopRoutine.participantIds.filter((u) => u !== user?.uid);
  });

  const toggleFriendSelect = (uid: string) => {
    setSelectedFriendUids((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    );
  };

  // ── Mevcut form state'i ───────────────────────────────────────────
  const [name, setName] = useState(() => editCoopRoutine?.name ?? editHabit?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [everyDay, setEveryDay] = useState(() => {
    const days = editCoopRoutine?.repeatDays ?? editHabit?.repeatDays;
    return days?.length === 7;
  });
  const [repeatDays, setRepeatDays] = useState<number[]>(() => {
    const days = editCoopRoutine?.repeatDays ?? editHabit?.repeatDays;
    if (!days || days.length === 7) return [];
    return days;
  });
  const [repeatDaysError, setRepeatDaysError] = useState('');
  const [onceMode, setOnceMode] = useState(() =>
    (editCoopRoutine?.repeatType ?? editHabit?.repeatType) === 'once'
  );
  const [onceDate, setOnceDate] = useState<Date>(() => {
    const dateStr = editCoopRoutine?.onceDate ?? editHabit?.onceDate;
    if (dateStr) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  });
  const [reminderOn, setReminderOn] = useState(() => !!(editCoopRoutine?.reminderTime ?? editHabit?.reminderTime));
  const [reminderTime, setReminderTime] = useState<Date>(() => {
    if (editCoopRoutine?.reminderTime) return timeStrToDate(editCoopRoutine.reminderTime);
    if (editHabit?.reminderTime) return timeStrToDate(editHabit.reminderTime);
    return defaultTime();
  });
  const [saving, setSaving] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);

  const autoEmoji = getAutoEmoji(name);

  const toggleEveryDay = () => {
    setOnceMode(false);
    setEveryDay((prev) => !prev);
    setRepeatDays([]);
    setRepeatDaysError('');
  };

  const toggleOnceMode = () => {
    setEveryDay(false);
    setRepeatDays([]);
    setOnceMode((prev) => !prev);
    setRepeatDaysError('');
  };

  const toggleDay = (v: number) => {
    setEveryDay(false);
    setRepeatDaysError('');
    setRepeatDays((prev) =>
      prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]
    );
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError('Rutin adı boş olamaz.'); return; }
    if (!onceMode && !everyDay && repeatDays.length === 0) { setRepeatDaysError('Lütfen tekrar sıklığı seçin.'); return; }
    if (!user) return;

    if (routineMode === 'coop' && !editHabit && !editCoopRoutine && selectedFriendUids.length === 0) {
      Alert.alert('Uyarı', 'Birlikte rutin yapacağın en az bir arkadaş seçmelisin.');
      return;
    }

    setSaving(true);
    try {
      if (editCoopRoutine) {
        // ── Ortak rutin güncelleme ────────────────────────────────
        await updateDoc(doc(db, 'coopRoutines', editCoopRoutine.id), {
          name: trimmed,
          icon: autoEmoji,
          repeatDays: onceMode ? [] : (everyDay ? [0, 1, 2, 3, 4, 5, 6] : repeatDays),
          repeatType: onceMode ? 'once' : 'weekly',
          onceDate: onceMode ? formatDateStr(onceDate) : null,
          reminderTime: reminderOn ? timeStr(reminderTime) : null,
        });
      } else if (routineMode === 'coop' && !editHabit) {
        // ── Ortak rutin oluşturma ─────────────────────────────────
        // Karşılıklı arkadaşlık kontrolü: sadece arkadaş-arkadaş çiftleri kontrol edilir
        if (selectedFriendUids.length >= 2) {
          for (let i = 0; i < selectedFriendUids.length - 1; i++) {
            for (let j = i + 1; j < selectedFriendUids.length; j++) {
              const uidA = selectedFriendUids[i];
              const uidB = selectedFriendUids[j];
              try {
                const fSnap = await getDoc(doc(db, 'friendships', [uidA, uidB].sort().join('_')));
                if (!fSnap.exists()) {
                  const [snapA, snapB] = await Promise.all([
                    getDoc(doc(db, 'users', uidA)),
                    getDoc(doc(db, 'users', uidB)),
                  ]);
                  const nameA = (snapA.data()?.displayName as string | undefined) ?? 'Bilinmeyen kullanıcı';
                  const nameB = (snapB.data()?.displayName as string | undefined) ?? 'Bilinmeyen kullanıcı';
                  Alert.alert(
                    'Arkadaşlık Gerekiyor',
                    `${nameA} ve ${nameB} birbirini arkadaş olarak eklememiş. Önce birbirlerini arkadaş olarak eklemeleri gerekiyor.`,
                  );
                  return;
                }
              } catch {
                // Arkadaşlık dokümanı okunamadı (permission) — kontrol atlanıyor
              }
            }
          }
        }
        // participantIds başlangıçta sadece creator; davetliler pendingIds'te
        const coopStartDate = getLocalDateString();
        const routineRef = await addDoc(collection(db, 'coopRoutines'), {
          creatorId: user.uid,
          ownerId: user.uid,
          memberSince: { [user.uid]: coopStartDate },
          participantIds: [user.uid],
          pendingIds: selectedFriendUids,
          declinedIds: [],
          status: 'pending',
          name: trimmed,
          icon: autoEmoji,
          repeatDays: onceMode ? [] : (everyDay ? [0, 1, 2, 3, 4, 5, 6] : repeatDays),
          repeatType: onceMode ? 'once' : 'weekly',
          onceDate: onceMode ? formatDateStr(onceDate) : null,
          reminderTime: reminderOn ? timeStr(reminderTime) : null,
          startDate: coopStartDate,
          createdAt: serverTimestamp(),
        });
        // Davetlilere push bildirimi gönder
        const creatorName = user.displayName ?? 'Biri';
        const inviteeData = (await Promise.all(
          selectedFriendUids.map(async (uid) => {
            try {
              const s = await getDoc(doc(db, 'users', uid));
              return {
                uid,
                pushToken: s.data()?.pushToken as string | undefined,
                displayName: (s.data()?.displayName as string | undefined) ?? uid,
              };
            } catch { return { uid, pushToken: undefined, displayName: uid }; }
          }),
        ));
        const tokens = inviteeData.map((d) => d.pushToken).filter(Boolean) as string[];
        if (tokens.length > 0) {
          // Birden fazla davetli varsa body'ye "X, Y ile birlikte" bilgisi eklenir
          const inviteeNames = inviteeData.map((d) => d.displayName);
          const companionText = inviteeNames.length > 1
            ? ` • ${[creatorName, ...inviteeNames].join(', ')} ile birlikte`
            : '';
          await sendExpoPush(
            tokens,
            `${creatorName} seni ortak rutine davet ediyor`,
            trimmed + companionText,
            { type: 'invite', routineId: routineRef.id },
          );
        }
      } else if (editHabit) {
        // ── Tekli rutin güncelleme ────────────────────────────────
        const newReminderTime = reminderOn ? timeStr(reminderTime) : null;
        await updateDoc(doc(db, 'users', user.uid, 'habits', editHabit.id), {
          name: trimmed,
          icon: autoEmoji,
          repeatDays: onceMode ? [] : (everyDay ? [0, 1, 2, 3, 4, 5, 6] : repeatDays),
          repeatType: onceMode ? 'once' : 'weekly',
          onceDate: onceMode ? formatDateStr(onceDate) : null,
          reminderTime: newReminderTime,
        });
        const completionsSnap = await getDocs(
          query(
            collection(db, 'users', user.uid, 'completions'),
            where('habitId', '==', editHabit.id)
          )
        );
        await Promise.all(
          completionsSnap.docs.map((d) =>
            updateDoc(d.ref, {
              habitName: trimmed,
              habitIcon: autoEmoji,
              reminderTime: newReminderTime,
            })
          )
        );
      } else {
        // ── Yeni tekli rutin oluşturma ────────────────────────────
        await addDoc(collection(db, 'users', user.uid, 'habits'), {
          name: trimmed,
          icon: autoEmoji,
          repeatDays: onceMode ? [] : (everyDay ? [0, 1, 2, 3, 4, 5, 6] : repeatDays),
          repeatType: onceMode ? 'once' : 'weekly',
          onceDate: onceMode ? formatDateStr(onceDate) : null,
          reminderTime: reminderOn ? timeStr(reminderTime) : null,
          startDate: getLocalDateString(),
          createdAt: serverTimestamp(),
          completedDate: null,
        });
      }
      onSaved();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.error('[save] Firebase hatası:', e?.code, e?.message, err);
      Alert.alert('Hata',
        editCoopRoutine
          ? 'Ortak rutin güncellenirken bir sorun oluştu, lütfen tekrar dene.'
          : editHabit
            ? 'Rutin güncellenirken bir sorun oluştu, lütfen tekrar dene.'
            : 'Rutin kaydedilirken bir sorun oluştu, lütfen tekrar dene.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: TAB_BAR_H + insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageTitleRow}>
          <Text style={styles.pageTitle}>
            {editCoopRoutine ? 'Ortak Rutini Düzenle' : editHabit ? 'Rutini Düzenle' : 'Yeni Rutin'}
          </Text>
          <InvitesButton />
        </View>

        {/* Tekli / Ortak modu — edit modunda gizlenir */}
        {!editHabit && !editCoopRoutine && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>RUTİN TÜRÜ</Text>
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, routineMode === 'solo' && styles.modeBtnActive]}
                onPress={() => setRoutineMode('solo')}
                activeOpacity={0.85}
              >
                <Text style={[styles.modeBtnText, routineMode === 'solo' && styles.modeBtnTextActive]}>
                  Tekli
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, routineMode === 'coop' && styles.modeBtnActive]}
                onPress={() => setRoutineMode('coop')}
                activeOpacity={0.85}
              >
                <Text style={[styles.modeBtnText, routineMode === 'coop' && styles.modeBtnTextActive]}>
                  Ortak
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* İsim + ikon önizleme */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RUTİNİNE BİR İSİM VER</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, nameFocused && styles.inputFocused, nameError ? styles.inputError : null]}
              value={name}
              onChangeText={(t) => { setName(t); if (nameError) setNameError(''); }}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              placeholder="Örn. Sabah koşusu"
              placeholderTextColor="#8B8398"
              maxLength={60}
              returnKeyType="done"
            />
            <View style={styles.iconPreview}>
              <Text style={styles.iconPreviewText}>{autoEmoji}</Text>
            </View>
          </View>
          {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        </View>

        {/* Arkadaş seçimi — coop modunda gösterilir */}
        {routineMode === 'coop' && !editHabit && (
          <View style={styles.section}>
            {editCoopRoutine ? (
              <>
                <Text style={styles.sectionLabel}>ORTAKLAR</Text>
                <Text style={styles.partnerHintText}>
                  Üye eklemek veya çıkarmak için, aksiyonlar menüsünden &quot;Üyeleri Yönet&quot;i seç.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>ORTAĞINI SEÇ</Text>
                <FriendPicker
                  excludeUids={[]}
                  selectedUids={selectedFriendUids}
                  onToggle={toggleFriendSelect}
                />
              </>
            )}
          </View>
        )}

        {/* Tekrar */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NE SIKLIKLA?</Text>

          <View style={styles.repeatTypeRow}>
            <TouchableOpacity
              style={[styles.everydayBtn, everyDay && styles.everydayBtnActive]}
              onPress={toggleEveryDay}
              activeOpacity={0.8}
            >
              <Text style={[styles.everydayText, everyDay && styles.everydayTextActive]}>
                Her gün
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.everydayBtn, onceMode && styles.everydayBtnActive]}
              onPress={toggleOnceMode}
              activeOpacity={0.8}
            >
              <Text style={[styles.everydayText, onceMode && styles.everydayTextActive]}>
                Sadece bir kez
              </Text>
            </TouchableOpacity>
          </View>

          {!onceMode && (
            <View style={[styles.daysRow, everyDay && styles.daysRowDisabled]}>
              {DAYS.map((day, index) => {
                const active = !everyDay && repeatDays.includes(day.value);
                const tone = index % 3;
                return (
                  <TouchableOpacity
                    key={day.value}
                    style={[
                      styles.dayBtn,
                      active
                        ? { backgroundColor: DAY_ACTIVE_BG[tone], shadowColor: DAY_SHADOW_COLOR[tone], shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.22, shadowRadius: 3, elevation: 2 }
                        : { backgroundColor: DAY_PASSIVE_BG[tone] },
                    ]}
                    onPress={() => toggleDay(day.value)}
                    activeOpacity={everyDay ? 1 : 0.7}
                    disabled={everyDay}
                  >
                    <Text style={[
                      styles.dayText,
                      active ? styles.dayTextActive : { color: DAY_PASSIVE_TEXT[tone] },
                    ]}>
                      {day.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {onceMode && (
            <DateTimePicker
              value={onceDate}
              mode="date"
              display="inline"
              minimumDate={new Date()}
              onValueChange={(_e, date) => setOnceDate(date)}
              locale="tr-TR"
              accentColor="#561C24"
            />
          )}

          {repeatDaysError ? <Text style={styles.errorText}>{repeatDaysError}</Text> : null}
        </View>

        {/* Rutin Saati */}
        <View style={styles.section}>
          <View style={styles.reminderRow}>
            <Text style={styles.sectionLabel}>RUTİN SAATİ</Text>
            <Toggle value={reminderOn} onToggle={() => setReminderOn((v) => !v)} />
          </View>
          {reminderOn && (
            <DateTimePicker
              value={reminderTime}
              mode="time"
              display="spinner"
              onValueChange={(_e, date) => setReminderTime(date)}
              locale="tr-TR"
              is24Hour={true}
            />
          )}
        </View>

        {/* Kaydet */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>{(editHabit || editCoopRoutine) ? 'Güncelle' : 'Rutini Kaydet'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FEFCFA' },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: SECTION_PAD },

  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#361C17',
    letterSpacing: -0.3,
  },

  section: {
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#561C24',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#361C17',
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#561C24',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    letterSpacing: 0,
    color: '#361C17',
    backgroundColor: '#FFFFFF',
  },
  inputFocused: { borderColor: '#561C24', borderWidth: 2 },
  inputError: { borderColor: '#D98A8A' },
  iconPreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#561C24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPreviewText: { fontSize: 22 },
  errorText: { fontSize: 13, color: '#D98A8A', marginTop: 6 },

  repeatTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },

  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F0EBEA',
    borderRadius: 14,
    padding: 4,
  },
  modeBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#561C24',
    shadowColor: '#561C24',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  modeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8B8398',
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  everydayBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F0EBEA',
  },
  everydayBtnActive: {
    backgroundColor: '#561C24',
    shadowColor: '#561C24',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  everydayText: { fontSize: 14, fontWeight: '600', color: '#8B8398' },
  everydayTextActive: { color: '#FFFFFF' },

  daysRow: { flexDirection: 'row', gap: 6 },
  daysRowDisabled: { opacity: 0.35 },
  dayBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F0EBEA',
    alignItems: 'center',
  },
  dayText: { fontSize: 11, fontWeight: '700', color: '#8B8398' },
  dayTextActive: { color: '#FFFFFF' },

  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E6DDDE',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleTrackOn: { backgroundColor: '#561C24' },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },

  partnerHintText: {
    fontSize: 12,
    color: '#8B8398',
    marginTop: 4,
  },

  saveBtn: {
    backgroundColor: '#561C24',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
