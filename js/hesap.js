// Müşteri hesabı: giriş, siparişler, iade/değişim, profil
import {
  auth, db, fs, authApi, onUser, googleSignIn, logout, mountNav, getSettings, STATUS, RET_STATUS, STYLES,
  tl, esc, fmtDate, toDate, toast, $, $$, monthKey, returnFeeFor, localProfile, saveLocalProfile, isAdminUser
} from './app.js';
const { doc, getDoc, getDocs, setDoc, addDoc, collection, query, where, serverTimestamp } = fs;
mountNav('account');
const root = $('#root');
const modal = h => { $('#mbody').innerHTML = h; $('#modal').classList.add('on'); };
const closeModal = () => $('#modal').classList.remove('on');
let U, S, TAB = location.hash.slice(1) || 'siparisler';

onUser(async u => { U = u; S = await getSettings(); u ? shell() : authView(); });

/* ---------- giriş / kayıt ---------- */
function authView(mode = 'giris') {
  const next = new URLSearchParams(location.search).get('next');
  root.innerHTML = `<div class="auth card gold"><div class="lab">${mode === 'giris' ? 'Hoş geldiniz' : 'Yeni hesap'}</div>
   <h2 style="margin:10px 0 22px">${mode === 'giris' ? 'Giriş yapın' : 'Hesap oluşturun'}</h2>
   <button class="btn ghost" id="g" style="width:100%">Google ile devam et</button>
   <div class="row" style="margin:20px 0;color:var(--mute);font-size:12px"><span style="flex:1;height:1px;background:var(--line2)"></span>ya da<span style="flex:1;height:1px;background:var(--line2)"></span></div>
   <div class="grid">${mode === 'kayit' ? '<label class="f">Ad soyad<input class="in" id="n" autocomplete="name"></label>' : ''}
    <label class="f">E-posta<input class="in" id="e" type="email" autocomplete="email"></label>
    <label class="f">Şifre<input class="in" id="p" type="password" autocomplete="${mode === 'giris' ? 'current-password' : 'new-password'}"></label>
    ${mode === 'kayit' ? '<label class="check"><input type="checkbox" id="kv"> Kişisel verilerimin işlenmesine ilişkin aydınlatma metnini okudum.</label>' : ''}
    <button class="btn" id="go">${mode === 'giris' ? 'Giriş yap' : 'Hesap oluştur'}</button></div>
   <p class="muted" style="margin-top:18px;font-size:13px;text-align:center">${mode === 'giris'
      ? 'Hesabınız yok mu? <a class="link" id="sw">Kayıt olun</a> · <a class="link" id="fp">Şifremi unuttum</a>'
      : 'Zaten hesabınız var mı? <a class="link" id="sw">Giriş yapın</a>'}</p></div>`;
  const done = () => { if (next) location.href = next; };
  $('#g').onclick = () => googleSignIn().then(done).catch(err);
  $('#sw').onclick = () => authView(mode === 'giris' ? 'kayit' : 'giris');
  if ($('#fp')) $('#fp').onclick = () => { const e = $('#e').value.trim(); if (!e) return toast('Önce e-posta adresinizi yazın');
    authApi.sendPasswordResetEmail(auth, e).then(() => toast('Şifre sıfırlama bağlantısı gönderildi')).catch(err); };
  $('#go').onclick = async () => {
    const e = $('#e').value.trim(), p = $('#p').value;
    try {
      if (mode === 'giris') await authApi.signInWithEmailAndPassword(auth, e, p);
      else {
        if (!$('#kv').checked) return toast('Aydınlatma metnini onaylayın', 'bad');
        const c = await authApi.createUserWithEmailAndPassword(auth, e, p);
        await authApi.updateProfile(c.user, { displayName: $('#n').value.trim() });
      }
      done();
    } catch (x) { err(x); }
  };
}
function err(e) {
  const m = { 'auth/invalid-credential': 'E-posta ya da şifre hatalı', 'auth/email-already-in-use': 'Bu e-posta ile zaten bir hesap var',
    'auth/weak-password': 'Şifre en az 6 karakter olmalı', 'auth/invalid-email': 'E-posta adresi geçersiz', 'auth/popup-closed-by-user': 'Giriş penceresi kapatıldı',
    'auth/operation-not-allowed': 'Bu giriş yöntemi henüz açılmadı', 'auth/configuration-not-found': 'Giriş sistemi henüz yapılandırılmadı' }[e.code];
  toast(m || e.message, 'bad');
}

