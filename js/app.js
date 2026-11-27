// iyigiy ortak altyapı: Firebase bağlantısı, ayarlar, sepet, referans takibi, yardımcılar.
// Not: Firebase web yapılandırması gizli değildir; güvenliği firestore.rules sağlar.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection,
  query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch, increment
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyBgrJmBcUPxe7XqBRe-eNdOLaF41Kjp4ug',
  authDomain: 'iyigiy-39c89.firebaseapp.com',
  projectId: 'iyigiy-39c89',
  storageBucket: 'iyigiy-39c89.firebasestorage.app',
  messagingSenderId: '1026977206207',
  appId: '1:1026977206207:web:7c886d16d6c31bcb101b0a'
};

export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);
export const fs = { doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch, increment };
export const authApi = { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail };

export const ADMIN_EMAILS = ['himmet.akarr@gmail.com', 'himmettakarr@gmail.com'];
export const isAdminUser = u => !!u && u.emailVerified && ADMIN_EMAILS.includes(u.email);

/* ---------------- sabitler ---------------- */
export const WORLDS = { kesif: 'Keşif', tanidik: 'Tanıdık', imza: 'İmza' };
export const WORLD_FABRIC = { kesif: 'keten', tanidik: 'pamuk', imza: 'kadife' };
export const CATEGORIES = { giyim: 'Giyim', ayakkabi: 'Ayakkabı', canta: 'Çanta', aksesuar: 'Aksesuar' };
export const TYPES = {
  ust: { label: 'Üst (gömlek, kazak, tişört)', cat: 'giyim' },
  alt: { label: 'Alt (pantolon, etek, şort)', cat: 'giyim' },
  dis: { label: 'Dış giyim (ceket, mont, kaban)', cat: 'giyim' },
  elbise: { label: 'Elbise / tulum', cat: 'giyim' },
  ayakkabi: { label: 'Ayakkabı', cat: 'ayakkabi' },
  canta: { label: 'Çanta', cat: 'canta' },
  aksesuar: { label: 'Aksesuar (şapka, kemer, atkı)', cat: 'aksesuar' }
};
/* ---------------- satış ortağı rolleri ve kişisel mağaza ---------------- */
export const ROLES = { influencer: 'Influencer', stilist: 'Modacı / stilist' };
// Kişisel mağaza adresi: iyigiy.com/irem-derici. Site sayfalarıyla çakışan adlar kullanılamaz.
export const RESERVED_SLUGS = ['index', 'admin', 'hesap', 'sepet', 'kombin', 'kombinler', 'influencer', 'magaza', 'studyo',
  'css', 'js', 'assets', 'api', 'giris', 'iyigiy', 'yardim', 'iletisim', 'kvkk', 'gizlilik'];
export const slugify = s => String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
  .replace(/ö/g, 'o').replace(/ç/g, 'c').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export const validSlug = s => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && !RESERVED_SLUGS.includes(s);
// Görseli tarayıcıda küçültüp JPEG data URL'e çevirir (dosya ya da data URL alır).
export function compressImage(src, max = 1000, q = .84) {
  return new Promise((res, rej) => {
    const go = url => { const im = new Image(); im.onload = () => {
      const sc = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q)); }; im.onerror = rej; im.src = url; };
    if (typeof src === 'string') go(src);
    else { const r = new FileReader(); r.onload = () => go(r.result); r.onerror = rej; r.readAsDataURL(src); }
  });
}

export const STYLES = ['Günlük', 'Ofis', 'Klasik', 'Sokak', 'Spor şık', 'Minimal', 'Davet'];
export const OCCASIONS = ['Günlük', 'Ofis', 'Hafta sonu', 'Akşam ve davet', 'Seyahat', 'Spor'];
export const STATUS = {
  alindi: 'Sipariş alındı', hazirlaniyor: 'Hazırlanıyor', kargoda: 'Kargoda',
  teslim: 'Teslim edildi', iptal: 'İptal edildi', iade: 'İade edildi'
};
export const RET_STATUS = { talep: 'Talep alındı', onay: 'Onaylandı', red: 'Reddedildi', tamam: 'Tamamlandı' };

export const DEFAULT_SETTINGS = {
  commissions: { giyim: 10, ayakkabi: 8, canta: 8, aksesuar: 10 },   // %
  kdv: { giyim: 10, ayakkabi: 10, canta: 20, aksesuar: 20 },          // %
  offLinkRate: 5,          // linkteki kombin dışındaki alışverişler için %
  cookieHours: 24,         // referans geçerlilik süresi
  stopaj: 15,              // 20/B istisna belgeli influencerlar için %
  returnFee: 79,           // ücretsiz hak dolduktan sonra her iade/değişim için TL
  freeReturnsPerMonth: 1,
  returnWindowDays: 14,
  dailyCount: 9,           // günlük öneride gösterilecek kombin sayısı
  queueSize: 6             // admin kuyruğunda cinsiyet başına bekleyen öneri sayısı
};

