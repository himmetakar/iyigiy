// Kombin öneri motoru
// - Ürünler TUR sistemiyle kullanılır: her turda bir ürün en fazla 1 kombinde yer alır.
//   Mevcut turda kombin kurulamayınca bir sonraki tura geçilir (2., 3., 4. tur ...).
// - Kombinin ana parçaları (üst, alt, dış, elbise, ayakkabı) fiyata dahildir.
// - Çanta ve aksesuar "eşlik eden" önerilerdir: fiyata dahil değildir, müşteri isterse ekler.
//   Kadın kombinlerinde en az bir çanta ve bir aksesuar önerisi zorunludur.
export const COLORS = ['siyah', 'beyaz', 'ekru', 'krem', 'bej', 'camel', 'kahve', 'vizon', 'gri', 'antrasit', 'lacivert', 'haki',
  'mavi', 'açık mavi', 'yeşil', 'zeytin', 'bordo', 'kırmızı', 'pembe', 'lila', 'mor', 'sarı', 'hardal', 'turuncu', 'desenli'];
const NEUTRAL = new Set(['siyah', 'beyaz', 'ekru', 'krem', 'bej', 'camel', 'kahve', 'vizon', 'gri', 'antrasit', 'lacivert', 'haki']);
const PAIRS = [['bordo', 'hardal'], ['zeytin', 'hardal'], ['mavi', 'açık mavi'], ['pembe', 'lila'], ['yeşil', 'zeytin'], ['kırmızı', 'pembe']];
export const EXTRA_TYPES = ['canta', 'aksesuar'];

// Ana parça şablonları (fiyata dahil)
const TEMPLATES = [
  { req: ['ust', 'alt', 'ayakkabi'], opt: [['dis', .6]] },
  { req: ['ust', 'alt'], opt: [['dis', .7], ['ayakkabi', .5]] },
  { req: ['elbise', 'ayakkabi'], opt: [['dis', .5]] },
  { req: ['elbise'], opt: [['dis', .6], ['ayakkabi', .5]] }
];
const NAMES = {
  'Ofis': ['Toplantı Günü', 'Sabah Sekiz', 'Sakin Güç', 'Masa Başı Şıklığı'],
  'Klasik': ['Zamansız', 'Eski Usul', 'Ölçülü Zarafet'],
  'Günlük': ['Şehir Turu', 'Kahve Molası', 'Pazar Sabahı', 'Hafta Ortası'],
  'Sokak': ['Cadde', 'Gece Yürüyüşü', 'Rahat Ritim'],
  'Spor şık': ['Hareketli Gün', 'Hafif Adım'],
  'Minimal': ['Az ve Öz', 'Sade Çizgi', 'Tek Ton'],
  'Davet': ['Gece Daveti', 'Akşam Işığı', 'Kadeh Saati']
};
const OCC = { 'Ofis': 'Ofis', 'Klasik': 'Ofis', 'Günlük': 'Günlük', 'Sokak': 'Hafta sonu', 'Spor şık': 'Hafta sonu', 'Minimal': 'Günlük', 'Davet': 'Akşam ve davet' };
const ORDER = ['dis', 'ust', 'elbise', 'alt', 'ayakkabi', 'canta', 'aksesuar'];
const rnd = a => a[Math.floor(Math.random() * a.length)];

function colorScore(items) {
  const accents = [...new Set(items.flatMap(p => (p.colors || []).filter(c => !NEUTRAL.has(c) && c !== 'desenli')))];
  const patterns = items.filter(p => (p.colors || []).includes('desenli')).length;
  let s = 0;
  if (accents.length === 0) s += 2; else if (accents.length === 1) s += 4;
  else if (accents.length === 2 && PAIRS.some(([a, b]) => accents.includes(a) && accents.includes(b))) s += 3;
  else s -= 4 * (accents.length - 1);
  if (patterns > 1) s -= 5;
  return s;
}
function styleInfo(items) {
  const cnt = {};
  items.forEach(p => (p.styles || []).forEach(s => cnt[s] = (cnt[s] || 0) + 1));
  const common = Object.entries(cnt).filter(([, n]) => n === items.length).map(([s]) => s);
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  return { score: common.length * 3 + (best ? best[1] : 0), common, top: best ? best[0] : 'Günlük' };
}