/* ---------- hesap kabuğu ---------- */
async function shell() {
  const prof = await ensureProfile();
  root.innerHTML = `<div class="between"><div><div class="lab">Hesabım</div><h1 style="margin-top:8px">Merhaba, <em>${esc((prof.name || U.displayName || U.email).split(' ')[0])}</em></h1></div>
    <div class="row">${isAdminUser(U) ? '<a class="btn ghost sm" href="/admin">Yönetim paneli</a>' : ''}<a class="btn ghost sm" href="/influencer">Influencer paneli</a><button class="btn ghost sm" id="lo">Çıkış</button></div></div>
   <div class="tabs" style="margin-top:28px"><button data-t="siparisler">Siparişlerim</button><button data-t="iadeler">İade ve değişim</button><button data-t="profil">Profil ve ölçüler</button></div>
   <section id="view"></section>`;
  $('#lo').onclick = () => logout().then(() => location.href = '/');
  $$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.t));
  go(TAB);
}
function go(t) {
  TAB = t; history.replaceState(null, '', location.pathname + location.search + '#' + t);
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  const v = $('#view'); v.innerHTML = '<div class="spin"></div>';
  ({ siparisler, iadeler, profil })[t](v).catch(e => { console.error(e); v.innerHTML = `<div class="empty">Hata: ${esc(e.message)}</div>`; });
}
async function ensureProfile() {
  const r = doc(db, 'users', U.uid), s = await getDoc(r);
  if (s.exists()) { const d = s.data(); saveLocalProfile({ ...localProfile(), ...d }); return d; }
  const lp = localProfile();
  const d = { name: U.displayName || '', email: U.email, gender: lp.kim || '', age: lp.yas || '', h: lp.h || '', k: lp.k || '', styles: lp.tarz || [], colors: lp.renk || '', budget: lp.butce || '', createdAt: serverTimestamp() };
  await setDoc(r, d); return d;
}