let _settings = null;
export async function getSettings() {
  if (_settings) return _settings;
  try {
    const s = await getDoc(doc(db, 'settings', 'main'));
    _settings = deepMerge(structuredClone(DEFAULT_SETTINGS), s.exists() ? s.data() : {});
  } catch { _settings = structuredClone(DEFAULT_SETTINGS); }
  return _settings;
}
export function resetSettingsCache() { _settings = null; }
function deepMerge(a, b) {
  for (const k in b) a[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? deepMerge(a[k] || {}, b[k]) : b[k];
  return a;
}

/* ---------------- biçimlendirme ---------------- */
export const tl = n => '₺' + (Math.round((+n || 0) * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = n => '%' + (+n).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const toDate = t => t?.toDate ? t.toDate() : (t instanceof Date ? t : (t ? new Date(t) : null));
export const fmtDate = (t, withTime) => { const d = toDate(t); if (!d) return '-';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) + (withTime ? ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''); };
export const monthKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const uid8 = () => Math.random().toString(36).slice(2, 10);

export function toast(msg, kind = '') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(t._h); t._h = setTimeout(() => t.className = '', 3200);
}

/* ---------------- kombin yardımcıları ---------------- */
export function kombinTotal(k, products) {
  return (k.productIds || []).reduce((s, id) => s + (+(products[id]?.price) || 0), 0);
}
export function kombinImageUrl(k) {
  if (!k) return '';
  if (k.image && k.image.startsWith('img:')) return null; // kombinImages koleksiyonundan okunur
  return k.image || '';
}
const _imgCache = {};
export async function loadKombinImage(k) {
  const direct = kombinImageUrl(k); if (direct !== null) return direct;
  const id = k.image.slice(4);
  if (_imgCache[id]) return _imgCache[id];
  const s = await getDoc(doc(db, 'kombinImages', id));
  return (_imgCache[id] = s.exists() ? s.data().data : '');
}
export async function loadCatalog({ includeAll = false } = {}) {
  const [ps, ks] = await Promise.all([
    getDocs(collection(db, 'products')),
    includeAll ? getDocs(collection(db, 'kombins')) : getDocs(query(collection(db, 'kombins'), where('status', '==', 'yayinda')))
  ]);
  const products = {}; ps.forEach(d => products[d.id] = { id: d.id, ...d.data() });
  const kombins = []; ks.forEach(d => kombins.push({ id: d.id, ...d.data() }));
  return { products, kombins };
}

/* ---------------- ölçü -> beden ---------------- */
export function sizeIndex(h, k) {
  if (!h || !k) return 2;
  const b = k / ((h / 100) ** 2);
  return b < 19 ? 0 : b < 22 ? 1 : b < 25 ? 2 : b < 28 ? 3 : 4;
}
export function recommendSize(sizes, h, k) {
  if (!sizes?.length) return '';
  if (sizes.length === 1) return sizes[0];
  const i = Math.min(sizes.length - 1, Math.round(sizeIndex(h, k) * (sizes.length - 1) / 4));
  return sizes[i];
}

/* ---------------- profil (giriş yapmamış kullanıcı için tarayıcıda) ---------------- */
export function localProfile() { try { return JSON.parse(localStorage.getItem('iy_profile') || '{}'); } catch { return {}; } }
export function saveLocalProfile(p) { localStorage.setItem('iy_profile', JSON.stringify(p)); }

/* ---------------- sepet ---------------- */
export function getCart() { try { return JSON.parse(localStorage.getItem('iy_cart') || '[]'); } catch { return []; } }
export function setCart(c) { localStorage.setItem('iy_cart', JSON.stringify(c)); updateCartBadge(); }
export function addToCart(kombinId, sizes, extras = []) {
  const c = getCart().filter(x => x.kombinId !== kombinId);
  c.push({ kombinId, sizes, extras, at: Date.now() }); setCart(c);
}
// Kombine eşlik eden (fiyata dahil olmayan) ürünler
export const extrasOf = (k, products) => (k.extraIds || []).map(id => products[id]).filter(Boolean);
export function pairingText(extras) {
  if (!extras.length) return '';
  const names = extras.map(p => p.name.toLocaleLowerCase('tr'));
  const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' ve ' + names.at(-1) : names[0];
  return `Bu kombinle ${list} harika görünür. Birlikte almak ister misiniz?`;
}
export function updateCartBadge() {
  const n = getCart().length;
  $$('[data-cart-count]').forEach(e => { e.textContent = n; e.style.display = n ? '' : 'none'; });
}

/* ---------------- referans (influencer) takibi ---------------- */
export function visitorId() {
  let v = localStorage.getItem('iy_vid');
  if (!v) { v = uid8() + uid8(); localStorage.setItem('iy_vid', v); }
  return v;
}
// URL'de ?ref=KOD varsa kaydeder, tıklamayı yazar. Son tıklayan influencer geçerlidir.
export async function captureRef() {
  const p = new URLSearchParams(location.search);
  const code = (p.get('ref') || '').trim().toLowerCase();
  if (!code) return;
  const kombinId = p.get('k') || null;
  try {
    const r = await getDoc(doc(db, 'refCodes', code));
    if (r.exists()) await recordRef(code, r.data().uid, kombinId);
  } catch (e) { console.warn('ref', e); }
  p.delete('ref'); p.delete('k');
  history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
}
// Referansı tarayıcıya yazar ve günde bir kez tıklama kaydeder (kişisel mağaza sayfası da bunu kullanır).
export async function recordRef(code, infUid, kombinId = null) {
  localStorage.setItem('iy_ref', JSON.stringify({ code, infUid, kombinId, at: Date.now() }));
  const key = 'iy_click_' + code + '_' + (kombinId || '') + '_' + new Date().toDateString();
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  try { await addDoc(collection(db, 'clicks'), { code, infUid, vid: visitorId(), kombinId, at: serverTimestamp() }); } catch (e) { console.warn('click', e); }
}
export async function activeRef() {
  try {
    const r = JSON.parse(localStorage.getItem('iy_ref') || 'null');
    if (!r) return null;
    const s = await getSettings();
    if (Date.now() - r.at > s.cookieHours * 3600e3) { localStorage.removeItem('iy_ref'); return null; }
    return r;
  } catch { return null; }
}

/* ---------------- komisyon hesabı ----------------
   Komisyon KDV hariç tutar üzerinden hesaplanır.
   Linkteki kombin: kategori oranı. Aynı ziyarette alınan diğer kombinler: offLinkRate. */
export function commissionLines(orderItems, ref, s, custom = {}) {
  const lines = [];
  for (const it of orderItems) {
    const linked = !ref.kombinId || ref.kombinId === it.kombinId;
    for (const p of it.products) {
      const kdv = s.kdv[p.category] ?? 20;
      const net = p.price / (1 + kdv / 100);
      const rate = linked ? (custom[p.category] ?? s.commissions[p.category] ?? 0) : s.offLinkRate;
      lines.push({ kombinId: it.kombinId, kombinName: it.name, pid: p.pid, name: p.name, category: p.category,
        price: p.price, kdv, net: round2(net), rate, linked, commission: round2(net * rate / 100) });
    }
  }
  return lines;
}
export const round2 = n => Math.round(n * 100) / 100;

/* ---------------- iade / değişim ücreti ---------------- */
export async function returnFeeFor(uidv) {
  const s = await getSettings();
  const q = query(collection(db, 'returns'), where('uid', '==', uidv), where('month', '==', monthKey()));
  const snap = await getDocs(q);
  let used = 0; snap.forEach(d => { if (d.data().status !== 'red') used++; });
  const free = used < s.freeReturnsPerMonth;
  return { used, free, fee: free ? 0 : s.returnFee, freeLeft: Math.max(0, s.freeReturnsPerMonth - used), settings: s };
}

/* ---------------- oturum ---------------- */
export function onUser(cb) { return onAuthStateChanged(auth, cb); }
export async function googleSignIn() { return signInWithPopup(auth, new GoogleAuthProvider()); }
export async function logout() { await signOut(auth); }

/* ---------------- ortak üst menü ---------------- */
export function mountNav(active = '') {
  const el = document.getElementById('nav'); if (!el) return;
  el.innerHTML = `
    <a class="logo" href="/">iyigiy</a>
    <nav class="links">
      <a href="/" class="${active === 'home' ? 'on' : ''}">Gardırobum</a>
      <a href="/kombinler" class="${active === 'list' ? 'on' : ''}">Tüm kombinler</a>
      <a href="/hesap" class="${active === 'account' ? 'on' : ''}" id="navAcc">Hesabım</a>
      <a href="/sepet" class="cart ${active === 'cart' ? 'on' : ''}">Sepet <b data-cart-count></b></a>
    </nav>`;
  updateCartBadge();
  onUser(u => {
    const a = document.getElementById('navAcc'); if (!a) return;
    if (isAdminUser(u)) { if (!document.getElementById('navAdm')) a.insertAdjacentHTML('afterend', '<a href="/admin" id="navAdm">Admin</a>'); }
  });
}

captureRef();
