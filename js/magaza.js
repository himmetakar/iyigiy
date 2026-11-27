// Kişisel mağaza sayfası: iyigiy.com/<slug>
// Üstte kişinin gardırobu (ana sayfadaki askılığın aynısı), altta kombin detayı.
// Bu sayfaya gelen ziyaretçinin tüm alışverişi sayfanın sahibine referanslanır.
import { db, fs, localProfile, sizeIndex, updateCartBadge, recordRef, ROLES, esc } from './app.js';
import { toWardrobeItems, hangWardrobe } from './wardrobe.js';
const { doc, getDoc, getDocs, collection, query, where } = fs;
const $ = s => document.querySelector(s);
const body = document.body;

// "İrem Derici" -> "İrem Derici'nin" (Türkçe ilgi hâli eki, ünlü uyumu ile)
export function genitive(name) {
  const n = String(name || '').trim(); if (!n) return '';
  const low = n.toLocaleLowerCase('tr'), vs = low.match(/[aeıioöuü]/g) || ['e'], v = vs.at(-1);
  const h = { a: 'ı', ı: 'ı', e: 'i', i: 'i', o: 'u', u: 'u', ö: 'ü', ü: 'ü' }[v];
  return n + "'" + (/[aeıioöuü]$/.test(low) ? 'n' : '') + h + 'n';
}

const ICON = {
  instagram: '<svg viewBox="0 0 24 24"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17.3 5.4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24"><path d="M14 2h3a5 5 0 0 0 4 4v3a8 8 0 0 1-4-1.2V15a7 7 0 1 1-7-7h1v3.2a4 4 0 1 0 3 3.8V2z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24"><path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8zM10 15V9l5.2 3L10 15z"/></svg>',
  web: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2c-.9 0-2.3 2-2.8 5h5.6C14.3 6 12.9 4 12 4zm-4.8 5c.2-1.8.7-3.4 1.4-4.6A8 8 0 0 0 4.3 9h2.9zm-3 2a8 8 0 0 0 0 2h3a20 20 0 0 1 0-2h-3zm5 0a18 18 0 0 0 0 2h5.6a18 18 0 0 0 0-2H9.2zm7.6 0a20 20 0 0 1 0 2h3a8 8 0 0 0 0-2h-3zm2.9-2a8 8 0 0 0-4.3-4.6c.7 1.2 1.2 2.8 1.4 4.6h2.9zM4.3 15a8 8 0 0 0 4.3 4.6c-.7-1.2-1.2-2.8-1.4-4.6H4.3zm4.9 0c.5 3 1.9 5 2.8 5s2.3-2 2.8-5H9.2zm7.6 0c-.2 1.8-.7 3.4-1.4 4.6a8 8 0 0 0 4.3-4.6h-2.9z"/></svg>'
};
const SOC_LABEL = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', web: 'Web sitesi' };
// Kullanıcının yazdığı hesap adını güvenli bir bağlantıya çevirir.
function socialUrl(k, v) {
  v = String(v || '').trim(); if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  const h = v.replace(/^@/, '').replace(/^(www\.)?(instagram\.com|tiktok\.com|youtube\.com)\/@?/i, '');
  if (k === 'instagram') return 'https://instagram.com/' + encodeURIComponent(h);
  if (k === 'tiktok') return 'https://www.tiktok.com/@' + encodeURIComponent(h);
  if (k === 'youtube') return 'https://www.youtube.com/@' + encodeURIComponent(h);
  return 'https://' + v.replace(/^\/+/, '');
}

const slug = decodeURIComponent(new URLSearchParams(location.search).get('s') || location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();

async function main() {
  const ss = slug ? await getDoc(doc(db, 'stores', slug)) : null;
  if (!ss?.exists() || !ss.data().active) { $('#nf').classList.add('on'); body.classList.add('in'); return; }
  const st = ss.data();
  document.title = st.name + ' · iyigiy';
  const first = st.name.split(/\s+/)[0];
  $('#ttl').innerHTML = `${esc(genitive(st.name))} gardırobunda <em>neler var?</em>`;
  $('#role').textContent = (ROLES[st.role] || 'Influencer') + ' · ' + st.name;
  const av = $('#av');
  if (st.photo) av.style.backgroundImage = `url("${st.photo}")`; else av.textContent = first[0] || '';
  $('#hintT').textContent = 'Kılıfları sağa sola itin, birine dokunun';

  // Hakkında paneli
  const soc = Object.entries(st.socials || {}).filter(([k, v]) => ICON[k] && v).map(([k, v]) =>
    `<a href="${esc(socialUrl(k, v))}" target="_blank" rel="noopener noreferrer">${ICON[k]}${SOC_LABEL[k]}</a>`).join('');
  const aph = $('#aph');
  if (st.photo) aph.style.backgroundImage = `url("${st.photo}")`; else aph.classList.add('none');
  $('#atx').innerHTML = `<div class="lab">${esc(ROLES[st.role] || 'Influencer')}</div><h2>${esc(st.name)}</h2>
    ${st.bio ? `<p>${esc(st.bio)}</p>` : ''}${soc ? `<div class="soc">${soc}</div>` : ''}
    <div class="note">Bu gardıroptaki kombinleri ${esc(first)} hazırladı. Ödeme adımında markalar açıklanır; iade ve değişim koşulları iyigiy ile aynıdır.</div>`;
  const openAbout = e => { e?.preventDefault(); $('#about').classList.add('on'); };
  const closeAbout = () => $('#about').classList.remove('on');
  $('#whoBtn').onclick = openAbout; $('#allBtn').onclick = openAbout; $('#ax').onclick = closeAbout;
  $('#about').addEventListener('click', e => { if (e.target.id === 'about') closeAbout(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeAbout(); });

  // Bu sayfadan yapılan tüm alışverişler sahibine yazılır (son tıklama geçerli).
  if (st.code) recordRef(st.code, st.uid, null);

  // Kişinin kombinleri: kendi mağazasında yayında olanlar + ana katalogda yayında olanlar
  const ks = await getDocs(query(collection(db, 'kombins'), where('ownerUid', '==', st.uid), where('status', 'in', ['magaza', 'yayinda'])));
  const kombins = ks.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const ids = [...new Set(kombins.flatMap(k => [...(k.productIds || []), ...(k.extraIds || [])]))];
  const products = {};
  await Promise.all(ids.map(id => getDoc(doc(db, 'products', id)).then(s => { if (s.exists()) products[id] = { id, ...s.data() }; })));
  const list = toWardrobeItems(kombins.filter(k => (k.productIds || []).every(id => products[id])), products);
  if (!list.length) $('#hintT').textContent = `${first} gardırobunu hazırlıyor. Yakında yeni kombinler asılacak.`;
  const prof = localProfile();
  hangWardrobe(list, { bag: innerWidth < 860 ? .48 : .5, sizeIdx: () => sizeIndex(prof.h, prof.k) });
  requestAnimationFrame(() => { body.classList.add('in'); body.dataset.s = 'rail'; });
}
main().catch(e => { console.error(e); $('#nf').classList.add('on'); body.classList.add('in'); });
updateCartBadge();