/* ---------- siparişler ---------- */
async function myOrders() {
  const s = await getDocs(query(collection(db, 'orders'), where('uid', '==', U.uid)));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));
}
async function myReturns() {
  const s = await getDocs(query(collection(db, 'returns'), where('uid', '==', U.uid)));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));
}
async function siparisler(v) {
  const [orders, rets] = await Promise.all([myOrders(), myReturns()]);
  if (!orders.length) { v.innerHTML = '<div class="empty">Henüz siparişiniz yok. <a class="link" href="/">Gardırobunuza</a> göz atın.</div>'; return; }
  v.innerHTML = orders.map(o => {
    const open = rets.find(r => r.orderId === o.id && ['talep', 'onay'].includes(r.status));
    const delivered = (o.history || []).find(h => h.status === 'teslim');
    const days = delivered ? (Date.now() - new Date(delivered.at)) / 864e5 : 0;
    const canReturn = o.status === 'teslim' && days <= S.returnWindowDays && !open;
    return `<div class="card ord"><div class="between"><div><span class="lab">Sipariş #${o.id.slice(0, 6).toUpperCase()}</span><div class="muted" style="font-size:13px;margin-top:6px">${fmtDate(o.createdAt, 1)}</div></div>
      <div class="row"><span class="badge ${o.status === 'teslim' ? 'ok' : o.status === 'iptal' || o.status === 'iade' ? 'bad' : 'warn'}">${STATUS[o.status]}</span><b class="serif" style="font-size:22px;color:var(--gold2)">${tl(o.total)}</b></div></div>
      <div class="items">${(o.items || []).map(i => `<div><b class="serif" style="font-size:17px">${esc(i.name)}</b>${i.products.map(p => `<div class="it"><span>${esc(p.name)} <span class="muted">· ${esc(p.brand)}</span></span><span>Beden <b>${esc(p.size)}</b> · ${tl(p.price)}</span></div>`).join('')}</div>`).join('')}</div>
      <div class="row" style="margin-top:14px">${canReturn ? `<button class="btn sm" data-r="${o.id}">İade / beden değişimi</button>` : ''}
       ${open ? `<span class="badge warn">${open.type === 'iade' ? 'İade' : 'Değişim'} talebi: ${RET_STATUS[open.status]}</span>` : ''}
       ${o.status === 'teslim' && !canReturn && !open ? `<span class="muted" style="font-size:12px">İade süresi (${S.returnWindowDays} gün) doldu</span>` : ''}
       ${o.status !== 'teslim' && !open ? `<span class="muted" style="font-size:12px">İade ve değişim teslimattan sonra açılır</span>` : ''}</div></div>`;
  }).join('');
  $$('[data-r]').forEach(b => b.onclick = () => returnForm(orders.find(o => o.id === b.dataset.r)));
}
async function returnForm(o) {
  const q = await returnFeeFor(U.uid);
  const allItems = (o.items || []).flatMap(i => i.products.map(p => ({ ...p, kombin: i.name })));
  const feeText = q.free ? `<span class="badge ok">Ücretsiz</span> Bu ay ${q.freeLeft} ücretsiz hakkınız var.`
    : `<span class="badge warn">${tl(q.fee)} kesinti</span> Bu ayki ücretsiz hakkınızı kullandınız.`;
  modal(`<div class="lab">Sipariş #${o.id.slice(0, 6).toUpperCase()}</div><h2 style="margin:8px 0 6px">İade ya da beden değişimi</h2>
   <p class="muted" style="font-size:13px;line-height:1.6">Her ay ${S.freeReturnsPerMonth} iade ya da değişim ücretsizdir; sonrakilerde ${tl(S.returnFee)} kesilir. Değişimler de bu hakka sayılır.</p>
   <p style="margin-top:12px;font-size:14px">${feeText}</p>
   <div class="retopt"><label><input type="radio" name="rt" value="iade" checked><div><b>Kombinin tamamını iade et</b><div class="muted" style="font-size:13px;margin-top:4px">Tüm parçalar geri gönderilir, ödeme ${q.free ? 'tamamen' : tl(q.fee) + ' kesinti ile'} iade edilir.</div></div></label>
    <label><input type="radio" name="rt" value="degisim"><div><b>Bazı parçalarda beden değişimi</b><div class="muted" style="font-size:13px;margin-top:4px">Seçtiğiniz parçalar yeni bedenle gönderilir${q.free ? '' : '; ' + tl(q.fee) + ' değişim ücreti alınır'}.</div></div></label></div>
   <div id="pickWrap" style="display:none"><span class="lab">Değişecek parçalar</span><div class="pick">${allItems.map((p, i) => {
     const sizes = (window.__P?.[p.pid]?.sizes) || [];
     return `<div class="r"><input type="checkbox" data-i="${i}" style="accent-color:var(--gold)"><span>${esc(p.name)} <span class="muted">· şu an ${esc(p.size)}</span></span>
      <select class="in" data-s="${i}" style="padding:8px 10px">${(sizes.length ? sizes : [p.size]).map(s => `<option ${s === p.size ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>`; }).join('')}</div></div>
   <label class="f" style="margin-top:16px">Neden? (isteğe bağlı)<textarea class="in" id="rr" placeholder="Ör. üst biraz dar geldi"></textarea></label>
   <div class="sep"></div><div class="between"><span class="muted" id="sum"></span><button class="btn" id="rs">Talebi gönder</button></div>`);
  // değişimde beden listesi için ürünleri yükle
  if (!window.__P) { const ps = await getDocs(collection(db, 'products')); window.__P = {}; ps.forEach(d => window.__P[d.id] = d.data()); returnForm(o); return; }
  const type = () => document.querySelector('input[name=rt]:checked').value;
  const upd = () => { $('#pickWrap').style.display = type() === 'degisim' ? '' : 'none';
    $('#sum').textContent = type() === 'iade' ? 'İade tutarı: ' + tl(o.total - q.fee) : (q.free ? 'Değişim ücretsiz' : 'Değişim ücreti: ' + tl(q.fee)); };
  $$('input[name=rt]').forEach(r => r.onchange = upd); upd();
  $('#rs').onclick = async () => {
    const t = type(); let items;
    if (t === 'iade') items = allItems.map(p => ({ pid: p.pid, name: p.name, size: p.size }));
    else {
      items = $$('[data-i]').filter(c => c.checked).map(c => { const p = allItems[+c.dataset.i]; return { pid: p.pid, name: p.name, size: p.size, newSize: document.querySelector(`[data-s="${c.dataset.i}"]`).value }; });
      if (!items.length) return toast('Değişecek en az bir parça seçin', 'bad');
      if (items.some(i => i.size === i.newSize)) return toast('Seçilen parçalarda yeni beden farklı olmalı', 'bad');
    }
    await addDoc(collection(db, 'returns'), { uid: U.uid, email: U.email, orderId: o.id, type: t, items, reason: $('#rr').value.trim(),
      free: q.free, fee: q.fee, refund: t === 'iade' ? Math.max(0, o.total - q.fee) : 0, month: monthKey(), status: 'talep', createdAt: serverTimestamp() });
    closeModal(); toast('Talebiniz alındı'); go('iadeler');
  };
}

/* ---------- iade listesi ---------- */
async function iadeler(v) {
  const [rets, q] = await Promise.all([myReturns(), returnFeeFor(U.uid)]);
  v.innerHTML = `<div class="card gold" style="margin-bottom:18px"><div class="between"><div><div class="lab">Bu ay (${monthKey()})</div>
    <p style="margin-top:8px">${q.freeLeft > 0 ? `<b>${q.freeLeft}</b> ücretsiz iade/değişim hakkınız var.` : `Ücretsiz hakkınızı kullandınız; sonraki iade ya da değişimlerde <b>${tl(S.returnFee)}</b> kesilir.`}</p></div>
    <span class="muted" style="font-size:12px">Haklar her ayın başında yenilenir.</span></div></div>
   ${rets.length ? `<div class="card scroll"><table class="tbl"><tr><th>Tarih</th><th>Sipariş</th><th>Tür</th><th>Parçalar</th><th class="num">Kesinti</th><th class="num">İade</th><th>Durum</th></tr>
   ${rets.map(r => `<tr><td>${fmtDate(r.createdAt)}</td><td>#${r.orderId.slice(0, 6).toUpperCase()}</td><td>${r.type === 'iade' ? 'Kombin iadesi' : 'Beden değişimi'}</td>
     <td style="font-size:12.5px">${r.items.map(i => esc(i.name) + (r.type === 'degisim' ? ` (${esc(i.size)} → ${esc(i.newSize)})` : '')).join('<br>')}</td>
     <td class="num">${r.free ? 'Ücretsiz' : tl(r.fee)}</td><td class="num">${r.type === 'iade' ? tl(r.refund) : '-'}</td>
     <td><span class="badge ${r.status === 'red' ? 'bad' : r.status === 'talep' ? 'warn' : 'ok'}">${RET_STATUS[r.status]}</span></td></tr>`).join('')}</table></div>`
   : '<div class="empty">İade ya da değişim talebiniz yok.</div>'}`;
}

/* ---------- profil ---------- */
async function profil(v) {
  const s = await getDoc(doc(db, 'users', U.uid)); const p = s.exists() ? s.data() : {};
  const a = p.address || {};
  v.innerHTML = `<div class="grid g2">
   <div class="card"><div class="lab">Ölçüler ve tercihler</div><p class="muted" style="font-size:13px;margin:8px 0 16px">Günlük önerileriniz ve beden tavsiyeleri bunlara göre hazırlanır.</p>
    <div class="grid g2"><label class="f">Ad soyad<input class="in" id="nm" value="${esc(p.name || '')}"></label>
     <label class="f">Kimin için<select class="in" id="gd"><option value="kadin" ${p.gender === 'kadin' ? 'selected' : ''}>Kadın</option><option value="erkek" ${p.gender === 'erkek' ? 'selected' : ''}>Erkek</option></select></label>
     <label class="f">Boy (cm)<input class="in" id="h" type="number" value="${p.h || ''}"></label><label class="f">Kilo (kg)<input class="in" id="k" type="number" value="${p.k || ''}"></label>
     <label class="f">Yaş aralığı<select class="in" id="ag">${['18-24', '25-34', '35-44', '45-54', '55+'].map(x => `<option ${x === p.age ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
     <label class="f">Kombin bütçesi<select class="in" id="bd">${["5.000 TL'ye kadar", '5.000 - 10.000 TL', '10.000 - 20.000 TL', '20.000 TL üzeri'].map(x => `<option ${x === p.budget ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
    <div class="f" style="margin-top:16px"><span>Tarzlar</span><div class="chips" id="st">${STYLES.map(x => `<button class="chip ${(p.styles || []).includes(x) ? 'on' : ''}">${x}</button>`).join('')}</div></div></div>
   <div class="card"><div class="lab">Teslimat adresi</div>
    <div class="grid" style="margin-top:16px"><label class="f">Telefon<input class="in" id="ph" value="${esc(a.phone || '')}" autocomplete="tel"></label>
     <div class="grid g2"><label class="f">İl<input class="in" id="ci" value="${esc(a.city || '')}"></label><label class="f">İlçe<input class="in" id="di" value="${esc(a.district || '')}"></label></div>
     <label class="f">Açık adres<textarea class="in" id="ln">${esc(a.line || '')}</textarea></label></div></div></div>
   <div class="row" style="margin-top:18px"><button class="btn" id="sv">Kaydet</button></div>`;
  $$('#st .chip').forEach(c => c.onclick = () => c.classList.toggle('on'));
  $('#sv').onclick = async () => {
    const d = { name: $('#nm').value.trim(), gender: $('#gd').value, h: +$('#h').value || '', k: +$('#k').value || '', age: $('#ag').value, budget: $('#bd').value,
      styles: $$('#st .chip.on').map(c => c.textContent), address: { name: $('#nm').value.trim(), phone: $('#ph').value.trim(), city: $('#ci').value.trim(), district: $('#di').value.trim(), line: $('#ln').value.trim() }, updatedAt: serverTimestamp() };
    await setDoc(doc(db, 'users', U.uid), d, { merge: true });
    saveLocalProfile({ ...localProfile(), kim: d.gender, yas: d.age, h: d.h, k: d.k, tarz: d.styles, butce: d.budget });
    toast('Profiliniz kaydedildi');
  };
}
