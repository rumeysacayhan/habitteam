export function getAutoEmoji(name: string): string {
  const lower = name.toLocaleLowerCase('tr-TR');
  const has = (kw: string) => lower.includes(kw);

  // Kelime sınırı kontrolü: "su", "ye", "yat", "topla", "iş" gibi kısa kökler
  // başka kelimelerin içinde eşleşmesin diye boşluk/başlangıç/bitiş tabanlı kontrol.
  const hasWord = (kw: string) =>
    lower === kw ||
    lower.startsWith(kw + ' ') ||
    lower.endsWith(' ' + kw) ||
    lower.includes(' ' + kw + ' ');

  // Nefes: spor kuralından önce — "nefes egzersizi" hatalı 🏋️ vermemesi için
  if (has('nefes'))                                                             return '🧘';

  if (has('yüzme'))                                                             return '🏊';
  if (has('ağırlık') || has('halter') || has('kas') || has('güç antrenman'))    return '🏋️';
  if (has('bisiklet') || has('pedal') || has('cycling'))                        return '🚴';
  if (has('pilates') || has('esneme') || has('stretching') || has('core'))      return '🤸';
  if (has('yürüyüş') || has('yürü') || has('adım'))                            return '🚶';
  if (has('koşu') || has('koş') || has('sprint') || has('maraton'))             return '🏃';
  if (has('spor') || has('egzersiz') || has('antrenman') || has('gym') || has('fitness')) return '🏋️';

  if (has('yoga'))                                                               return '🧘‍♀️';
  if (has('dua') || has('namaz') || has('ibadet'))                              return '🙏';
  if (has('meditasyon') || has('huzur') || has('sakin') || has('mindful'))      return '🧘';

  if (has('dil öğren') || has('ingilizce') || has('almanca') || has('fransızca') ||
      has('japonca') || has('ispanyolca') || has('language'))                   return '🗣️';

  // Okul: ödev/sınav → 📚; ders/öğren → 🎓 (iş çantasından ayrıldı)
  if (has('ödev') || has('sınav'))                                              return '📚';
  if (has('ders') || has('öğren') || has('okul'))                              return '🎓';
  if (has('kitap') || has('roman') || has('makale') || has('okuma') || has('oku')) return '📖';
  if (has('resim') || has('çizim') || has('boyama') || has('sanat'))            return '🎨';
  if (has('oyun') || has('hobi') || has('game'))                                return '🎮';
  if (has('yazılım') || has('kodla') || has('bilgisayar') || has('laptop'))     return '💻';
  if (has('çalış') || has('proje'))                                             return '💼';

  // Toplantı: temizlik kuralındaki "topla" substring'inden önce kontrol edilmeli
  if (has('toplantı') || has('ofis') || has('kariyer') || hasWord('iş'))       return '💼';

  // Bahçe/doğa: "su" kuralından önce — "bitki sulama" hatalı 💧 vermemesi için
  if (has('bitki') || has('çiçek') || has('bahçe') || has('sulama'))            return '🌱';

  // Sağlık bölümü su kuralından önce — "ilaç içmek", "sigara içmek" hatalı 💧 vermemesi için
  if (has('diş'))                                                               return '🦷';
  if (has('cilt') || has('krem') || has('losyon') || has('serum'))              return '🧴';
  if (has('sigara'))                                                            return '🚭';
  if (has('ilaç') || has('vitamin') || has('takviye') || has('eczane'))         return '💊';
  if (has('doktor') || has('muayene'))                                          return '🏥';
  // hasWord('sağlık'): "sağlıklı" (sıfat) ile karışmasın, "sağlık" (isim) yakala
  if (hasWord('sağlık'))                                                        return '❤️';
  if (has('diyet') || has('kalori') || has('protein') || has('kilo'))           return '🥗';

  // hasWord('su'): "sulama", "sunum" gibi kelimeleri dışarıda bırakır
  if (hasWord('su') || has('içmek') || has('hidrasyon'))                        return '💧';

  if (has('kahvaltı'))                                                          return '🍳';
  if (has('yemek') || has('beslen') || has('öğle') || has('akşam yemeği'))      return '🥗';
  // hasWord('ye'): "yeni", "yeterli" gibi kelimeler dışarıda kalır
  if (hasWord('ye'))                                                            return '🥗';

  // Para: uyku kuralındaki "yat" substring'inden önce — "yatırım" hatalı 😴 vermemesi için
  if (has('yatırım') || has('para') || has('bütçe') || has('tasarruf') || has('finans')) return '💰';

  if (has('uyu') || has('uyku') || has('gece') || has('yat'))                   return '😴';
  if (has('uyan') || has('sabah') || has('günaydın') || has('erken kalk'))      return '☀️';

  if (has('müzik') || has('gitar') || has('piyano') || has('enstrüman') || has('şarkı')) return '🎵';

  // hasWord('topla'): "toplantı" substring çakışmasını önler
  if (has('temizl') || has('süpür') || has('bulaşık') ||
      has('çamaşır') || hasWord('topla') || has('düzenle'))                     return '🧹';

  if (has('market') || has('alışveriş') || has('shop') || has('mağaza'))        return '🛒';

  if (has('evcil') || has('köpek') || has('kedi') || has('hayvan'))             return '🐾';

  if (has('mail') || has('email') || has('mesaj') || has('yazışma'))            return '📧';
  if (has('arkadaş') || has('buluş') || has('görüş') || has('sosyal'))         return '👥';

  if (has('günlük') || has('journal') || has('not al') || has('yaz') || has('blog')) return '✍️';
  if (has('fotoğraf') || has('kamera') || has('çek'))                           return '📷';

  const FALLBACKS = ['⭐', '✨', '🎯', '🌟', '💫'];
  const sum = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return FALLBACKS[sum % FALLBACKS.length];
}
