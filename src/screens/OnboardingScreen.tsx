import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, { Extrapolate, interpolate, interpolateColor, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, Easing, SharedValue } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DecorativeBackground from '../components/DecorativeBackground';
import PressableScale from '../components/PressableScale';
import { ONBOARDING_STORAGE_KEY } from '../utils/storageKeys';

type RootStackParamList = { Onboarding: undefined; Welcome: undefined; };
type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

const TRANSITION_DURATION = 520;

// ── Palet (PROJECT_STATE.md § 4 ile birebir) ──────────────────────
const C = {
  bordo: '#561C24',
  darkText: '#361C17',
  secondaryText: '#8B8398',
  blue: '#A9C1D1',
  sand: '#D8C3A5',
  bordoBgLight: '#E6DDDE',
  bordoBgFaint: '#F0EBEA',
  bg: '#FEFCFA',
  card: '#FFFFFF',
};
const CARD_TONES = [C.bordo, C.blue, C.sand];

type Props = {
  // Ayarlar'dan "tekrar gör" ile açıldığında: bitince/atlanınca
  // AuthNavigator'a gitmek yerine bu callback çağrılır.
  onComplete?: () => void;
};

interface Slide {
  key: string;
  title: string;
  subtitle: string;
  Mock: React.ComponentType;
}

const SLIDES: Slide[] = [
  { key: 's1', title: 'Arkadaşını ekle', subtitle: 'Kodunu paylaş, o da seninkini girsin', Mock: MockAddFriend },
  { key: 's2', title: 'Rutinini oluştur', subtitle: 'İster ortak, ister bireysel — ikisi de burada', Mock: MockCreateRoutine },
  { key: 's3', title: 'Arkadaşın seni davet etti', subtitle: 'Tek dokunuşla kabul et, birlikte başlayın', Mock: MockInvite },
  { key: 's4', title: 'Artık Ana Sayfanda', subtitle: 'Bireysel ve ortak rutinler yan yana', Mock: MockHome },
];

const LAST_INDEX = SLIDES.length - 1;

export default function OnboardingScreen({ onComplete }: Props) {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const finishOnboarding = useCallback(async () => {
    try { await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true'); } catch {}
    finally {
      if (onComplete) onComplete();
      else navigation.replace('Welcome');
    }
  }, [navigation, onComplete]);

  const goNext = useCallback(() => {
    if (activeIndex >= LAST_INDEX) { finishOnboarding(); return; }
    const next = activeIndex + 1;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated useSharedValue'in standart güncelleme deseni; .value ataması render tetiklemez
    progress.value = withTiming(next, { duration: TRANSITION_DURATION, easing: Easing.inOut(Easing.cubic) });
    setActiveIndex(next);
  }, [activeIndex, finishOnboarding, progress]);

  const goPrev = useCallback(() => {
    if (activeIndex <= 0) return;
    const prev = activeIndex - 1;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated useSharedValue standart güncelleme deseni
    progress.value = withTiming(prev, { duration: TRANSITION_DURATION, easing: Easing.inOut(Easing.cubic) });
    setActiveIndex(prev);
  }, [activeIndex, progress]);

  // PanResponder bir kez oluşturulur; her zaman en güncel handler'ları çağırsın diye ref
  const goNextRef = useRef(goNext);
  const goPrevRef = useRef(goPrev);
  useEffect(() => { goNextRef.current = goNext; }, [goNext]);
  useEffect(() => { goPrevRef.current = goPrev; }, [goPrev]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 10,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -50) goNextRef.current();
        else if (gs.dx > 50) goPrevRef.current();
      },
    })
  ).current;

  return (
    <DecorativeBackground>
    <View style={[styles.container, styles.transparentBg]} {...panResponder.panHandlers}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <View style={styles.slidesArea}>
        {SLIDES.map((slide, index) => (
          <SlideView key={slide.key} index={index} slide={slide} progress={progress} />
        ))}
      </View>

      {/* Atla */}
      <PressableScale
        style={[styles.skipBtn, { top: insets.top + 14 }]}
        onPress={finishOnboarding}
        activeOpacity={0.7}
      >
        <Text style={styles.skipText}>Atla</Text>
      </PressableScale>

      {/* Dots + adım sayacı */}
      <View style={[styles.footer, { bottom: insets.bottom + 34 }]}>
        <View style={styles.dotsRow}>
          {SLIDES.map((slide, i) => (<Dot key={slide.key} index={i} activeIndex={activeIndex} />))}
        </View>
        <Text style={styles.stepCounter}>{activeIndex + 1}/{SLIDES.length}</Text>
      </View>
    </View>
    </DecorativeBackground>
  );
}

