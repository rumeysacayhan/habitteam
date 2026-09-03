// Projenin repeatDays formatı (CreateRoutineScreen.tsx DAYS dizisiyle tutarlı):
//   Pazartesi=0, Salı=1, Çarşamba=2, Perşembe=3, Cuma=4, Cumartesi=5, Pazar=6
//
// JS Date.getDay() formatı:
//   Pazar=0, Pazartesi=1, ..., Cumartesi=6
//
// Dönüşüm: (getDay() + 6) % 7  →  proje formatına çevirir

import { getLocalDateString } from './dateHelpers';

function jsDateToProjectDay(date: Date): number {
  return (date.getDay() + 6) % 7;
}

// Bir uid'in belirtilen tarihte aktif üye olup olmadığını kontrol eder.
// memberSince kaydı yoksa fallbackStartDate'e düşülür (Faz D öncesi geriye dönük uyumluluk).
function isUidActiveOnDate(
  uid: string,
  memberSince: Record<string, string> | undefined,
  memberUntil: Record<string, string> | undefined,
  fallbackStartDate: string | undefined,
  dateStr: string,
): boolean {
  const since = memberSince?.[uid] ?? fallbackStartDate;
  if (since && since > dateStr) return false;
  const until = memberUntil?.[uid];
  return !(until && until <= dateStr);
}

/**
 * Belirtilen tarihte aktif olan partner uid'lerini döndürür.
 * participantIds ∪ memberSince keys ∪ memberUntil keys birleşimi üzerinden
 * since/until karşılaştırması yapar; excludeUid (genellikle oturum açan kullanıcı)
 * listeden çıkarılır.
 */
export function getActivePartnerUidsForDate(
  routine: {
    participantIds: string[];
    memberSince?: Record<string, string>;
    memberUntil?: Record<string, string>;
    startDate?: string;
  },
  dateStr: string,
  excludeUid: string,
): string[] {
  const allUids = new Set<string>([
    ...routine.participantIds,
    ...Object.keys(routine.memberSince ?? {}),
    ...Object.keys(routine.memberUntil ?? {}),
  ]);
  return Array.from(allUids)
    .filter((uid) => uid !== excludeUid)
    .filter((uid) =>
      isUidActiveOnDate(uid, routine.memberSince, routine.memberUntil, routine.startDate, dateStr)
    );
}

/*
 * Grup-senkron coop seri hesabı.
 *
 * Her geçerli günde "o gün aktif olan üyelerin tamamı tamamladı mı?" kontrol edilir.
 * Aktif üye kümesi şu üçünün birleşiminden kurulur:
 *   - participantIds (rutinin şu anki katılımcıları)
 *   - Object.keys(memberSince)
 *   - Object.keys(memberUntil)
 *
 * Bir uid'in memberSince kaydı yoksa routineStartDate'e düşülür (Faz D öncesi
 * davet akışı gibi, memberSince yazılmamış eski dokümanlar için geriye dönük uyumluluk).
 *
 * viewerUid'in sayacı kendi effectiveMemberSince'inden önceki günlere gidemez.
 *
 * Örnek — iki üye, 3 gün art arda:
 *   participantIds = ['A', 'B']
 *   memberSince = { A: '2026-08-04', B: '2026-08-04' }
 *   completionsByDate: 08-04/05/06 → {A,B} tamamladı
 *   → A (viewer) streak = 3
 *
 * Örnek — memberSince kaydı olmayan üye (Faz D öncesi gerçek durum):
 *   participantIds = ['A', 'B']
 *   memberSince = { A: '2026-08-01' }   // B'nin kaydı yok
 *   routineStartDate = '2026-08-01'     // B için fallback
 *   08-05'te B tamamlamadıysa seri kırılır
 */
export function calculatePersonalCoopStreak(
  viewerUid: string,
  participantIds: string[],
  memberSince: Record<string, string> | undefined,
  memberUntil: Record<string, string> | undefined,
  routineStartDate: string | undefined,
  completionsByDate: Map<string, Set<string>>,
  repeatType: 'daily' | 'specificDays' | 'once',
  repeatDays: number[] | undefined,
  today: Date,
): number {
  if (repeatType === 'once') return 0;

  // Tüm uid adayları: şu anki katılımcılar + memberSince/memberUntil'de kaydı olanlar
  const allUids = new Set<string>([
    ...participantIds,
    ...Object.keys(memberSince ?? {}),
    ...Object.keys(memberUntil ?? {}),
  ]);

  const viewerMemberSince = memberSince?.[viewerUid] ?? routineStartDate;
  const todayStr = getLocalDateString(today);
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let streak = 0;
  const MAX_DAYS = 366;

  for (let i = 0; i < MAX_DAYS; i++) {
    const dateStr = getLocalDateString(cursor);

    // viewer'ın effectiveMemberSince'inden öncesi sayılmaz
    if (viewerMemberSince && dateStr < viewerMemberSince) break;

    const projectDay = jsDateToProjectDay(cursor);
    const isApplicable =
      repeatType === 'daily' ||
      (repeatDays != null && repeatDays.includes(projectDay));

    if (!isApplicable) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    // O gün aktif üyeler: effectiveMemberSince <= dateStr VE (memberUntil yok VEYA memberUntil > dateStr)
    const activeMemberUids = Array.from(allUids).filter((uid) =>
      isUidActiveOnDate(uid, memberSince, memberUntil, routineStartDate, dateStr)
    );

    const completedUids = completionsByDate.get(dateStr) ?? new Set<string>();
    const allCompleted = activeMemberUids.every((uid) => completedUids.has(uid));

    if (allCompleted) {
      streak++;
    } else if (dateStr !== todayStr) {
      break;
    }
    // Bugün henüz bitmedi, zinciri bozmaz

    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
