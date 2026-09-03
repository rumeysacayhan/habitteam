// Yerel saate göre YYYY-MM-DD formatında tarih üretir.
// toISOString() UTC tabanlıdır; UTC+3 gibi pozitif offset'lerde gece yarısı
// civarında bir önceki günü döndürebilir. Bu fonksiyon bu hatadan muaftır.
export function getLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
