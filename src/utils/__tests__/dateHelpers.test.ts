import { getLocalDateString } from '../dateHelpers';

describe('getLocalDateString', () => {
  it('ay ve günü 2 haneli, sıfırla doldurarak biçimlendirir', () => {
    expect(getLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05'); // 5 Ocak
  });

  it('çift haneli ay/gün için doğru biçimlendirir', () => {
    expect(getLocalDateString(new Date(2026, 11, 25))).toBe('2026-12-25'); // 25 Aralık
  });

  it('parametre verilmezse geçerli YYYY-MM-DD formatında bugünün tarihini döner', () => {
    const result = getLocalDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('UTC offset kaymasına karşı yerel tarihi kullanır (gece yarısına yakın saat)', () => {
    const almostMidnight = new Date(2026, 7, 6, 23, 59);
    expect(getLocalDateString(almostMidnight)).toBe('2026-08-06');
  });
});
