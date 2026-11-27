// iyigiy yönetim paneli
import {
  db, fs, onUser, isAdminUser, googleSignIn, logout, mountNav, getSettings, resetSettingsCache, DEFAULT_SETTINGS,
  WORLDS, CATEGORIES, TYPES, STYLES, OCCASIONS, STATUS, RET_STATUS, tl, pct, esc, fmtDate, toDate, toast, $, $$,
  loadCatalog, loadKombinImage, kombinTotal, commissionLines, round2, uid8
} from './app.js';
import { suggestKombins, COLORS } from './engine.js';

const { doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, writeBatch } = fs;
mountNav('admin');
const root = $('#root');
const modal = (html) => { $('#mbody').innerHTML = html; $('#modal').classList.add('on'); };
const closeModal = () => $('#modal').classList.remove('on');

let S, CAT = { products: {}, kombins: [] }, TAB = location.hash.slice(1) || 'ozet';

onUser(async u => {
  if (!u) {
    root.innerHTML = `<div class="locked card gold"><div class="lab">Yönetim</div><h2 style="margin:12px 0 10px">Giriş gerekli</h2>
      <p class="muted">Yönetim paneline yalnızca yetkili Google hesapları girebilir.</p><div class="sep"></div>
      <button class="btn" id="g">Google ile giriş yap</button></div>`;
    $('#g').onclick = () => googleSignIn().catch(e => toast(e.message, 'bad'));
    return;
  }
  if (!isAdminUser(u)) {
    root.innerHTML = `<div class="locked card"><h2>Yetkiniz yok</h2><p class="muted" style="margin-top:10px">${esc(u.email)} hesabı admin değil.</p>
      <div class="sep"></div><button class="btn ghost" id="lo">Çıkış yap</button></div>`;
    $('#lo').onclick = logout; return;
  }
  S = await getSettings();
  await reloadCatalog();
  shell();
});

async function reloadCatalog() { CAT = await loadCatalog({ includeAll: true }); }

const MENU = [['ozet', 'Özet'], ['urunler', 'Ürünler'], ['oneriler', 'Kombin önerileri'], ['kombinler', 'Kombinler'], ['siparisler', 'Siparişler'],
  ['iadeler', 'İade ve değişim'], ['influencer', 'Influencerlar'], ['ayarlar', 'Komisyon ve ayarlar'], ['araclar', 'Araçlar']];

