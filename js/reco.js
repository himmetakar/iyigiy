// Kişiye göre sıralama ve günlük öneri
import { kombinTotal } from './app.js';

const BUDGET = { "5.000 TL'ye kadar": 5000, '5.000 - 10.000 TL': 10000, '10.000 - 20.000 TL': 20000, '20.000 TL üzeri': Infinity };

export function scoreFor(k, products, prof) {
  let s = 0;
  if (prof.kim && k.gender !== prof.kim) s -= 100;
  const max = BUDGET[prof.butce] ?? Infinity, t = kombinTotal(k, products);
  if (t <= max) s += 10; else s -= Math.min(20, (t - max) / 500);
  const ts = prof.tarz || [];
  s += (k.styles || []).filter(x => ts.includes(x)).length * 6;
  if (prof.renk === 'Koyu tonlar') s += k.productIds.map(id => products[id]).filter(p => p && (p.colors || []).some(c => ['siyah', 'antrasit', 'lacivert', 'kahve', 'bordo'].includes(c))).length;
  if (prof.renk === 'Nötr tonlar') s += k.productIds.map(id => products[id]).filter(p => p && (p.colors || []).some(c => ['bej', 'krem', 'ekru', 'gri', 'camel', 'beyaz'].includes(c))).length;
  if (prof.renk === 'Canlı renkler') s += k.productIds.map(id => products[id]).filter(p => p && (p.colors || []).some(c => ['kırmızı', 'sarı', 'yeşil', 'mavi', 'pembe', 'turuncu', 'mor'].includes(c))).length;
  return s;
}
export function rankForProfile(list, products, prof) {
  return [...list].map(k => ({ k, s: scoreFor(k, products, prof) })).sort((a, b) => b.s - a.s).map(x => x.k);
}
// Günlük öneri: kişiye uygun olanlardan, güne göre değişen bir seçki.
export function dailyPicks(list, products, prof, count, seedKey = '') {
  const day = new Date().toISOString().slice(0, 10);
  let h = 2166136261; for (const ch of day + seedKey) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const scored = list.map(k => ({ k, s: scoreFor(k, products, prof) + rand() * 8 })).filter(x => x.s > -50);
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, count).map(x => x.k);
}