// Yayında / öneride / onay bekleyen (arşiv hariç) kombinlerde her ürünün kaç kez kullanıldığı
export function usageMap(kombins) {
  const u = {};
  kombins.filter(k => !['arsiv', 'red'].includes(k.status)).forEach(k => [...(k.productIds || []), ...(k.extraIds || [])].forEach(id => u[id] = (u[id] || 0) + 1));
  return u;
}
// Ürünün bulunduğu tur: hiç kullanılmadıysa 1. tur, 1 kez kullanıldıysa 2. tur adayı vb.
export function currentRound(products, kombins, gender) {
  const u = usageMap(kombins);
  const pool = products.filter(p => p.active !== false && (!gender || p.gender === gender || p.gender === 'unisex'));
  if (!pool.length) return 1;
  return Math.min(...pool.map(p => u[p.id] || 0)) + 1;
}

function tryBuild(pool, gender, world, used, existing, tries) {
  const worlds = world ? [world] : [...new Set(pool.map(p => p.world))];
  const cands = [];
  for (let t = 0; t < tries; t++) {
    const w = rnd(worlds), tpl = rnd(TEMPLATES);
    const avail = ty => pool.filter(p => p.type === ty && p.world === w && !used.has(p.id));
    const core = []; let ok = true;
    for (const ty of tpl.req) { const c = avail(ty); if (!c.length) { ok = false; break; } core.push(rnd(c)); }
    if (!ok) continue;
    for (const [ty, pr] of tpl.opt) { const c = avail(ty); if (c.length && Math.random() < pr) core.push(rnd(c)); }
    // eşlik eden ürünler: aynı dünyadan, renk uyumunu en iyi koruyanlar
    const extras = [];
    for (const ty of EXTRA_TYPES) {
      const c = avail(ty).filter(p => !core.includes(p));
      if (!c.length) continue;
      const best = c.map(p => ({ p, s: colorScore([...core, ...extras, p]) + styleInfo([...core, p]).score * .5 + Math.random() })).sort((a, b) => b.s - a.s)[0];
      if (gender === 'kadin' || Math.random() < .6) extras.push(best.p);
    }
    if (gender === 'kadin' && !(extras.some(p => p.type === 'canta') && extras.some(p => p.type === 'aksesuar'))) continue;
    const sig = core.map(p => p.id).sort().join('|');
    if (existing.has(sig) || cands.some(c => c.sig === sig)) continue;
    const st = styleInfo(core);
    const score = colorScore([...core, ...extras]) + st.score + (core.some(p => p.type === 'ayakkabi') ? 2 : 0) + core.length * .5;
    cands.push({ sig, core, extras, score, st, w });
  }
  return cands.sort((a, b) => b.score - a.score);
}

/**
 * count kadar öneri üretir. Her turda bir ürün yalnızca bir kez kullanılır;
 * mevcut turda kombin kurulamazsa sonraki tura geçer.
 * Dönen her öneri: { name, occ, desc, gender, world, styles, productIds, extraIds, score, round }
 */
export function suggestKombins(products, kombins, { gender = 'kadin', world = null, count = 6, tries = 600, maxRound = 50 } = {}) {
  const usage = usageMap(kombins);
  const existing = new Set(kombins.map(k => [...(k.productIds || [])].sort().join('|')));
  const all = products.filter(p => p.active !== false && (p.gender === gender || p.gender === 'unisex'));
  const out = [];
  let round = currentRound(products, kombins, gender);
  const usedThisRun = {}; // bu çalıştırmada eklenen kullanım
  while (out.length < count && round <= maxRound) {
    const pool = all.filter(p => (usage[p.id] || 0) + (usedThisRun[p.id] || 0) < round);
    const used = new Set();
    let added = 0;
    for (const c of tryBuild(pool, gender, world, used, existing, tries)) {
      if (out.length >= count) break;
      if ([...c.core, ...c.extras].some(p => used.has(p.id))) continue;
      [...c.core, ...c.extras].forEach(p => { used.add(p.id); usedThisRun[p.id] = (usedThisRun[p.id] || 0) + 1; });
      existing.add(c.sig); added++;
      const style = c.st.common[0] || c.st.top;
      c.core.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
      out.push({
        name: rnd(NAMES[style] || NAMES['Günlük']), occ: OCC[style] || 'Günlük',
        desc: c.core.map(p => p.name.toLocaleLowerCase('tr')).join(', ').replace(/^./, s => s.toLocaleUpperCase('tr')) + '.',
        gender, world: c.w, styles: c.st.common.length ? c.st.common : [c.st.top],
        productIds: c.core.map(p => p.id), extraIds: c.extras.map(p => p.id), score: Math.round(c.score * 10) / 10, round
      });
    }
    if (!added) round++;   // bu turda kurulacak kombin kalmadı: sonraki tura geç
  }
  return out;
}
