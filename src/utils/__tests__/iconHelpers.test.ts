import { getAutoEmoji } from '../iconHelpers';

describe('getAutoEmoji', () => {
  it('koşu için 🏃 döner', () => {
    expect(getAutoEmoji('Akşam koşusu')).toBe('🏃');
  });

  it('spor salonu için 🏋️ döner', () => {
    expect(getAutoEmoji('Spor salonu')).toBe('🏋️');
  });

  it('su içme için 💧 döner', () => {
    expect(getAutoEmoji('Su içmek')).toBe('💧');
  });

  it('kitap okuma için 📖 döner', () => {
    expect(getAutoEmoji('Kitap oku')).toBe('📖');
  });

  it('uyku için 😴 döner', () => {
    expect(getAutoEmoji('Erken yat')).toBe('😴');
  });

  it('sabah kalkma için ☀️ döner', () => {
    expect(getAutoEmoji('Sabah erken kalk')).toBe('☀️');
  });

  it('meditasyon için 🧘 döner (büyük/küçük harf duyarsız)', () => {
    expect(getAutoEmoji('MEDİTASYON YAP')).toBe('🧘');
  });

  it('temizlik için 🧹 döner', () => {
    expect(getAutoEmoji('Bulaşık yıka')).toBe('🧹');
    expect(getAutoEmoji('Ev temizliği')).toBe('🧹');
  });

  it('dil öğrenme için 🗣️ döner', () => {
    expect(getAutoEmoji('Dil öğren')).toBe('🗣️');
    expect(getAutoEmoji('İngilizce çalış')).toBe('🗣️');
  });

  it('para/bütçe için 💰 döner', () => {
    expect(getAutoEmoji('Tasarruf planı')).toBe('💰');
  });

  it('evcil hayvan için 🐾 döner', () => {
    expect(getAutoEmoji('Kedi mama ver')).toBe('🐾');
  });

  it('eşleşme bulunamazsa isim bazlı tutarlı fallback döner', () => {
    const r1 = getAutoEmoji('Rastgele bir isim xyz');
    const r2 = getAutoEmoji('Rastgele bir isim xyz');
    expect(r1).toBe(r2);
    expect(['⭐', '✨', '🎯', '🌟', '💫']).toContain(r1);
  });

  it('ödev için 📚 döner', () => {
    expect(getAutoEmoji('Matematik ödevi')).toBe('📚');
  });

  it('diş fırçalama için 🦷 döner', () => {
    expect(getAutoEmoji('Diş fırçala')).toBe('🦷');
  });

  it('sigara bırakma için 🚭 döner', () => {
    expect(getAutoEmoji('Sigara içmeme')).toBe('🚭');
  });
});

describe('getAutoEmoji — hata düzeltmeleri (substring çakışması)', () => {
  it('"toplantı" temizlik kuralındaki "topla" substring\'ine yakalanmamalı → 💼', () => {
    expect(getAutoEmoji('Toplantı')).toBe('💼');
    expect(getAutoEmoji('Haftalık toplantı')).toBe('💼');
    expect(getAutoEmoji('Toplantı öncesi hazırlık')).toBe('💼');
  });

  it('"ev topla" cleaning için 🧹, "toplantı" iş için 💼 (ikisi çakışmasın)', () => {
    expect(getAutoEmoji('Ev topla')).toBe('🧹');
    expect(getAutoEmoji('Odayı topla')).toBe('🧹');
  });

  it('"ders" okul için 🎓 olmalı, iş çantası 💼 değil', () => {
    expect(getAutoEmoji('Ders')).toBe('🎓');
    expect(getAutoEmoji('Ders çalış')).toBe('🎓');
    expect(getAutoEmoji('Matematik dersi')).toBe('🎓');
  });

  it('"öğren" okul için 🎓 olmalı', () => {
    expect(getAutoEmoji('Öğren')).toBe('🎓');
    expect(getAutoEmoji('Yeni şeyler öğren')).toBe('🎓');
  });

  it('"okul" için 🎓 döner', () => {
    expect(getAutoEmoji('Okula git')).toBe('🎓');
  });

  it('"yatırım" uyku kuralındaki "yat"\'a takılmamalı → 💰', () => {
    expect(getAutoEmoji('Yatırım yap')).toBe('💰');
    expect(getAutoEmoji('Yatırım planla')).toBe('💰');
    expect(getAutoEmoji('Para yatırımı')).toBe('💰');
  });

  it('"erken yat" uyku için 😴 döner (yat koruması geri dönmeli)', () => {
    expect(getAutoEmoji('Erken yat')).toBe('😴');
    expect(getAutoEmoji('Yat')).toBe('😴');
  });

  it('"bitki sulama" bahçe için 🌱, su 💧 değil', () => {
    expect(getAutoEmoji('Bitki sulama')).toBe('🌱');
    expect(getAutoEmoji('Sulama yap')).toBe('🌱');
  });

  it('"su iç" su için 💧 döner', () => {
    expect(getAutoEmoji('Su iç')).toBe('💧');
    expect(getAutoEmoji('Günlük su iç')).toBe('💧');
  });

  it('"yeni" veya "yeterli" içeren isimler yemek 🥗 vermemeli', () => {
    const r = getAutoEmoji('Yeni alışkanlık');
    expect(['⭐', '✨', '🎯', '🌟', '💫']).toContain(r);
  });

  it('"sağlıklı ye" yemek için 🥗 döner (ye kelime sınırı)', () => {
    expect(getAutoEmoji('Sağlıklı ye')).toBe('🥗');
    expect(getAutoEmoji('Her öğün sebze ye')).toBe('🥗');
  });

  it('"nefes egzersizi" meditasyon 🧘, spor 🏋️ değil', () => {
    expect(getAutoEmoji('Nefes egzersizi')).toBe('🧘');
    expect(getAutoEmoji('Nefes çalışması')).toBe('🧘');
  });
});

describe('getAutoEmoji — 25 örnek rutin ismi', () => {
  const cases: [string, string][] = [
    ['Toplantı',              '💼'],
    ['Ders',                  '🎓'],
    ['Ödev yap',              '📚'],
    ['Sınav hazırlığı',       '📚'],
    ['İş',                    '💼'],
    ['Proje teslimi',         '💼'],
    ['Su iç',                 '💧'],
    ['Kitap oku',             '📖'],
    ['Koşu',                  '🏃'],
    ['Yürüyüş',               '🚶'],
    ['Yoga',                  '🧘‍♀️'],
    ['Uyku düzeni',           '😴'],
    ['Meditasyon',            '🧘'],
    ['Ev temizliği',          '🧹'],
    ['Ev topla',              '🧹'],
    ['Çamaşır yıka',          '🧹'],
    ['Bulaşık yıka',          '🧹'],
    ['Market alışverişi',     '🛒'],
    ['Diyet takibi',          '🥗'],
    ['Kahvaltı yap',          '🍳'],
    ['İlaç içmek',            '💊'],
    ['Diş fırçala',           '🦷'],
    ['Cilt bakımı',           '🧴'],
    ['Müzik dinle',           '🎵'],
    ['Resim çiz',             '🎨'],
    ['Dil öğren',             '🗣️'],
    ['Evcil hayvan besle',    '🐾'],
    ['Bitki sulama',          '🌱'],
    ['Para biriktir',         '💰'],
    ['Sigara bırak',          '🚭'],
  ];

  it.each(cases)('"%s" → %s', (input, expected) => {
    expect(getAutoEmoji(input)).toBe(expected);
  });
});