function shell() {
  root.innerHTML = `<div class="side"><nav id="menu">${MENU.map(([k, l]) => `<button data-t="${k}">${l}<span class="n" data-n="${k}" style="display:none"></span></button>`).join('')}</nav><section id="view"></section></div>`;
  $$('#menu button').forEach(b => b.onclick = () => go(b.dataset.t));
  go(TAB); badges();
}
async function badges() {
  const set = (k, n) => { const e = document.querySelector(`[data-n="${k}"]`); if (e) { e.textContent = n; e.style.display = n ? '' : 'none'; } };
  set('oneriler', CAT.kombins.filter(k => ['oneri', 'gorsel_bekliyor', 'gorsel_onay'].includes(k.status)).length);
  try {
    const [o, r, i] = await Promise.all([
      getDocs(query(collection(db, 'orders'), where('status', '==', 'alindi'))),
      getDocs(query(collection(db, 'returns'), where('status', '==', 'talep'))),
      getDocs(query(collection(db, 'influencers'), where('status', '==', 'basvuru')))]);
    set('siparisler', o.size); set('iadeler', r.size); set('influencer', i.size);
  } catch (e) { console.warn(e); }
}
function go(t) {
  TAB = t; history.replaceState(null, '', '#' + t);
  $$('#menu button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  const v = $('#view'); v.innerHTML = '<div class="spin"></div>';
  ({ ozet, urunler, oneriler, kombinler, siparisler, iadeler, influencer, ayarlar, araclar })[t](v).catch(e => { console.error(e); v.innerHTML = `<div class="empty">Hata: ${esc(e.message)}</div>`; });
}

/* =============== ÖZET =============== */
async function ozet(v) {
  const [o, r, inf, rs] = await Promise.all([getDocs(collection(db, 'orders')), getDocs(collection(db, 'returns')),
    getDocs(collection(db, 'influencers')), getDocs(collection(db, 'refSales'))]);
  const orders = o.docs.map(d => d.data()).filter(x => x.status !== 'iptal');
  const ciro = orders.reduce((s, x) => s + (x.total || 0), 0);
  const kom = rs.docs.map(d => d.data()).filter(x => x.status !== 'iptal').reduce((s, x) => s + (x.commission || 0), 0);
  const pub = CAT.kombins.filter(k => k.status === 'yayinda').length;
  v.innerHTML = `<div class="lab">Genel bakış</div><h2 style="margin:8px 0 24px">Özet</h2>
   <div class="grid g4">
    ${stat('Ciro', tl(ciro), orders.length + ' sipariş')}
    ${stat('Yayındaki kombin', pub, Object.keys(CAT.products).length + ' ürün')}
    ${stat('İade / değişim', r.size, r.docs.filter(d => d.data().status === 'talep').length + ' bekleyen talep')}
    ${stat('Influencer komisyonu', tl(kom), inf.docs.filter(d => d.data().status === 'aktif').length + ' aktif influencer')}
   </div>
   <div class="card" style="margin-top:22px"><div class="lab">Sıradaki işler</div>
    <ul style="margin:14px 0 0 18px;line-height:2;color:var(--soft)">
     <li>Ürün ekle ve <a class="link" data-go="oneriler">kombin önerilerini</a> onayla.</li>
     <li>Onaylanan kombinlerin görselini üret, beğenirsen yayına al.</li>
     <li>Yeni <a class="link" data-go="siparisler">siparişleri</a> ve <a class="link" data-go="iadeler">iade taleplerini</a> işle.</li>
    </ul></div>`;
  $$('[data-go]', v).forEach(a => a.onclick = () => go(a.dataset.go));
}
const stat = (l, v, s) => `<div class="stat"><div class="lab">${l}</div><div class="v">${v}</div><div class="s">${s || ''}</div></div>`;

/* =============== ÜRÜNLER =============== */
async function urunler(v) {
  const list = Object.values(CAT.products).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
  const usage = usageMap();
  v.innerHTML = `<div class="between"><div><div class="lab">Katalog</div><h2 style="margin-top:8px">Ürünler</h2></div>
     <button class="btn" id="add">+ Ürün ekle</button></div>
    <div class="row" style="margin:20px 0"><input class="in" id="q" placeholder="Ürün ya da marka ara" style="max-width:320px">
     <select class="in" id="fw" style="max-width:170px"><option value="">Tüm dünyalar</option>${opt(WORLDS)}</select>
     <select class="in" id="fc" style="max-width:170px"><option value="">Tüm kategoriler</option>${opt(CATEGORIES)}</select></div>
    <div class="card scroll"><table class="tbl"><thead><tr><th>Görsel</th><th>Ürün</th><th>Marka</th><th>Tür</th><th>Dünya</th><th>Renk / tarz</th><th class="num">Fiyat</th><th class="num">Kombin</th><th></th></tr></thead>
    <tbody id="tb"></tbody></table></div>`;
  const draw = () => {
    const q = $('#q').value.toLocaleLowerCase('tr'), fw = $('#fw').value, fc = $('#fc').value;
    const rows = list.filter(p => (!q || (p.name + ' ' + p.brand).toLocaleLowerCase('tr').includes(q)) && (!fw || p.world === fw) && (!fc || p.category === fc));
    $('#tb').innerHTML = rows.map(p => `<tr>
      <td><div class="thumbs">${(p.images || []).slice(0, 2).map(s => `<img src="${esc(s)}" alt="">`).join('')}</div></td>
      <td><b>${esc(p.name)}</b><div class="muted" style="font-size:12px">${(p.sizes || []).join(' · ')}</div></td>
      <td>${esc(p.brand)}</td><td>${esc(TYPES[p.type]?.label.split(' (')[0] || p.type)}<div class="muted" style="font-size:12px">${p.gender === 'kadin' ? 'Kadın' : p.gender === 'erkek' ? 'Erkek' : 'Unisex'}</div></td>
      <td><span class="badge gold">${WORLDS[p.world] || '-'}</span></td>
      <td style="font-size:12px">${(p.colors || []).join(', ')}<div class="muted">${(p.styles || []).join(', ')}</div></td>
      <td class="num">${tl(p.price)}</td><td class="num">${usage[p.id] || 0} / ${S.maxUsage ?? 3}</td>
      <td class="num"><button class="btn sm ghost" data-e="${p.id}">Düzenle</button> ${p.active === false ? '<span class="badge bad">Pasif</span>' : ''}</td></tr>`).join('') || `<tr><td colspan="9"><div class="empty">Ürün yok. "Ürün ekle" ile başla ya da Araçlar sekmesinden örnek verileri yükle.</div></td></tr>`;
    $$('[data-e]').forEach(b => b.onclick = () => productForm(CAT.products[b.dataset.e]));
  };
  ['q', 'fw', 'fc'].forEach(i => $('#' + i).oninput = draw); draw();
  $('#add').onclick = () => productForm(null);
}
function opt(o, sel) { return Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join(''); }
function usageMap() {
  const u = {};
  CAT.kombins.filter(k => k.status !== 'arsiv').forEach(k => (k.productIds || []).forEach(id => u[id] = (u[id] || 0) + 1));
  return u;
}
function chipSet(id, all, sel = []) {
  return `<div class="chips" id="${id}">${all.map(x => `<button type="button" class="chip ${sel.includes(x) ? 'on' : ''}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
}
function bindChips(id) { $$('#' + id + ' .chip').forEach(c => c.onclick = () => c.classList.toggle('on')); }
const chipVals = id => $$('#' + id + ' .chip.on').map(c => c.dataset.v);

function productForm(p) {
  p = p || { name: '', brand: '', type: 'ust', gender: 'kadin', world: 'tanidik', colors: [], styles: [], price: '', sizes: ['XS', 'S', 'M', 'L', 'XL'], images: [], active: true, sourceUrl: '' };
  let imgs = [...(p.images || [])];
  modal(`<div class="lab">${p.id ? 'Ürünü düzenle' : 'Yeni ürün'}</div><h2 style="margin:8px 0 20px">${esc(p.name || 'Ürün')}</h2>
   <div class="grid g2">
    <label class="f">Ürün adı<input class="in" id="pn" value="${esc(p.name)}"></label>
    <label class="f">Marka (müşteriye ödeme adımında açıklanır)<input class="in" id="pb" value="${esc(p.brand)}"></label>
    <label class="f">Tür<select class="in" id="pt">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === p.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
    <label class="f">Cinsiyet<select class="in" id="pg">${opt({ kadin: 'Kadın', erkek: 'Erkek', unisex: 'Unisex' }, p.gender)}</select></label>
    <label class="f">Marka dünyası<select class="in" id="pw">${opt(WORLDS, p.world)}</select></label>
    <label class="f">Satış fiyatı (KDV dahil, TL)<input class="in" id="pp" type="number" step="0.01" value="${p.price}"></label>
    <label class="f" style="grid-column:1/-1">Bedenler (virgülle)<input class="in" id="ps" value="${esc((p.sizes || []).join(', '))}"></label>
    <label class="f" style="grid-column:1/-1">Kaynak sayfa (markanın ürün linki, AVM'de bulmak için)<input class="in" id="pu" value="${esc(p.sourceUrl || '')}"></label>
   </div>
   <div class="f" style="margin-top:18px"><span class="lab">Renkler</span>${chipSet('pc', COLORS, p.colors)}</div>
   <div class="f" style="margin-top:18px"><span class="lab">Tarz</span>${chipSet('pst', STYLES, p.styles)}</div>
   <div class="f" style="margin-top:18px"><span class="lab">Görseller (ilk görsel kombin üretiminde kullanılır)</span>
     <div class="imgup" id="pimgs"></div>
     <div class="row" style="margin-top:10px"><input class="in" id="pimgurl" placeholder="Görsel adresi (https://... ya da /assets/...)" style="flex:1">
      <button class="btn sm ghost" id="addurl">Adres ekle</button>
      <label class="btn sm ghost">Dosya yükle<input type="file" id="pfile" accept="image/*" multiple hidden></label></div></div>
   <label class="check" style="margin-top:18px"><input type="checkbox" id="pa" ${p.active !== false ? 'checked' : ''}> Aktif (kombin önerilerinde kullanılır)</label>
   <div class="sep"></div><div class="between">${p.id ? '<button class="btn danger sm" id="pdel">Ürünü sil</button>' : '<span></span>'}<button class="btn" id="psave">Kaydet</button></div>`);
  bindChips('pc'); bindChips('pst');
  const drawImgs = () => { $('#pimgs').innerHTML = imgs.map((s, i) => `<div class="t"><img src="${esc(s)}"><button data-i="${i}">✕</button></div>`).join('') || '<span class="muted" style="font-size:13px">Görsel yok</span>';
    $$('#pimgs button').forEach(b => b.onclick = () => { imgs.splice(+b.dataset.i, 1); drawImgs(); }); };
  drawImgs();
  $('#addurl').onclick = () => { const u = $('#pimgurl').value.trim(); if (u) { imgs.push(u); $('#pimgurl').value = ''; drawImgs(); } };
  $('#pfile').onchange = async e => { for (const f of e.target.files) imgs.push(await compressFile(f, 720, .8)); drawImgs(); };
  if ($('#pdel')) $('#pdel').onclick = async () => {
    if (usageMap()[p.id]) return toast('Bu ürün kombinlerde kullanılıyor. Önce kombinleri arşivle ya da ürünü pasif yap.', 'bad');
    if (!confirm('Ürün kalıcı olarak silinsin mi?')) return;
    await deleteDoc(doc(db, 'products', p.id)); await reloadCatalog(); closeModal(); go('urunler'); toast('Ürün silindi');
  };
  $('#psave').onclick = async () => {
    const t = $('#pt').value;
    const data = { name: $('#pn').value.trim(), brand: $('#pb').value.trim(), type: t, category: TYPES[t].cat, gender: $('#pg').value, world: $('#pw').value,
      price: +$('#pp').value, sizes: $('#ps').value.split(',').map(s => s.trim()).filter(Boolean), colors: chipVals('pc'), styles: chipVals('pst'),
      images: imgs, sourceUrl: $('#pu').value.trim(), active: $('#pa').checked, updatedAt: serverTimestamp() };
    if (!data.name || !data.brand || !data.price) return toast('Ad, marka ve fiyat zorunlu', 'bad');
    if (JSON.stringify(data).length > 900000) return toast('Görseller çok büyük; daha az ya da adresle ekle', 'bad');
    if (p.id) await updateDoc(doc(db, 'products', p.id), data);
    else await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
    await reloadCatalog(); closeModal(); go('urunler'); toast('Ürün kaydedildi');
  };
}
export function compressFile(file, max = 900, q = .82) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => compressDataUrl(r.result, max, q).then(res, rej); r.onerror = rej; r.readAsDataURL(file); });
}
function compressDataUrl(src, max, q) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => {
    const sc = Math.min(1, max / im.width), c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q)); }; im.onerror = rej; im.src = src; });
}

