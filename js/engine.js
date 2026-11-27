// Kombin öneri motoru: aktif ürünleri renk uyumu, ortak tarz ve marka dünyasına göre birleştirir.
export const COLORS = ['siyah', 'beyaz', 'ekru', 'krem', 'bej', 'camel', 'kahve', 'vizon', 'gri', 'antrasit', 'lacivert', 'haki',
  'mavi', 'açık mavi', 'yeşil', 'zeytin', 'bordo', 'kırmızı', 'pembe', 'lila', 'mor', 'sarı', 'hardal', 'turuncu', 'desenli'];
const NEUTRAL = new Set(['siyah', 'beyaz', 'ekru', 'krem', 'bej', 'camel', 'kahve', 'vizon', 'gri', 'antrasit', 'lacivert', 'haki']);
// birlikte iyi duran renkli çiftler
const PAIRS = [['bordo', 'hardal'], ['zeytin', 'hardal'], ['mavi', 'açık mavi'], ['pembe', 'lila'], ['yeşil', 'zeytin'], ['kırmızı', 'pembe']];

const TEMPLATES = [
  { req: ['ust', 'alt', 'ayakkabi'], opt: [['dis', .6], ['canta', .5], ['aksesuar', .3]] },
  { req: ['ust', 'alt'], opt: [['dis', .7], ['canta', .6], ['aksesuar', .3]] },          // ayakkabı yoksa
  { req: ['elbise', 'ayakkabi'], opt: [['dis', .5], ['canta', .6], ['aksesuar', .3]] },
  { req: ['elbise'], opt: [['dis', .6], ['canta', .6]] }
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
function styleScore(items) {
  const cnt = {};
  items.forEach(p => (p.styles || []).forEach(s => cnt[s] = (cnt[s] || 0) + 1));
  const common = Object.entries(cnt).filter(([, n]) => n === items.length).map(([s]) => s);
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  return { score: common.length * 3 + (best ? best[1] : 0), common, top: best ? best[0] : 'Günlük' };
}

export function suggestKombins(products, kombins, { gender = 'kadin', world = null, count = 6, maxUse = 3, tries = 800 } = {}) {
  const usage = {};
  kombins.filter(k => k.status !== 'arsiv').forEach(k => (k.productIds || []).forEach(id => usage[id] = (usage[id] || 0) + 1));
  const existing = new Set(kombins.map(k => [...(k.productIds || [])].sort().join('|')));
  const pool = products.filter(p => p.active !== false && (p.gender === gender || p.gender === 'unisex') && (usage[p.id] || 0) < maxUse);
  const worlds = world ? [world] : [...new Set(pool.map(p => p.world))];
  const cands = [];
  for (let t = 0; t < tries; t++) {
    const w = rnd(worlds), tpl = rnd(TEMPLATES);
    const byType = ty => pool.filter(p => p.type === ty && p.world === w);
    const pick = [];
    let ok = true;
    for (const ty of tpl.req) { const c = byType(ty); if (!c.length) { ok = false; break; } pick.push(rnd(c)); }
    if (!ok) continue;
    for (const [ty, pr] of tpl.opt) { const c = byType(ty); if (c.length && Math.random() < pr) pick.push(rnd(c)); }
    const sig = pick.map(p => p.id).sort().join('|');
    if (existing.has(sig) || cands.some(c => c.sig === sig)) continue;
    const st = styleScore(pick), score = colorScore(pick) + st.score + (tpl.req.includes('ayakkabi') ? 2 : 0) + pick.length * .5;
    cands.push({ sig, pick, score, st, w });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = [], used = { ...usage };
  for (const c of cands) {
    if (out.length >= count) break;
    if (c.pick.some(p => (used[p.id] || 0) >= maxUse)) continue;
    c.pick.forEach(p => used[p.id] = (used[p.id] || 0) + 1);
    const style = c.st.common[0] || c.st.top;
    const order = ['dis', 'ust', 'elbise', 'alt', 'ayakkabi', 'canta', 'aksesuar'];
    c.pick.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    out.push({
      name: rnd(NAMES[style] || NAMES['Günlük']), occ: OCC[style] || 'Günlük',
      desc: c.pick.map(p => p.name.toLocaleLowerCase('tr')).join(', ').replace(/^./, s => s.toLocaleUpperCase('tr')) + '.',
      gender, world: c.w, styles: c.st.common.length ? c.st.common : [c.st.top],
      productIds: c.pick.map(p => p.id), score: Math.round(c.score * 10) / 10
    });
  }
  return out;
}