function SlideView({ index, slide, progress }: { index: number; slide: Slide; progress: SharedValue<number>; }) {
  const insets = useSafeAreaInsets();
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [index - 0.6, index, index + 0.6], [0, 1, 0], Extrapolate.CLAMP);
    const translateX = interpolate(progress.value, [index - 1, index, index + 1], [44, 0, -44], Extrapolate.CLAMP);
    return { opacity, transform: [{ translateX }] };
  });
  const { Mock } = slide;
  return (
    <Animated.View
      style={[styles.slide, { paddingTop: insets.top + 76, paddingBottom: insets.bottom + 96 }, animatedStyle]}
      pointerEvents="none"
    >
      <Text style={styles.title}>{slide.title}</Text>
      <Text style={styles.subtitle}>{slide.subtitle}</Text>
      <View style={styles.mockWrap}>
        <Mock />
      </View>
    </Animated.View>
  );
}

function Dot({ index, activeIndex }: { index: number; activeIndex: number; }) {
  // Aktif/pasif geçişi slayt kaydırma süresinden bağımsız, kısa (200ms) ve
  // hem genişlik hem renk animasyonlu.
  const t = useDerivedValue(
    () => withTiming(index === activeIndex ? 1 : 0, { duration: 200 }),
    [activeIndex, index],
  );
  const animatedStyle = useAnimatedStyle(() => ({
    width: interpolate(t.value, [0, 1], [8, 22]),
    backgroundColor: interpolateColor(t.value, [0, 1], ['#E6DDDE', '#561C24']),
  }));
  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

// ─────────────────────────────────────────────────────────────────
// STATİK MOCKUP'LAR — hiçbiri dokunulamaz, sadece örnek durum gösterir
// (CreateRoutineScreen / HomeScreen / FriendsScreen görsel dilinden taşındı)
// ─────────────────────────────────────────────────────────────────

function MockCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.mockCard}>{children}</View>;
}

function MockAddFriend() {
  return (
    <MockCard>
      <View style={styles.inviteBox}>
        <Text style={styles.inviteLabel}>DAVET KODUN</Text>
        <Text style={styles.inviteCode}>27Q3XC</Text>
        <Text style={styles.inviteExpiry}>24 saat geçerli</Text>
        <View style={styles.rowGap8}>
          <View style={styles.fillBtn}>
            <Text style={styles.fillBtnText}>Paylaş</Text>
          </View>
          <View style={styles.outlineBtn}>
            <Text style={styles.outlineBtnText}>Yeni Kod</Text>
          </View>
        </View>
      </View>
      <View style={[styles.rowGap8, { marginTop: 14 }]}>
        <View style={styles.fakeInput}>
          <Text style={styles.fakeInputPlaceholder}>Kod gir</Text>
        </View>
        <View style={styles.smallFillBtn}>
          <Text style={styles.fillBtnText}>Ekle</Text>
        </View>
      </View>
    </MockCard>
  );
}

function ModeToggle({ soloActive }: { soloActive: boolean }) {
  return (
    <View style={styles.modeToggle}>
      <View style={[styles.modeBtn, soloActive && styles.modeBtnActive]}>
        <Text style={[styles.modeBtnText, soloActive && styles.modeBtnTextActive]}>Tekli</Text>
      </View>
      <View style={[styles.modeBtn, !soloActive && styles.modeBtnActive]}>
        <Text style={[styles.modeBtnText, !soloActive && styles.modeBtnTextActive]}>Ortak</Text>
      </View>
    </View>
  );
}

