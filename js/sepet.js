// Sepet ve ödeme adımı
import {
  db, fs, onUser, mountNav, getSettings, loadCatalog, loadKombinImage, kombinTotal, getCart, setCart, activeRef, commissionLines,
  WORLDS, tl, esc, toast, $, $$, round2, localProfile, recommendSize
} from './app.js';
const { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } = fs;
mountNav('cart');
const root = $('#root');
let U = null, S, CAT, prof = {};
const modal = h => { $('#mbody').innerHTML = h; $('#modal').classList.add('on'); };

onUser(async u => {
  U = u; S = await getSettings(); CAT = CAT || await loadCatalog();
  if (u) { const s = await getDoc(doc(db, 'users', u.uid)); prof = s.exists() ? s.data() : {}; }
  render();
});

function lines() {
  return getCart().map(c => ({ c, k: CAT.kombins.find(k => k.id === c.kombinId) })).filter(x => x.k);
}
function render() {
  const L = lines();
  if (!L.length) { root.innerHTML = `<div class="lab">Sepet</div><h1 style="margin:8px 0 24px">Sepetiniz boş</h1><div class="empty">Gardırobunuzdan bir kombin seçin. <a class="link" href="/">Gardıroba git</a> · <a class="link" href="/kombinler">Tüm kombinler</a></div>`; return; }
  const total = L.reduce((s, x) => s + kombinTotal(x.k, CAT.products), 0);
  const a = prof.address || {};
  root.innerHTML = `<div class="lab">Sepet</div><h1 style="margin:8px 0 26px">${L.length} kombin</h1>
   <div class="lay"><div id="items"></div>
   <aside class="card gold sum"><div class="lab">Sipariş özeti</div>
    ${L.map(x => `<div class="r"><span>${esc(x.k.name)}</span><span>${tl(kombinTotal(x.k, CAT.products))}</span></div>`).join('')}
    <div class="r"><span class="muted">Kargo</span><span class="muted">Ücretsiz</span></div>
    <div class="sep" style="margin:10px 0"></div><div class="r" style="align-items:baseline"><span>Toplam</span><span class="t">${tl(total)}</span></div>
    <div class="sep"></div>
    ${U ? `<div class="lab">Teslimat</div>
     <div class="grid" style="margin-top:12px"><label class="f">Ad soyad<input class="in" id="an" value="${esc(a.name || prof.name || U.displayName || '')}" autocomplete="name"></label>
      <label class="f">Telefon<input class="in" id="ap" value="${esc(a.phone || '')}" autocomplete="tel"></label>
      <div class="grid g2"><label class="f">İl<input class="in" id="ac" value="${esc(a.city || '')}"></label><label class="f">İlçe<input class="in" id="ad" value="${esc(a.district || '')}"></label></div>
      <label class="f">Açık adres<textarea class="in" id="al">${esc(a.line || '')}</textarea></label></div>
     <div class="sep"></div>
     <div class="seal"><i></i><div><div class="lab">Mühür açıldı</div><div style="font-size:13px;margin-top:4px">Paketinizdeki markalar</div></div></div>
     <div class="brands">${L.flatMap(x => x.k.productIds.map(id => CAT.products[id]).filter(Boolean).map(p => `<div><span>${esc(p.name)}</span><b>${esc(p.brand)}</b></div>`)).join('')}</div>
     <div class="sep"></div>
     <label class="check"><input type="checkbox" id="c1"> <span><a class="link" data-doc="on">Ön bilgilendirme formunu</a> okudum.</span></label>
     <label class="check" style="margin-top:8px"><input type="checkbox" id="c2"> <span><a class="link" data-doc="ms">Mesafeli satış sözleşmesini</a> onaylıyorum.</span></label>
     <p class="note" style="margin-top:14px">Ödeme altyapısı henüz bağlı değil. Bu sipariş test siparişi olarak kaydedilir, kartınızdan ücret alınmaz.</p>
     <button class="btn" id="buy" style="width:100%;margin-top:14px">Siparişi tamamla</button>`
    : `<p class="muted" style="font-size:14px;line-height:1.6">Siparişi tamamlamak ve paketinizdeki markaları görmek için giriş yapın.</p>
       <a class="btn" style="width:100%;margin-top:14px" href="/hesap?next=/sepet">Giriş yap</a>`}
   </aside></div>`;
  const box = $('#items');
  L.forEach(({ c, k }) => {
    const el = document.createElement('div'); el.className = 'card ci';
    const ps = k.productIds.map(id => CAT.products[id]).filter(Boolean);
    el.innerHTML = `<div class="im" data-im></div><div><div class="between"><div><span class="lab">${WORLDS[k.world]} · ${esc(k.occ || '')}</span><h3 style="margin-top:6px">${esc(k.name)}</h3></div>
      <button class="link" data-rm style="font-size:13px">Kaldır</button></div>
      <div style="margin-top:12px">${ps.map(p => `<div class="pp"><span>${esc(p.name)}</span><select class="in" data-p="${p.id}">${(p.sizes || []).map(s => `<option ${s === (c.sizes?.[p.id] || recommendSize(p.sizes, prof.h || localProfile().h, prof.k || localProfile().k)) ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select><span style="text-align:right">${tl(p.price)}</span></div>`).join('')}</div></div>`;
    loadKombinImage(k).then(s => { if (s) el.querySelector('[data-im]').style.backgroundImage = `url("${s}")`; });
    el.querySelector('[data-rm]').onclick = () => { setCart(getCart().filter(x => x.kombinId !== k.id)); render(); };
    el.querySelectorAll('[data-p]').forEach(s => s.onchange = () => { const cart = getCart(); const it = cart.find(x => x.kombinId === k.id); it.sizes = { ...(it.sizes || {}), [s.dataset.p]: s.value }; setCart(cart); });
    // seçili bedenleri sepete yaz (önerilen bedenler varsayılan olsun)
    const cart = getCart(); const it = cart.find(x => x.kombinId === k.id); it.sizes = it.sizes || {};
    el.querySelectorAll('[data-p]').forEach(s => it.sizes[s.dataset.p] = it.sizes[s.dataset.p] || s.value); setCart(cart);
    box.appendChild(el);
  });
  $$('[data-doc]').forEach(a => a.onclick = e => { e.preventDefault(); legal(a.dataset.doc); });
  if ($('#buy')) $('#buy').onclick = checkout;
}
function legal(t) {
  modal(t === 'on' ? `<h2>Ön bilgilendirme formu</h2><p class="muted" style="margin-top:14px;line-height:1.7">Taslak metin: satıcı bilgileri, ürünlerin temel nitelikleri (markalar dahil), toplam fiyat, ödeme ve teslimat bilgileri, cayma hakkı (14 gün) ve iade koşulları (aylık 1 ücretsiz iade/değişim, sonrakilerde ${tl(S.returnFee)} kesinti) burada yer alacak. Yayından önce hukuk danışmanınızla hazırlanmalıdır.</p>`
    : `<h2>Mesafeli satış sözleşmesi</h2><p class="muted" style="margin-top:14px;line-height:1.7">Taslak metin: 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği'ne uygun sözleşme metni burada yer alacak. Yayından önce hukuk danışmanınızla hazırlanmalıdır.</p>`);
}
async function checkout() {
  const addr = { name: $('#an').value.trim(), phone: $('#ap').value.trim(), city: $('#ac').value.trim(), district: $('#ad').value.trim(), line: $('#al').value.trim() };
  if (Object.values(addr).some(v => !v)) return toast('Teslimat bilgilerini eksiksiz doldurun', 'bad');
  if (!$('#c1').checked || !$('#c2').checked) return toast('Ön bilgilendirme ve sözleşmeyi onaylayın', 'bad');
  const b = $('#buy'); b.disabled = true; b.textContent = 'Kaydediliyor…';
  try {
    const items = lines().map(({ c, k }) => ({ kombinId: k.id, name: k.name, world: k.world,
      products: k.productIds.map(id => CAT.products[id]).filter(Boolean).map(p => ({ pid: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price, size: c.sizes?.[p.id] || p.sizes?.[0] || '' })) }));
    const total = round2(items.reduce((s, i) => s + i.products.reduce((a, p) => a + p.price, 0), 0));
    const ref = await activeRef();
    const order = { uid: U.uid, email: U.email, items, total, address: addr, status: 'alindi', payment: 'test',
      history: [{ status: 'alindi', at: new Date().toISOString() }], createdAt: serverTimestamp() };
    if (ref && ref.infUid !== U.uid) { order.refCode = ref.code; order.refKombinId = ref.kombinId || null; }
    const o = await addDoc(collection(db, 'orders'), order);
    if (order.refCode) {
      try {
        const rc = await getDoc(doc(db, 'refCodes', ref.code));
        const ls = commissionLines(items, ref, S, rc.exists() ? rc.data().customRates || {} : {});
        await setDoc(doc(db, 'refSales', o.id), { code: ref.code, infUid: ref.infUid, uid: U.uid, orderNo: o.id.slice(0, 6).toUpperCase(), lines: ls, total,
          net: round2(ls.reduce((s, l) => s + l.net, 0)), commission: round2(ls.reduce((s, l) => s + l.commission, 0)), status: 'beklemede', createdAt: serverTimestamp() });
      } catch (e) { console.warn('refSale', e); }
    }
    await setDoc(doc(db, 'users', U.uid), { address: addr }, { merge: true });
    setCart([]);
    root.innerHTML = `<div style="max-width:620px;margin:8vh auto;text-align:center"><div class="lab">Teşekkürler</div><h1 style="margin:12px 0 14px">Siparişiniz <em>alındı</em></h1>
      <p class="muted">Sipariş numaranız <b style="color:var(--paper)">#${o.id.slice(0, 6).toUpperCase()}</b>. Durumunu Hesabım sayfasından takip edebilirsiniz.</p>
      <div class="row" style="justify-content:center;margin-top:28px"><a class="btn" href="/hesap#siparisler">Siparişlerim</a><a class="btn ghost" href="/">Gardıroba dön</a></div></div>`;
  } catch (e) { console.error(e); toast('Sipariş kaydedilemedi: ' + e.message, 'bad'); b.disabled = false; b.textContent = 'Siparişi tamamla'; }
}