/* =============== KOMBİN ÖNERİLERİ =============== */
async function oneriler(v) {
  const pend = CAT.kombins.filter(k => ['oneri', 'gorsel_bekliyor', 'gorsel_onay'].includes(k.status));
  const key = localStorage.getItem('iy_gemini_key');
  v.innerHTML = `<div class="lab">Sistem önerir, sen onaylarsın</div><h2 style="margin:8px 0 18px">Kombin önerileri</h2>
   <div class="card gold"><div class="row">
     <select class="in" id="og" style="max-width:150px">${opt({ kadin: 'Kadın', erkek: 'Erkek' })}</select>
     <select class="in" id="ow" style="max-width:170px"><option value="">Tüm dünyalar</option>${opt(WORLDS)}</select>
     <select class="in" id="on" style="max-width:130px">${[3, 6, 10, 15].map(n => `<option>${n}</option>`).join('')}</select>
     <button class="btn" id="gen">Yeni öneri üret</button></div>
     <p class="muted" style="font-size:12.5px;margin-top:12px;line-height:1.6">Sistem aktif ürünleri renk uyumu, tarz ve marka dünyasına göre birleştirir. Bir ürün en fazla ${S.maxUsage ?? 3} kombinde kullanılır (Ayarlar'dan değişir). Akış: <b>Öneri</b> → onayla → <b>görsel üret</b> → görseli onayla → <b>yayında</b>.</p>
     ${key ? '' : '<p style="font-size:13px;margin-top:8px;color:var(--warn)">Görsel üretmek için Ayarlar sekmesine Gemini API anahtarını gir (yalnızca bu tarayıcıda saklanır).</p>'}</div>
   <div id="plist" style="margin-top:22px;display:grid;gap:14px"></div>`;
  $('#gen').onclick = async () => {
    const s = suggestKombins(Object.values(CAT.products), CAT.kombins, { gender: $('#og').value, world: $('#ow').value || null, count: +$('#on').value, maxUse: S.maxUsage ?? 3 });
    if (!s.length) return toast('Uygun öneri çıkmadı: bu filtre için yeterli aktif ürün yok (üst, alt, ayakkabı gerekli).', 'bad');
    const b = writeBatch(db);
    s.forEach(k => b.set(doc(collection(db, 'kombins')), { ...k, status: 'oneri', createdAt: serverTimestamp() }));
    await b.commit(); await reloadCatalog(); go('oneriler'); badges(); toast(s.length + ' yeni öneri eklendi');
  };
  const L = $('#plist');
  if (!pend.length) { L.innerHTML = '<div class="empty">Bekleyen öneri yok.</div>'; return; }
  for (const k of pend.sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0))) L.appendChild(proposalCard(k));
}
function proposalCard(k) {
  const el = document.createElement('div'); el.className = 'card';
  const ps = (k.productIds || []).map(id => CAT.products[id]).filter(Boolean);
  const st = { oneri: ['Öneri', 'warn'], gorsel_bekliyor: ['Görsel bekliyor', 'gold'], gorsel_onay: ['Görsel onayı', 'gold'] }[k.status];
  el.innerHTML = `<div class="kprop"><div class="im" data-im>${k.status === 'oneri' ? 'Önce kombini onayla' : 'Görsel yok'}</div><div>
    <div class="between"><div class="row"><span class="badge ${st[1]}">${st[0]}</span><span class="badge gold">${WORLDS[k.world]}</span><span class="badge">${k.gender === 'erkek' ? 'Erkek' : 'Kadın'}</span><span class="muted" style="font-size:12px">Puan ${k.score ?? '-'}</span></div><b class="serif" style="font-size:22px;color:var(--gold2)">${tl(kombinTotal(k, CAT.products))}</b></div>
    <div class="grid g2" style="margin-top:12px">
      <label class="f">Kombin adı<input class="in" data-f="name" value="${esc(k.name)}"></label>
      <label class="f">Kullanım alanı<select class="in" data-f="occ">${OCCASIONS.map(o => `<option ${o === k.occ ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="f" style="grid-column:1/-1">Açıklama<input class="in" data-f="desc" value="${esc(k.desc || '')}"></label></div>
    <div class="pieces">${ps.map(p => `<div class="pc"><img src="${esc(p.images?.[0] || '')}">${esc(p.name)}<br><span style="color:var(--gold2)">${tl(p.price)}</span></div>`).join('')}</div>
    <div class="row" style="margin-top:16px" data-act></div></div></div>`;
  const im = el.querySelector('[data-im]');
  if (k.image) loadKombinImage(k).then(src => { if (src) im.innerHTML = `<img src="${src}">`; });
  const save = () => { const d = {}; el.querySelectorAll('[data-f]').forEach(i => d[i.dataset.f] = i.value.trim()); return d; };
  const act = el.querySelector('[data-act]');
  const btn = (txt, cls, fn) => { const b = document.createElement('button'); b.className = 'btn sm ' + cls; b.textContent = txt; b.onclick = () => fn(b); act.appendChild(b); };
  if (k.status === 'oneri') {
    btn('Kombini onayla', '', async () => { await updateDoc(doc(db, 'kombins', k.id), { ...save(), status: 'gorsel_bekliyor' }); await reloadCatalog(); go('oneriler'); badges(); });
    btn('Reddet', 'danger', async () => { await deleteDoc(doc(db, 'kombins', k.id)); await reloadCatalog(); go('oneriler'); badges(); });
  } else {
    btn(k.image ? 'Görseli yeniden üret' : 'Görsel üret', k.image ? 'ghost' : '', async b => {
      b.disabled = true; b.textContent = 'Üretiliyor… (30-60 sn)';
      try { await updateDoc(doc(db, 'kombins', k.id), save()); await generateImage(k, ps); await reloadCatalog(); go('oneriler'); toast('Görsel üretildi'); }
      catch (e) { console.error(e); toast('Görsel üretilemedi: ' + e.message, 'bad'); b.disabled = false; b.textContent = 'Tekrar dene'; }
    });
    if (k.status === 'gorsel_onay') btn('Görseli onayla ve yayına al', '', async () => {
      await updateDoc(doc(db, 'kombins', k.id), { ...save(), status: 'yayinda', publishedAt: serverTimestamp() }); await reloadCatalog(); go('oneriler'); badges(); toast('Kombin yayında');
    });
    btn('Kaydet', 'ghost', async () => { await updateDoc(doc(db, 'kombins', k.id), save()); toast('Kaydedildi'); });
    btn('Reddet', 'danger', async () => { if (!confirm('Kombin silinsin mi?')) return; await deleteDoc(doc(db, 'kombins', k.id)); await reloadCatalog(); go('oneriler'); badges(); });
  }
  return el;
}

const PERSONAS = {
  kadin: ['a woman around thirty with Mediterranean features, olive skin and dark wavy shoulder-length hair', 'a Black woman in her mid twenties with short natural curls',
    'an East Asian woman in her late twenties with a sleek black bob', 'a Turkish woman in her thirties with long chestnut hair', 'a blonde Northern European woman in her late twenties', 'a South Asian woman in her thirties with long dark hair in a low bun'],
  erkek: ['an East Asian man in his early thirties with short textured black hair', 'a Turkish man in his thirties with a trimmed dark beard', 'a Black man in his late twenties with a short fade',
    'a blond Northern European man in his thirties', 'a Middle Eastern man in his late twenties with wavy dark hair', 'a Latino man in his thirties with short curly hair']
};
async function generateImage(k, ps) {
  const key = localStorage.getItem('iy_gemini_key'); if (!key) throw new Error('Ayarlar sekmesinden Gemini API anahtarını gir');
  const parts = []; const used = [];
  for (const p of ps) {
    const src = p.images?.[0]; if (!src) continue;
    try { const b64 = await toBase64(src); parts.push({ inlineData: { mimeType: b64.mime, data: b64.data } }); used.push(p); } catch (e) { console.warn('görsel alınamadı', src, e); }
  }
  if (!used.length) throw new Error('Ürün görselleri okunamadı');
  const pool = PERSONAS[k.gender === 'erkek' ? 'erkek' : 'kadin']; const persona = pool[Math.floor(Math.random() * pool.length)];
  const list = used.map((p, i) => `image ${i + 1}: the ${p.name} (${(p.colors || []).join('/')})`).join('; ');
  parts.push({ text: `Using the ${used.length} reference photos only for the clothing and accessories, create one new full-length fashion photograph of a completely different person: ${persona}, calm confident expression. They wear, as one complete outfit, exactly these items reproduced faithfully in colour, cut, fabric and details: ${list}. If no shoes are given, add simple shoes that suit the outfit. Natural relaxed standing pose facing the camera. Seamless warm off-white studio backdrop, direct hard flash with a crisp soft-edged shadow on the wall behind, medium format film look, real skin and fabric texture, natural proportions. Whole figure head to toe, centred, with space above the head and below the feet. No text, no logos, no watermark.` });
  const model = localStorage.getItem('iy_gemini_model') || 'gemini-3-pro-image';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16', imageSize: '1K' } } })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || ('HTTP ' + r.status));
  const img = j.candidates?.[0]?.content?.parts?.find(x => x.inlineData);
  if (!img) throw new Error('Model görsel döndürmedi');
  const data = await compressDataUrl(`data:${img.inlineData.mimeType};base64,${img.inlineData.data}`, 900, .84);
  const imgId = k.id + '-' + uid8();
  await setDoc(doc(db, 'kombinImages', imgId), { data, kombinId: k.id, model, createdAt: serverTimestamp() });
  if (k.image?.startsWith('img:')) deleteDoc(doc(db, 'kombinImages', k.image.slice(4))).catch(() => {});
  await updateDoc(doc(db, 'kombins', k.id), { image: 'img:' + imgId, status: 'gorsel_onay' });
}
async function toBase64(src) {
  if (src.startsWith('data:')) { const [h, d] = src.split(','); return { mime: h.slice(5).split(';')[0], data: d }; }
  const r = await fetch(src); if (!r.ok) throw new Error('HTTP ' + r.status);
  const b = await r.blob();
  const d = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  const small = await compressDataUrl(d, 900, .85);
  return { mime: 'image/jpeg', data: small.split(',')[1] };
}

/* =============== KOMBİNLER =============== */
async function kombinler(v) {
  const list = CAT.kombins.filter(k => ['yayinda', 'arsiv'].includes(k.status));
  v.innerHTML = `<div class="lab">Yayındaki ve arşivdeki</div><h2 style="margin:8px 0 18px">Kombinler</h2>
   <div class="grid g3" id="kl"></div>`;
  const L = $('#kl');
  if (!list.length) { L.outerHTML = '<div class="empty">Henüz yayında kombin yok. Kombin önerilerinden onayla.</div>'; return; }
  list.sort((a, b) => (a.status > b.status ? 1 : -1));
  for (const k of list) {
    const el = document.createElement('div'); el.className = 'kcard';
    el.innerHTML = `<div class="ph" data-ph><span class="w">${WORLDS[k.world]}</span></div><div class="meta"><div class="between"><span class="lab">${esc(k.occ || '')}</span>
     <span class="badge ${k.status === 'yayinda' ? 'ok' : ''}">${k.status === 'yayinda' ? 'Yayında' : 'Arşiv'}</span></div><b>${esc(k.name)}</b><div class="p">${tl(kombinTotal(k, CAT.products))}</div>
     <div class="row" style="margin-top:12px"><button class="btn sm ghost" data-a>${k.status === 'yayinda' ? 'Arşivle' : 'Yeniden yayınla'}</button><a class="btn sm ghost" href="/kombin?id=${k.id}" target="_blank">Gör</a></div></div>`;
    loadKombinImage(k).then(s => { if (s) el.querySelector('[data-ph]').style.backgroundImage = `url("${s}")`; });
    el.querySelector('[data-a]').onclick = async () => { await updateDoc(doc(db, 'kombins', k.id), { status: k.status === 'yayinda' ? 'arsiv' : 'yayinda' }); await reloadCatalog(); go('kombinler'); };
    L.appendChild(el);
  }
}

/* =============== SİPARİŞLER =============== */
async function siparisler(v) {
  const snap = await getDocs(collection(db, 'orders'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));
  v.innerHTML = `<div class="lab">Müşteri siparişleri</div><h2 style="margin:8px 0 18px">Siparişler</h2>
   <div class="row" style="margin-bottom:16px"><select class="in" id="fs" style="max-width:220px"><option value="">Tüm durumlar</option>${opt(STATUS)}</select></div>
   <div class="card scroll"><table class="tbl"><thead><tr><th>No</th><th>Tarih</th><th>Müşteri</th><th>Kombinler</th><th class="num">Tutar</th><th>Referans</th><th>Durum</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
  const draw = () => {
    const f = $('#fs').value;
    $('#tb').innerHTML = list.filter(o => !f || o.status === f).map(o => `<tr>
     <td><b>#${o.id.slice(0, 6).toUpperCase()}</b></td><td>${fmtDate(o.createdAt, 1)}</td>
     <td>${esc(o.address?.name || '')}<div class="muted" style="font-size:12px">${esc(o.email || '')}</div></td>
     <td style="font-size:12.5px">${(o.items || []).map(i => esc(i.name)).join('<br>')}</td><td class="num">${tl(o.total)}</td>
     <td>${o.refCode ? `<span class="badge gold">${esc(o.refCode)}</span>` : '<span class="muted">-</span>'}</td>
     <td><select class="in" data-s="${o.id}" style="min-width:150px;padding:8px 10px">${opt(STATUS, o.status)}</select></td>
     <td><button class="btn sm ghost" data-d="${o.id}">Detay</button></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">Sipariş yok</div></td></tr>';
    $$('[data-s]').forEach(s => s.onchange = async () => { const o = list.find(x => x.id === s.dataset.s); await setOrderStatus(o, s.value); toast('Durum güncellendi: ' + STATUS[s.value]); badges(); });
    $$('[data-d]').forEach(b => b.onclick = () => orderDetail(list.find(x => x.id === b.dataset.d)));
  };
  $('#fs').onchange = draw; draw();
}
async function setOrderStatus(o, st) {
  const hist = [...(o.history || []), { status: st, at: new Date().toISOString() }];
  await updateDoc(doc(db, 'orders', o.id), { status: st, history: hist }); o.status = st; o.history = hist;
  await syncCommission(o);
}
// Komisyonu siparişin gerçek verisinden yeniden hesaplar (müşterinin yazdığı tutara güvenmez).
async function syncCommission(o) {
  if (!o.refCode) return;
  const ref = await getDoc(doc(db, 'refSales', o.id));
  const rc = await getDoc(doc(db, 'refCodes', o.refCode));
  if (!rc.exists()) return;
  const custom = rc.data().customRates || {};
  const lines = commissionLines(o.items || [], { kombinId: o.refKombinId || null }, S, custom);
  // tamamen iade/iptal edilen sipariş komisyon üretmez
  const status = ['iptal', 'iade'].includes(o.status) ? 'iptal' : o.status === 'teslim' ? 'onayli' : 'beklemede';
  const prev = ref.exists() ? ref.data() : {};
  if (prev.status === 'odendi') return;
  await setDoc(doc(db, 'refSales', o.id), {
    code: o.refCode, infUid: rc.data().uid, uid: o.uid, orderNo: o.id.slice(0, 6).toUpperCase(), lines,
    total: o.total, net: round2(lines.reduce((s, l) => s + l.net, 0)), commission: round2(lines.reduce((s, l) => s + l.commission, 0)),
    status, createdAt: prev.createdAt || o.createdAt || serverTimestamp(), updatedAt: serverTimestamp()
  });
}
function orderDetail(o) {
  modal(`<div class="lab">Sipariş #${o.id.slice(0, 6).toUpperCase()}</div><h2 style="margin:8px 0 6px">${tl(o.total)}</h2><p class="muted">${fmtDate(o.createdAt, 1)} · ${STATUS[o.status]}</p>
   <div class="sep"></div>${(o.items || []).map(i => `<div style="margin-bottom:16px"><b class="serif" style="font-size:18px">${esc(i.name)}</b>
     <table class="tbl" style="margin-top:8px"><tr><th>Parça</th><th>Marka</th><th>Beden</th><th class="num">Fiyat</th><th>Kaynak</th></tr>
     ${i.products.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.brand)}</td><td><b>${esc(p.size)}</b></td><td class="num">${tl(p.price)}</td><td>${CAT.products[p.pid]?.sourceUrl ? `<a class="link" href="${esc(CAT.products[p.pid].sourceUrl)}" target="_blank">Aç</a>` : '-'}</td></tr>`).join('')}</table></div>`).join('')}
   <div class="sep"></div><div class="lab">Teslimat</div><p style="margin-top:8px;line-height:1.7">${esc(o.address?.name)} · ${esc(o.address?.phone)}<br>${esc(o.address?.line)}<br>${esc(o.address?.district)} / ${esc(o.address?.city)}</p>
   <div class="sep"></div><div class="lab">Geçmiş</div><p class="muted" style="margin-top:8px;font-size:13px;line-height:1.8">${(o.history || []).map(h => `${fmtDate(h.at, 1)} · ${STATUS[h.status] || h.status}`).join('<br>')}</p>`);
}

/* =============== İADE VE DEĞİŞİM =============== */
async function iadeler(v) {
  const snap = await getDocs(collection(db, 'returns'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));
  v.innerHTML = `<div class="lab">Müşteri talepleri</div><h2 style="margin:8px 0 6px">İade ve değişim</h2>
   <p class="muted" style="margin-bottom:18px;font-size:13px">Her müşterinin ayda ${S.freeReturnsPerMonth} iade/değişim hakkı ücretsiz; sonrakilerde ${tl(S.returnFee)} kesilir. Ayarlar sekmesinden değişir.</p>
   <div class="card scroll"><table class="tbl"><thead><tr><th>Tarih</th><th>Sipariş</th><th>Tür</th><th>Parçalar</th><th class="num">Kesinti</th><th class="num">İade tutarı</th><th>Durum</th><th></th></tr></thead><tbody>
   ${list.map(r => `<tr><td>${fmtDate(r.createdAt, 1)}</td><td>#${esc((r.orderId || '').slice(0, 6).toUpperCase())}</td>
     <td><span class="badge ${r.type === 'iade' ? 'warn' : 'gold'}">${r.type === 'iade' ? 'Kombin iadesi' : 'Beden değişimi'}</span></td>
     <td style="font-size:12.5px">${(r.items || []).map(i => `${esc(i.name)}${r.type === 'degisim' ? ` <b>${esc(i.size)} → ${esc(i.newSize)}</b>` : ''}`).join('<br>')}<div class="muted">${esc(r.reason || '')}</div></td>
     <td class="num">${r.free ? '<span class="badge ok">Ücretsiz</span>' : tl(r.fee)}</td><td class="num">${r.type === 'iade' ? tl(r.refund) : '-'}</td>
     <td><span class="badge ${r.status === 'red' ? 'bad' : r.status === 'talep' ? 'warn' : 'ok'}">${RET_STATUS[r.status]}</span></td>
     <td class="num">${r.status === 'talep' ? `<button class="btn sm" data-ok="${r.id}">Onayla</button> <button class="btn sm danger" data-no="${r.id}">Reddet</button>` : r.status === 'onay' ? `<button class="btn sm ghost" data-done="${r.id}">Tamamlandı</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">Talep yok</div></td></tr>'}
   </tbody></table></div>`;
  const upd = async (id, st) => {
    const r = list.find(x => x.id === id);
    await updateDoc(doc(db, 'returns', id), { status: st, updatedAt: serverTimestamp() });
    if (st === 'tamam' && r.type === 'iade') {
      const o = await getDoc(doc(db, 'orders', r.orderId));
      if (o.exists()) await setOrderStatus({ id: o.id, ...o.data() }, 'iade');
    }
    go('iadeler'); badges();
  };
  $$('[data-ok]').forEach(b => b.onclick = () => upd(b.dataset.ok, 'onay'));
  $$('[data-no]').forEach(b => b.onclick = () => upd(b.dataset.no, 'red'));
  $$('[data-done]').forEach(b => b.onclick = () => upd(b.dataset.done, 'tamam'));
}

/* =============== INFLUENCERLAR =============== */
async function influencer(v) {
  const [inf, rs, pay, cl] = await Promise.all([getDocs(collection(db, 'influencers')), getDocs(collection(db, 'refSales')), getDocs(collection(db, 'payouts')), getDocs(collection(db, 'clicks'))]);
  const sales = rs.docs.map(d => ({ id: d.id, ...d.data() })), pays = pay.docs.map(d => ({ id: d.id, ...d.data() })), clicks = cl.docs.map(d => d.data());
  const list = inf.docs.map(d => ({ id: d.id, ...d.data() }));
  const sum = (uid, st) => round2(sales.filter(s => s.infUid === uid && (!st || st.includes(s.status))).reduce((a, s) => a + s.commission, 0));
  v.innerHTML = `<div class="lab">Satış ortakları</div><h2 style="margin:8px 0 18px">Influencerlar</h2>
   <div class="card scroll"><table class="tbl"><thead><tr><th>Influencer</th><th>Kod</th><th>Vergi</th><th class="num">Tıklama</th><th class="num">Sipariş</th><th class="num">Bekleyen</th><th class="num">Ödenebilir</th><th class="num">Ödenen</th><th>Durum</th><th></th></tr></thead><tbody>
   ${list.map(i => `<tr><td><b>${esc(i.name)}</b><div class="muted" style="font-size:12px">${esc(i.handles || '')} · ${esc(i.followers || '')} takipçi</div></td>
     <td>${i.code ? `<span class="badge gold">${esc(i.code)}</span>` : '-'}</td><td>${i.taxType === 'sirket' ? 'Şirket' : '20/B'}</td>
     <td class="num">${clicks.filter(c => c.infUid === i.id).length}</td><td class="num">${sales.filter(s => s.infUid === i.id && s.status !== 'iptal').length}</td>
     <td class="num">${tl(sum(i.id, ['beklemede']))}</td><td class="num"><b>${tl(sum(i.id, ['onayli']))}</b></td><td class="num">${tl(sum(i.id, ['odendi']))}</td>
     <td><span class="badge ${i.status === 'aktif' ? 'ok' : i.status === 'red' ? 'bad' : 'warn'}">${{ basvuru: 'Başvuru', aktif: 'Aktif', red: 'Reddedildi', durduruldu: 'Durduruldu' }[i.status]}</span></td>
     <td class="num"><button class="btn sm ghost" data-i="${i.id}">Yönet</button></td></tr>`).join('') || '<tr><td colspan="10"><div class="empty">Henüz başvuru yok. Influencerlar /influencer sayfasından başvurur.</div></td></tr>'}
   </tbody></table></div>`;
  $$('[data-i]').forEach(b => b.onclick = () => infManage(list.find(x => x.id === b.dataset.i), sales, pays));
}
function infManage(i, sales, pays) {
  const my = sales.filter(s => s.infUid === i.id), payable = my.filter(s => s.status === 'onayli');
  const gross = round2(payable.reduce((a, s) => a + s.commission, 0)), stop = i.taxType === 'sirket' ? 0 : S.stopaj, net = round2(gross * (1 - stop / 100));
  const cr = i.customRates || {};
  modal(`<div class="lab">Influencer</div><h2 style="margin:8px 0 4px">${esc(i.name)}</h2><p class="muted">${esc(i.email || '')} · ${esc(i.handles || '')} · ${esc(i.followers || '')} takipçi</p>
   <p class="muted" style="font-size:13px;margin-top:6px">Vergi: ${i.taxType === 'sirket' ? 'Şirket (fatura keser)' : '20/B istisna belgesi (stopaj %' + S.stopaj + ')'} · IBAN: ${esc(i.iban || '-')}</p>
   <div class="sep"></div>
   <div class="grid g2"><label class="f">Referans kodu (link: ?ref=kod)<input class="in" id="ic" value="${esc(i.code || slug(i.name))}"></label>
    <label class="f">Durum<select class="in" id="is">${opt({ basvuru: 'Başvuru', aktif: 'Aktif', red: 'Reddedildi', durduruldu: 'Durduruldu' }, i.status)}</select></label></div>
   <div class="lab" style="margin-top:20px">Bu influencera özel komisyon (boş = genel oran)</div>
   <table class="tbl rates" style="margin-top:8px"><tr><th>Kategori</th><th>Genel</th><th>Özel</th></tr>
   ${Object.entries(CATEGORIES).map(([k, l]) => `<tr><td>${l}</td><td>${pct(S.commissions[k])}</td><td><input class="in" type="number" step="0.1" data-cr="${k}" value="${cr[k] ?? ''}" placeholder="-"></td></tr>`).join('')}</table>
   <div class="row" style="margin-top:16px"><button class="btn" id="isave">Kaydet</button></div>
   <div class="sep"></div><div class="lab">Ödeme</div>
   <p style="margin-top:10px;line-height:1.8">Ödenebilir (onaylı) komisyon: <b>${tl(gross)}</b>${stop ? ` · Stopaj %${stop}: −${tl(gross - net)}` : ''} · <b style="color:var(--gold2)">Net ödeme: ${tl(net)}</b></p>
   <button class="btn ghost" id="ipay" ${gross > 0 ? '' : 'disabled'}>Ödeme yapıldı olarak işaretle</button>
   <p class="muted" style="font-size:12px;margin-top:8px">Banka transferini kendin yapıp burada kaydedersin.</p>
   <table class="tbl" style="margin-top:14px"><tr><th>Tarih</th><th class="num">Brüt</th><th class="num">Stopaj</th><th class="num">Net</th></tr>
   ${pays.filter(p => p.infUid === i.id).map(p => `<tr><td>${fmtDate(p.at)}</td><td class="num">${tl(p.gross)}</td><td class="num">${tl(p.stopaj)}</td><td class="num">${tl(p.net)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Ödeme yok</td></tr>'}</table>`);
  $('#isave').onclick = async () => {
    const code = slug($('#ic').value), status = $('#is').value, customRates = {};
    $$('[data-cr]').forEach(x => { if (x.value !== '') customRates[x.dataset.cr] = +x.value; });
    if (!code) return toast('Kod gerekli', 'bad');
    const ex = await getDoc(doc(db, 'refCodes', code));
    if (ex.exists() && ex.data().uid !== i.id) return toast('Bu kod başka bir influencera ait', 'bad');
    if (i.code && i.code !== code) await deleteDoc(doc(db, 'refCodes', i.code));
    await updateDoc(doc(db, 'influencers', i.id), { code, status, customRates, updatedAt: serverTimestamp() });
    if (status === 'aktif') await setDoc(doc(db, 'refCodes', code), { uid: i.id, customRates });
    else await deleteDoc(doc(db, 'refCodes', code)).catch(() => {});
    closeModal(); go('influencer'); badges(); toast('Kaydedildi');
  };
  $('#ipay').onclick = async () => {
    if (!confirm(`${tl(net)} ödeme yapıldı olarak kaydedilsin mi?`)) return;
    const pr = await addDoc(collection(db, 'payouts'), { infUid: i.id, gross, stopaj: round2(gross - net), net, count: payable.length, at: serverTimestamp() });
    const b = writeBatch(db); payable.forEach(s => b.update(doc(db, 'refSales', s.id), { status: 'odendi', payoutId: pr.id })); await b.commit();
    closeModal(); go('influencer'); toast('Ödeme kaydedildi');
  };
}
const slug = s => String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '').slice(0, 20);

/* =============== AYARLAR =============== */
async function ayarlar(v) {
  resetSettingsCache(); S = await getSettings();
  v.innerHTML = `<div class="lab">Gelir ve kurallar</div><h2 style="margin:8px 0 18px">Komisyon ve ayarlar</h2>
   <div class="grid g2">
   <div class="card gold"><div class="lab">Kategori bazlı influencer komisyonu</div>
    <table class="tbl rates" style="margin-top:10px"><tr><th>Kategori</th><th>Komisyon %</th><th>KDV %</th></tr>
    ${Object.entries(CATEGORIES).map(([k, l]) => `<tr><td>${l}</td><td><input class="in" type="number" step="0.1" data-c="${k}" value="${S.commissions[k]}"></td><td><input class="in" type="number" step="1" data-k="${k}" value="${S.kdv[k]}"></td></tr>`).join('')}</table>
    <div class="grid g2" style="margin-top:14px">
     <label class="f">Link dışı alışveriş komisyonu %<input class="in" type="number" step="0.1" id="sol" value="${S.offLinkRate}"></label>
     <label class="f">Referans geçerlilik süresi (saat)<input class="in" type="number" id="sck" value="${S.cookieHours}"></label>
     <label class="f">Stopaj % (20/B belgeli)<input class="in" type="number" step="0.1" id="sst" value="${S.stopaj}"></label></div>
    <p class="muted" style="font-size:12px;margin-top:12px;line-height:1.6">Komisyon KDV hariç tutar üzerinden hesaplanır. İptal ve tam iadelerde komisyon düşer. Link dışı: influencer linkiyle gelen müşterinin linkteki kombin dışında aldığı kombinler. KDV oranlarını mali müşavirinle teyit et.</p></div>
   <div class="card gold"><div class="lab">İade ve değişim</div>
    <div class="grid g2" style="margin-top:12px">
     <label class="f">Aylık ücretsiz hak<input class="in" type="number" id="sfr" value="${S.freeReturnsPerMonth}"></label>
     <label class="f">Sonraki her iade/değişim kesintisi (TL)<input class="in" type="number" step="0.01" id="srf" value="${S.returnFee}"></label>
     <label class="f">İade süresi (gün)<input class="in" type="number" id="srw" value="${S.returnWindowDays}"></label></div>
    <div class="lab" style="margin-top:22px">Kombin üretimi ve vitrin</div>
    <div class="grid g2" style="margin-top:12px">
     <label class="f">Bir ürün en fazla kaç kombinde<input class="in" type="number" id="smu" value="${S.maxUsage ?? 3}"></label>
     <label class="f">Günlük öneride kombin sayısı<input class="in" type="number" id="sdc" value="${S.dailyCount}"></label></div></div>
   </div>
   <div class="row" style="margin-top:18px"><button class="btn" id="ssave">Ayarları kaydet</button></div>
   <div class="card" style="margin-top:28px"><div class="lab">Gemini (görsel üretimi)</div>
    <p class="muted" style="font-size:13px;margin:10px 0 14px;line-height:1.6">Anahtar yalnızca bu tarayıcıda saklanır; veritabanına ya da siteye yazılmaz.</p>
    <div class="grid g2"><label class="f">API anahtarı<input class="in" type="password" id="gk" value="${esc(localStorage.getItem('iy_gemini_key') || '')}" autocomplete="off"></label>
     <label class="f">Model<select class="in" id="gm">${['gemini-3-pro-image', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'].map(m => `<option ${m === (localStorage.getItem('iy_gemini_model') || 'gemini-3-pro-image') ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="gsave">Kaydet</button></div></div>`;
  $('#ssave').onclick = async () => {
    const commissions = {}, kdv = {};
    $$('[data-c]').forEach(i => commissions[i.dataset.c] = +i.value); $$('[data-k]').forEach(i => kdv[i.dataset.k] = +i.value);
    const data = { commissions, kdv, offLinkRate: +$('#sol').value, cookieHours: +$('#sck').value, stopaj: +$('#sst').value,
      freeReturnsPerMonth: +$('#sfr').value, returnFee: +$('#srf').value, returnWindowDays: +$('#srw').value, maxUsage: +$('#smu').value, dailyCount: +$('#sdc').value, updatedAt: serverTimestamp() };
    await setDoc(doc(db, 'settings', 'main'), data, { merge: true }); resetSettingsCache(); S = await getSettings(); toast('Ayarlar kaydedildi');
  };
  $('#gsave').onclick = () => { localStorage.setItem('iy_gemini_key', $('#gk').value.trim()); localStorage.setItem('iy_gemini_model', $('#gm').value); toast('Gemini ayarı bu tarayıcıya kaydedildi'); };
}

/* =============== ARAÇLAR =============== */
async function araclar(v) {
  v.innerHTML = `<div class="lab">Kurulum</div><h2 style="margin:8px 0 18px">Araçlar</h2>
   <div class="card"><b>Örnek verileri yükle</b><p class="muted" style="margin:8px 0 14px;font-size:13px;line-height:1.6">Varsayılan ayarları, 10 Koton ürününü ve hazır görselli 3 kombini veritabanına ekler. Mevcut ürünlere dokunmaz. Koton görselleri yalnızca test içindir.</p>
   <button class="btn" id="seed">Örnek verileri yükle</button></div>`;
  $('#seed').onclick = async b => { $('#seed').disabled = true; try { await seed(); await reloadCatalog(); toast('Örnek veriler yüklendi'); go('kombinler'); } catch (e) { toast(e.message, 'bad'); $('#seed').disabled = false; } };
}
async function seed() {
  await setDoc(doc(db, 'settings', 'main'), { ...DEFAULT_SETTINGS, maxUsage: 3 }, { merge: true });
  const W = ['XS', 'S', 'M', 'L', 'XL'], WN = ['34', '36', '38', '40', '42'], MT = ['S', 'M', 'L', 'XL', 'XXL'], MP = ['30', '31', '32', '34', '36'];
  const img = k => [1, 2, 3].map(i => `/assets/koton/${k}-${i}.jpg`);
  const P = {
    k1_kaban: { name: 'Kuşaklı kaşe kaban', type: 'dis', gender: 'kadin', world: 'tanidik', colors: ['gri'], styles: ['Ofis', 'Klasik'], price: 3999.99, sizes: WN },
    k1_gomlek: { name: 'Saten gömlek', type: 'ust', gender: 'kadin', world: 'tanidik', colors: ['siyah'], styles: ['Ofis', 'Davet'], price: 1599.99, sizes: W },
    k1_pantolon: { name: 'Cigarette pantolon', type: 'alt', gender: 'kadin', world: 'tanidik', colors: ['siyah'], styles: ['Ofis', 'Klasik', 'Minimal'], price: 1799.99, sizes: WN },
    k1_canta: { name: 'Kapaklı el çantası', type: 'canta', gender: 'kadin', world: 'tanidik', colors: ['siyah'], styles: ['Ofis', 'Klasik'], price: 749.99, sizes: ['Tek beden'] },
    k2_ceket: { name: 'Bomber ceket', type: 'dis', gender: 'kadin', world: 'kesif', colors: ['kahve'], styles: ['Günlük', 'Sokak'], price: 2799.99, sizes: W },
    k2_etek: { name: 'Kemerli midi etek', type: 'alt', gender: 'kadin', world: 'kesif', colors: ['bordo'], styles: ['Günlük', 'Klasik'], price: 1399.99, sizes: WN },
    k2_canta: { name: 'Süet omuz çantası', type: 'canta', gender: 'kadin', world: 'kesif', colors: ['kahve'], styles: ['Günlük'], price: 1299.99, sizes: ['Tek beden'] },
    k3_ceket: { name: 'Kaşe ceket', type: 'dis', gender: 'erkek', world: 'imza', colors: ['siyah'], styles: ['Davet', 'Minimal'], price: 2999.99, sizes: MT },
    k3_gomlek: { name: 'Klasik yaka gömlek', type: 'ust', gender: 'erkek', world: 'imza', colors: ['siyah'], styles: ['Davet', 'Ofis', 'Minimal'], price: 1499.99, sizes: MT },
    k3_pantolon: { name: 'Pileli kumaş pantolon', type: 'alt', gender: 'erkek', world: 'imza', colors: ['siyah'], styles: ['Davet', 'Ofis'], price: 1599.99, sizes: MP }
  };
  const b = writeBatch(db);
  for (const [id, p] of Object.entries(P)) b.set(doc(db, 'products', id), { ...p, brand: 'Koton', category: TYPES[p.type].cat, images: img(id), active: true, demo: true, createdAt: serverTimestamp() });
  const K = [
    { id: 'demo-1', name: 'Gri Kaban Günü', occ: 'Ofis', desc: 'Gri kaşe kabanın altında siyah saten ve dar paça. Toplantıdan yemeğe değiştirmeden gider.', gender: 'kadin', world: 'tanidik', styles: ['Ofis', 'Klasik'], productIds: ['k1_kaban', 'k1_gomlek', 'k1_pantolon', 'k1_canta'], image: '/assets/img/kombin-1.jpg' },
    { id: 'demo-2', name: 'Sonbahar Yürüyüşü', occ: 'Hafta sonu', desc: 'Kahve bomber, bordo midi etek ve süet çanta. Sıcak tonlar, rahat bir kesim.', gender: 'kadin', world: 'kesif', styles: ['Günlük'], productIds: ['k2_ceket', 'k2_etek', 'k2_canta'], image: '/assets/img/kombin-2.jpg' },
    { id: 'demo-3', name: 'Siyahın Üç Hali', occ: 'Akşam ve davet', desc: 'Kaşe ceket, pamuk gömlek, pileli pantolon. Üçü de siyah, üçü de farklı dokuda.', gender: 'erkek', world: 'imza', styles: ['Davet', 'Minimal'], productIds: ['k3_ceket', 'k3_gomlek', 'k3_pantolon'], image: '/assets/img/kombin-3.jpg' }
  ];
  for (const k of K) { const { id, ...d } = k; b.set(doc(db, 'kombins', id), { ...d, status: 'yayinda', demo: true, score: 10, createdAt: serverTimestamp(), publishedAt: serverTimestamp() }); }
  await b.commit(); resetSettingsCache(); S = await getSettings();
}