// Pzt–Cmt CARD_TONES döngüsüyle seçili; Paz nötr (CreateRoutineScreen mantığı)
const MOCK_DAYS = [
  { label: 'Pzt', bg: CARD_TONES[0], on: true },
  { label: 'Sal', bg: CARD_TONES[1], on: false },
  { label: 'Çar', bg: CARD_TONES[2], on: false },
  { label: 'Per', bg: CARD_TONES[0], on: true },
  { label: 'Cum', bg: CARD_TONES[1], on: false },
  { label: 'Cmt', bg: CARD_TONES[2], on: false },
  { label: 'Paz', bg: C.bordoBgFaint, on: false },
];

function MockCreateRoutine() {
  return (
    <MockCard>
      <ModeToggle soloActive={false} />

      <View style={styles.friendPickRow}>
        <Text style={styles.friendPickCheck}>✓</Text>
        <Text style={styles.friendPickName}>Arkadaş 1</Text>
      </View>

      <View style={[styles.rowGap8, { marginTop: 10, alignItems: 'center' }]}>
        <View style={styles.fakeInput}>
          <Text style={styles.fakeInputValue}>Akşam Sporu</Text>
        </View>
        <View style={styles.emojiBadge}>
          <Text style={styles.emojiBadgeText}>🏃</Text>
        </View>
      </View>

      <Text style={styles.miniLabel}>NE SIKLIKLA?</Text>
      <View style={styles.rowGap8}>
        <View style={[styles.pill, styles.pillActive]}>
          <Text style={styles.pillTextActive}>Her gün</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Bir kez</Text>
        </View>
      </View>
      <View style={styles.daysRow}>
        {MOCK_DAYS.map((d) => (
          <View key={d.label} style={[styles.dayChip, { backgroundColor: d.bg }]}>
            <Text style={[styles.dayChipText, d.on ? styles.dayChipTextOn : styles.dayChipTextOff]}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.miniLabelInline}>RUTİN SAATİ</Text>
        <View style={styles.switchTrackOn}>
          <View style={styles.switchThumbOn} />
        </View>
        <View style={styles.timeBox}>
          <Text style={styles.timeBoxText}>19:00</Text>
        </View>
      </View>

      <View style={[styles.fillBtn, styles.blockBtn]}>
        <Text style={styles.fillBtnText}>Rutini Kaydet</Text>
      </View>
    </MockCard>
  );
}

function MockInvite() {
  return (
    <MockCard>
      <View style={styles.inviteHeader}>
        <Text style={styles.inviteHeaderTitle}>Davetler</Text>
        <Text style={styles.inviteHeaderClose}>✕</Text>
      </View>
      <Text style={styles.inviteText}>
        <Text style={styles.inviteTextBold}>Arkadaş 1</Text> seni ortak rutine davet ediyor
      </Text>
      <View style={styles.inviteRoutineRow}>
        <Text style={styles.inviteRoutineIcon}>🏃</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.inviteRoutineName}>Akşam Sporu</Text>
          <Text style={styles.inviteRoutineMeta}>Pzt, Per · 19:00</Text>
        </View>
      </View>
      <View style={[styles.rowGap8, { marginTop: 14 }]}>
        <View style={styles.outlineBtn}>
          <Text style={styles.outlineBtnText}>✕ Reddet</Text>
        </View>
        <View style={styles.fillBtn}>
          <Text style={styles.fillBtnText}>✓ Kabul Et</Text>
        </View>
      </View>
    </MockCard>
  );
}

function TimelineRow({
  time, emoji, name, repeat, tone, done, coop, partner, first,
}: {
  time: string; emoji: string; name: string; repeat: string; tone: string;
  done: boolean; coop?: boolean; partner?: string; first?: boolean;
}) {
  return (
    <View style={styles.tlRow}>
      <Text style={styles.tlTime}>{time}</Text>
      <View style={styles.tlLineCol}>
        <View style={[styles.tlLineSeg, first && styles.tlLineTransparent]} />
        <View style={[styles.tlDot, { backgroundColor: tone }]} />
        <View style={styles.tlLineSeg} />
      </View>
      <View style={[styles.tlCard, { borderLeftColor: tone }]}>
        <View style={styles.tlIconWrap}>
          <Text style={styles.tlIconEmoji}>{emoji}</Text>
          {coop && (
            <View style={styles.coopBadge}>
              <Text style={styles.coopBadgeText}>👥</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tlName}>{name}</Text>
          <Text style={styles.tlRepeat}>{repeat}</Text>
          {partner ? <Text style={styles.tlPartner}>{partner}</Text> : null}
        </View>
        <View style={[styles.checkCircle, done && styles.checkCircleDone]}>
          {done && <Text style={styles.checkMark}>✓</Text>}
        </View>
      </View>
    </View>
  );
}

function MockHome() {
  return (
    <MockCard>
      <TimelineRow
        first
        time="07:00" emoji="📖" name="Kitap Oku" repeat="Her gün"
        tone={CARD_TONES[0]} done
      />
      <TimelineRow
        time="12:30" emoji="💧" name="Su İç" repeat="Her gün"
        tone={CARD_TONES[1]} done={false}
      />
      <TimelineRow
        time="19:00" emoji="🏃" name="Akşam Sporu" repeat="Pzt, Per"
        tone={CARD_TONES[2]} done={false} coop partner="Arkadaş 1: tamamladı 🔥4"
      />
    </MockCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  // DecorativeBackground içindeyken dekoratif katman görünsün diye container
  // opak zemini örtmemeli (stil tanımı korunuyor, sadece bu ekranda geçersiz).
  transparentBg: { backgroundColor: 'transparent' },

  slidesArea: { flex: 1 },
  slide: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  title: {
    fontFamily: 'Lobster_400Regular',
    fontSize: 34,
    lineHeight: 42,
    color: C.bordo,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4A3236', // OnboardingScreen'e özel koyu-sıcak ton (genel secondaryText'e dokunma)
    textAlign: 'center',
    lineHeight: 20,
  },
  mockWrap: { width: '100%', maxWidth: 360, marginTop: 22 },

  skipBtn: { position: 'absolute', right: 22, padding: 6 },
  skipText: { fontSize: 14, color: C.secondaryText, fontWeight: '600' },

  footer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepCounter: {
    fontSize: 13,
    fontWeight: '700',
    color: C.secondaryText,
    letterSpacing: 1,
    marginTop: 10,
  },
  dot: { height: 8, borderRadius: 4 }, // width + backgroundColor Dot içinde animasyonlu

  // ── Ortak mockup parçaları ──────────────────────────────────────
  mockCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#561C24', // sıcak bordo gölge (siyah değil)
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  rowGap8: { flexDirection: 'row', gap: 8 },

  fillBtn: {
    flex: 1,
    backgroundColor: C.bordo,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallFillBtn: {
    backgroundColor: C.bordo,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fillBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  outlineBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: C.bordo,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { fontSize: 13, fontWeight: '600', color: C.bordo },
  blockBtn: { marginTop: 14, paddingVertical: 13, flexGrow: 0 }, // tek başına satır: fillBtn'in flex:1'ini iptal et

  fakeInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: C.bordo,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  fakeInputPlaceholder: { fontSize: 14, color: C.secondaryText },
  fakeInputValue: { fontSize: 14, color: C.darkText, fontWeight: '500' },

  // Slayt 1
  inviteBox: { alignItems: 'center' },
  inviteLabel: { fontSize: 11, fontWeight: '700', color: C.secondaryText, letterSpacing: 0.8, marginBottom: 6 },
  inviteCode: { fontSize: 30, fontWeight: '800', color: C.darkText, letterSpacing: 8 },
  inviteExpiry: { fontSize: 12, color: C.secondaryText, marginTop: 2, marginBottom: 14 },

  // Slayt 2
  modeToggle: { flexDirection: 'row', backgroundColor: C.bordoBgFaint, borderRadius: 14, padding: 4 },
  modeBtn: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modeBtnActive: { backgroundColor: C.bordo },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: C.secondaryText },
  modeBtnTextActive: { color: '#FFFFFF', fontWeight: '700' },

  friendPickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 10, paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: C.bordoBgFaint, borderRadius: 10,
  },
  friendPickCheck: { fontSize: 13, fontWeight: '800', color: C.bordo },
  friendPickName: { fontSize: 13, fontWeight: '600', color: C.darkText },

  emojiBadge: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.bordo, alignItems: 'center', justifyContent: 'center',
  },
  emojiBadgeText: { fontSize: 20 },

  miniLabel: { fontSize: 12, fontWeight: '700', color: C.darkText, letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  miniLabelInline: { fontSize: 12, fontWeight: '700', color: C.darkText, letterSpacing: 0.5 },

  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: C.bordoBgFaint },
  pillActive: { backgroundColor: C.bordo },
  pillText: { fontSize: 12, fontWeight: '600', color: C.secondaryText },
  pillTextActive: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  daysRow: { flexDirection: 'row', gap: 5, marginTop: 10 },
  dayChip: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  dayChipText: { fontSize: 10, fontWeight: '700' },
  dayChipTextOn: { color: '#FFFFFF' },
  dayChipTextOff: { color: C.secondaryText },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  switchTrackOn: {
    width: 40, height: 24, borderRadius: 12, backgroundColor: C.bordo,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  switchThumbOn: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', alignSelf: 'flex-end' },
  timeBox: {
    marginLeft: 'auto',
    borderWidth: 1.5, borderColor: C.bordo, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  timeBoxText: { fontSize: 14, fontWeight: '700', color: C.darkText },

  // Slayt 3
  inviteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  inviteHeaderTitle: { fontSize: 16, fontWeight: '800', color: C.darkText },
  inviteHeaderClose: { fontSize: 15, color: C.secondaryText, fontWeight: '700' },
  inviteText: { fontSize: 13, color: C.secondaryText, lineHeight: 19 },
  inviteTextBold: { fontWeight: '800', color: C.darkText },
  inviteRoutineRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.bordoBgFaint,
  },
  inviteRoutineIcon: { fontSize: 24 },
  inviteRoutineName: { fontSize: 14, fontWeight: '700', color: C.darkText },
  inviteRoutineMeta: { fontSize: 11, color: C.secondaryText, marginTop: 2 },

  // Slayt 4 — timeline (HomeScreen dilinden)
  tlRow: { flexDirection: 'row', alignItems: 'stretch', paddingBottom: 8 },
  tlTime: { width: 42, textAlign: 'right', fontSize: 12, fontWeight: '700', color: C.bordo, alignSelf: 'center', marginRight: 8 },
  tlLineCol: { width: 14, alignItems: 'center', marginRight: 10 },
  tlLineSeg: { flex: 1, width: 2, backgroundColor: C.bordoBgLight, minHeight: 8 },
  tlLineTransparent: { backgroundColor: 'transparent' },
  tlDot: { width: 8, height: 8, borderRadius: 4 },
  tlCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.card, borderRadius: 14, padding: 10,
    borderLeftWidth: 4,
    shadowColor: C.bordo, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  tlIconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  tlIconEmoji: { fontSize: 22 },
  coopBadge: {
    position: 'absolute', bottom: -4, right: -4,
    width: 18, height: 18, borderRadius: 9, backgroundColor: C.bordo,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.bg,
  },
  coopBadgeText: { fontSize: 8 },
  tlName: { fontSize: 13, fontWeight: '700', color: C.darkText },
  tlRepeat: { fontSize: 11, color: C.secondaryText, marginTop: 1 },
  tlPartner: { fontSize: 10, fontWeight: '600', color: C.bordo, marginTop: 2 },
  checkCircle: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: C.bordo,
    backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center',
  },
  checkCircleDone: { backgroundColor: C.bordo },
  checkMark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
