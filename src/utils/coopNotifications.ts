import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

// Coop rutin yerel bildirimleri `${routineId}_${YYYY-MM-DD}` identifier'ıyla kurulur
// (bkz. HomeScreen'deki 21:00 hatırlatma useEffect'i). Firestore doküman id'leri
// alt çizgi içermediği için identifier'ın ilk parçası her zaman routineId'dir.

const ORPHAN_CLEANUP_FLAG = 'orphaned_notifications_cleared_v1';

function routineIdOf(identifier: string): string {
  return identifier.split('_')[0];
}

/**
 * Verilen routineId için önceden zamanlanmış TÜM yerel bildirimleri iptal eder.
 * Silme/ayrılma anında bildirimin hangi tarihe kurulduğunu bilmediğimiz için
 * tüm zamanlanmış bildirimleri tarayıp prefix eşleşenleri kaldırır.
 */
export async function cancelCoopRoutineNotifications(routineId: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(`${routineId}_`))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
  } catch (e) {
    console.warn('[coopNotifications] cancelCoopRoutineNotifications hata:', e);
  }
}

/**
 * Aktif rutin id'leri dışında kalan (yetim) tüm coop bildirimlerini iptal eder.
 * Kullanıcı bir rutinden çıkarıldığında (kickMember) rutin artık useCoopRoutines
 * listesinde olmadığı için HomeScreen useEffect'i onu göremez; bu süpürme o senaryoyu
 * ve genel olarak listeden düşmüş her rutini yakalar.
 */
export async function cancelOrphanCoopNotifications(activeRoutineIds: Iterable<string>): Promise<void> {
  try {
    const active = new Set(activeRoutineIds);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => !active.has(routineIdOf(n.identifier)))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
  } catch (e) {
    console.warn('[coopNotifications] cancelOrphanCoopNotifications hata:', e);
  }
}

/**
 * Geçmişten kalmış yetim bildirimleri tek seferde temizler. Bir kez çalışır
 * (AsyncStorage flag'i), tüm zamanlanmış bildirimleri iptal eder; ardından
 * HomeScreen useEffect'i aktif rutinler için doğru bildirimleri yeniden kurar.
 */
export async function runOneTimeOrphanNotificationCleanup(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(ORPHAN_CLEANUP_FLAG);
    if (done) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.setItem(ORPHAN_CLEANUP_FLAG, '1');
  } catch (e) {
    console.warn('[coopNotifications] runOneTimeOrphanNotificationCleanup hata:', e);
  }
}
