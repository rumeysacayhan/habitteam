import { calculatePersonalCoopStreak, getActivePartnerUidsForDate } from '../coopStreak';

// Tarih → uid seti eşlemesi oluşturur.
function makeCompletions(entries: [string, string[]][]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [date, uids] of entries) {
    map.set(date, new Set(uids));
  }
  return map;
}

describe('calculatePersonalCoopStreak — grup-senkron model', () => {

  it('(a) tüm üyeler art arda 3 gün tamamlamış → streak 3', () => {
    const memberSince = { A: '2026-08-04', B: '2026-08-04' };
    const completions = makeCompletions([
      ['2026-08-04', ['A', 'B']],
      ['2026-08-05', ['A', 'B']],
      ['2026-08-06', ['A', 'B']],
    ]);
    const today = new Date(2026, 7, 6);
    expect(
      calculatePersonalCoopStreak('A', ['A', 'B'], memberSince, undefined, undefined, completions, 'daily', undefined, today)
    ).toBe(3);
  });

  it('(b) bir üye bir günü atlarsa HERKESİN serisi o noktada kesilir', () => {
    const memberSince = { A: '2026-08-04', B: '2026-08-04' };
    const completions = makeCompletions([
      ['2026-08-04', ['A', 'B']],
      ['2026-08-05', ['A']],      // B eksik
      ['2026-08-06', ['A', 'B']],
    ]);
    const today = new Date(2026, 7, 6);
    expect(
      calculatePersonalCoopStreak('A', ['A', 'B'], memberSince, undefined, undefined, completions, 'daily', undefined, today)
    ).toBe(1);
  });

  it('(c) yeni katılan üye önceki geçmişi devralmaz — sayaç kendi memberSince\'inden başlar', () => {
    // A 08-01'den beri tamamlıyor, B 08-04'te katıldı.
    const memberSince = { A: '2026-08-01', B: '2026-08-04' };
    const completions = makeCompletions([
      ['2026-08-01', ['A']],
      ['2026-08-02', ['A']],
      ['2026-08-03', ['A']],
      ['2026-08-04', ['A', 'B']],
      ['2026-08-05', ['A', 'B']],
      ['2026-08-06', ['A', 'B']],
    ]);
    const today = new Date(2026, 7, 6);
    // B'nin sayacı 08-04 öncesine gidemez
    expect(
      calculatePersonalCoopStreak('B', ['A', 'B'], memberSince, undefined, undefined, completions, 'daily', undefined, today)
    ).toBe(3);
    // A ise 08-01'den itibaren sayar
    expect(
      calculatePersonalCoopStreak('A', ['A', 'B'], memberSince, undefined, undefined, completions, 'daily', undefined, today)
    ).toBe(6);
  });

  it('(d) ayrılan üye artık gerekli sayılmaz — kalanların serisi devam eder', () => {
    // B 08-04'te ayrıldı (memberUntil.B = '2026-08-04')
    // participantIds'te sadece A kaldı, ama allUids birleşimi B'yi de içerir
    const memberSince = { A: '2026-08-01', B: '2026-08-01' };
    const memberUntil = { B: '2026-08-04' };
    const completions = makeCompletions([
      ['2026-08-01', ['A', 'B']],
      ['2026-08-02', ['A', 'B']],
      ['2026-08-03', ['A', 'B']],
      ['2026-08-04', ['A']],  // B ayrıldı; sadece A tamamlıyor
      ['2026-08-05', ['A']],
      ['2026-08-06', ['A']],
    ]);
    const today = new Date(2026, 7, 6);
    expect(
      calculatePersonalCoopStreak('A', ['A'], memberSince, memberUntil, undefined, completions, 'daily', undefined, today)
    ).toBe(6);
  });

  it("(e) repeatType 'once' → her zaman 0 döner", () => {
    const memberSince = { A: '2026-08-06' };
    const completions = makeCompletions([['2026-08-06', ['A']]]);
    const today = new Date(2026, 7, 6);
    expect(
      calculatePersonalCoopStreak('A', ['A'], memberSince, undefined, undefined, completions, 'once', undefined, today)
    ).toBe(0);
  });

  it('(f) participantIds\'te var ama memberSince\'te kaydı yok — routineStartDate fallback ile seriyi etkiler', () => {
    // Faz D öncesi gerçek durum: B davetle katıldı, memberSince'e yazılmadı.
    // routineStartDate = '2026-08-01' → B de 08-01'den aktif sayılır.
    // 08-05'te B tamamlamadı → streak 1'de kesilir.
    const memberSince = { A: '2026-08-01' }; // B'nin kaydı yok
    const completions = makeCompletions([
      ['2026-08-04', ['A', 'B']],
      ['2026-08-05', ['A']],      // B eksik
      ['2026-08-06', ['A', 'B']],
    ]);
    const today = new Date(2026, 7, 6);
    expect(
      calculatePersonalCoopStreak('A', ['A', 'B'], memberSince, undefined, '2026-08-01', completions, 'daily', undefined, today)
    ).toBe(1);
  });

  it('bugün tamamlanmamışsa zincir bozulmaz, bugün sayılmaz', () => {
    const memberSince = { A: '2026-08-04', B: '2026-08-04' };
    const completions = makeCompletions([
      ['2026-08-04', ['A', 'B']],
      ['2026-08-05', ['A', 'B']],
      // 08-06 (bugün) tamamlanmadı
    ]);
    const today = new Date(2026, 7, 6);
    expect(
      calculatePersonalCoopStreak('A', ['A', 'B'], memberSince, undefined, undefined, completions, 'daily', undefined, today)
    ).toBe(2);
  });

  it('memberSince ve participantIds birbirini tamamlar — union tüm üyeleri kapsar', () => {
    // participantIds sadece A, ama memberSince'te B de var (geçmiş kayıt)
    const memberSince = { A: '2026-08-04', B: '2026-08-04' };
    const memberUntil = { B: '2026-08-05' }; // B 08-05'te ayrıldı
    const completions = makeCompletions([
      ['2026-08-04', ['A', 'B']],
      ['2026-08-05', ['A']],       // B ayrıldı, sadece A gerekli
      ['2026-08-06', ['A']],
    ]);
    const today = new Date(2026, 7, 6);
    expect(
      calculatePersonalCoopStreak('A', ['A'], memberSince, memberUntil, undefined, completions, 'daily', undefined, today)
    ).toBe(3);
  });

  it('specificDays: uygulanabilir olmayan günler atlanır, zinciri bozmaz', () => {
    // repeatDays=[0] → sadece Pazartesi. Son Pazartesi 08-03.
    const memberSince = { A: '2026-08-01', B: '2026-08-01' };
    const completions = makeCompletions([['2026-08-03', ['A', 'B']]]);
    const today = new Date(2026, 7, 6); // Çarşamba
    expect(
      calculatePersonalCoopStreak('A', ['A', 'B'], memberSince, undefined, undefined, completions, 'specificDays', [0], today)
    ).toBe(1);
  });

});

