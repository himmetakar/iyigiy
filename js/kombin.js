// Kombin detay sayfası (paylaşılabilir link)
import { db, fs, mountNav, loadKombinImage, kombinTotal, addToCart, localProfile, recommendSize, pairingText, WORLDS, tl, esc, toast, $, $$ } from './app.js';
const { doc, getDoc } = fs;
mountNav('list');
const root = $('#root');
const id = new URLSearchParams(location.search).get('id');
const prof = localProfile();

const sizeSel = p => p.sizes?.length > 1
  ? `<select class="in" data-p="${p.id}">${p.sizes.map(s => `<option ${s === recommendSize(p.sizes, prof.h, prof.k) ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`
  : `<select class="in" data-p="${p.id}"><option>${esc(p.sizes?.[0] || 'Tek beden')}</option></select>`;

try {
  const ks = await getDoc(doc(db, 'kombins', id || '-'));
  if (!ks.exists()) throw new Error('yok');
  const k = { id: ks.id, ...ks.data() };
  const load = ids => Promise.all((ids || []).map(pid => getDoc(doc(db, 'products', pid)))).then(a => a.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
  const [ps, ex] = await Promise.all([load(k.productIds), load(k.extraIds)]);
  const products = Object.fromEntries([...ps, ...ex].map(p => [p.id, p]));
  const base = kombinTotal(k, products);
  document.title = 'iyigiy · ' + k.name;
  root.innerHTML = `<div class="kd"><div class="hero" id="hero"></div><div>
    <a class="link" href="/kombinler" style="font-size:13px">← Tüm kombinler</a>
    <div class="lab" style="margin-top:22px">${WORLDS[k.world]} · ${esc(k.occ || '')}</div><h1 style="margin:10px 0 14px">${esc(k.name)}</h1>
    <p class="muted" style="line-height:1.7;max-width:560px">${esc(k.desc || '')}</p>
    <div class="pcs">${ps.map(p => `<div class="pc"><img src="${esc(p.images?.[0] || '')}" data-g="${p.id}" alt="${esc(p.name)}"><div><b>${esc(p.name)}</b><div class="muted" style="font-size:13px;margin-top:4px">${tl(p.price)}</div>
      ${p.sizes?.length > 1 && prof.h ? `<div style="font-size:12px;color:var(--gold2);margin-top:6px">Ölçülerinize göre: ${esc(recommendSize(p.sizes, prof.h, prof.k))}</div>` : ''}</div>${sizeSel(p)}</div>`).join('')}</div>
    ${ex.length ? `<div class="pair card gold" style="margin-top:22px"><div class="lab">Birlikte iyi gider</div><p style="margin:8px 0 4px;font-family:var(--serif);font-size:19px">${esc(pairingText(ex))}</p>
      <p class="muted" style="font-size:12.5px">Kombin fiyatına dahil değildir; isterseniz ekleyin.</p>
      <div class="pcs" style="margin-top:12px">${ex.map(p => `<div class="pc"><img src="${esc(p.images?.[0] || '')}" data-g="${p.id}" alt="${esc(p.name)}"><div><b>${esc(p.name)}</b><div class="muted" style="font-size:13px;margin-top:4px">+${tl(p.price)}</div>
        <label class="check" style="margin-top:8px"><input type="checkbox" data-x="${p.id}"> Kombine ekle</label></div>${sizeSel(p)}</div>`).join('')}</div></div>` : ''}
    <div class="seal"><i></i><span>Markalar mühürlü. Ödeme adımında, siparişi onaylamadan önce açıklanır.</span></div>
    <div class="between" style="margin-top:26px"><div><b class="serif" style="font-size:34px;color:var(--gold2)" id="tot">${tl(base)}</b><div class="muted" style="font-size:12px" id="totx"></div></div><button class="btn" id="add">Kombini sepete ekle</button></div>
    <p class="muted" style="font-size:12.5px;margin-top:14px">Her ay 1 iade ya da beden değişimi ücretsiz.</p></div></div>`;
  const chosen = () => $$('[data-x]').filter(c => c.checked).map(c => c.dataset.x);
  const upd = () => { const xs = chosen(), add = xs.reduce((s, i) => s + (+products[i].price || 0), 0);
    $('#tot').textContent = tl(base + add); $('#totx').textContent = xs.length ? `Kombin ${tl(base)} + eşlik eden ${tl(add)}` : ''; };
  $$('[data-x]').forEach(c => c.onchange = upd);
  loadKombinImage(k).then(s => { $('#hero').style.backgroundImage = `url("${s || ps[0]?.images?.[0] || ''}")`; });
  $('#add').onclick = () => { const sizes = {}; $$('[data-p]').forEach(s => sizes[s.dataset.p] = s.value); addToCart(k.id, sizes, chosen());
    toast('Sepete eklendi'); $('#add').outerHTML = '<a class="btn" href="/sepet">Sepete git →</a>'; };
  $$('[data-g]').forEach(i => i.onclick = () => { const p = products[i.dataset.g];
    $('#mbody').innerHTML = `<div class="lab">${esc(k.name)}</div><h2 style="margin:8px 0 16px">${esc(p.name)}</h2><div class="gal">${(p.images || []).map(s => `<img src="${esc(s)}" alt="">`).join('')}</div>`;
    $('#modal').classList.add('on'); });
} catch (e) {
  console.warn(e);
  root.innerHTML = `<div class="empty">Bu kombin bulunamadı ya da artık yayında değil. <a class="link" href="/kombinler">Tüm kombinler</a></div>`;
}