describe('getActivePartnerUidsForDate', () => {

  it('(a) sonradan katılan biri katılmadan önceki bir tarihte listelenmemeli', () => {
    // C 2026-08-28'de katıldı; 2026-08-26'ya bakılınca görünmemeli
    const routine = {
      participantIds: ['A', 'B', 'C'],
      memberSince: { A: '2026-08-26', B: '2026-08-26', C: '2026-08-28' },
      memberUntil: undefined,
      startDate: '2026-08-26',
    };
    const result = getActivePartnerUidsForDate(routine, '2026-08-26', 'A');
    expect(result).toContain('B');
    expect(result).not.toContain('C');
    expect(result).not.toContain('A'); // excludeUid dışarıda
  });

  it('(b) ayrılan biri ayrılmadan önceki bir tarihte hâlâ listelenmeli', () => {
    // B memberUntil = 2026-08-28 → 27 Ağustos'ta hâlâ aktifti
    const routine = {
      participantIds: ['A'],
      memberSince: { A: '2026-08-01', B: '2026-08-01' },
      memberUntil: { B: '2026-08-28' },
      startDate: '2026-08-01',
    };
    const onDayBefore = getActivePartnerUidsForDate(routine, '2026-08-27', 'A');
    expect(onDayBefore).toContain('B');

    // Ayrılma günü ve sonrası artık görünmemeli
    const onDayOf = getActivePartnerUidsForDate(routine, '2026-08-28', 'A');
    expect(onDayOf).not.toContain('B');
  });

  it('(c) memberSince\'i olmayan orijinal üye (legacy) her tarihte listelenmeli', () => {
    // B'nin memberSince kaydı yok; startDate fallback'i ile rutinin başından aktif sayılır
    const routine = {
      participantIds: ['A', 'B'],
      memberSince: { A: '2026-08-01' },
      memberUntil: undefined,
      startDate: '2026-08-01',
    };
    const onStart = getActivePartnerUidsForDate(routine, '2026-08-01', 'A');
    expect(onStart).toContain('B');
    const later = getActivePartnerUidsForDate(routine, '2026-08-15', 'A');
    expect(later).toContain('B');
  });

  it('memberSince ve memberUntil kayıtları olmayan tamamen eski (legacy) doküman — startDate yoksa hep aktif', () => {
    const routine = {
      participantIds: ['A', 'B'],
    };
    const result = getActivePartnerUidsForDate(routine, '2026-01-01', 'A');
    expect(result).toContain('B');
  });

});
