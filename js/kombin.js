// Kombin detay sayfası (paylaşılabilir link)
import { db, fs, mountNav, loadKombinImage, kombinTotal, addToCart, localProfile, recommendSize, WORLDS, tl, esc, toast, $, $$ } from './app.js';
const { doc, getDoc, getDocs, collection, query, where, documentId } = fs;
mountNav('list');
const root = $('#root');
const id = new URLSearchParams(location.search).get('id');
const prof = localProfile();

try {
  const ks = await getDoc(doc(db, 'kombins', id || '-'));
  if (!ks.exists()) throw new Error('yok');
  const k = { id: ks.id, ...ks.data() };
  const ps = (await Promise.all(k.productIds.map(pid => getDoc(doc(db, 'products', pid))))).filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));
  const products = Object.fromEntries(ps.map(p => [p.id, p]));
  document.title = 'iyigiy · ' + k.name;
  root.innerHTML = `<div class="kd"><div class="hero" id="hero"></div><div>
    <a class="link" href="/kombinler" style="font-size:13px">← Tüm kombinler</a>
    <div class="lab" style="margin-top:22px">${WORLDS[k.world]} · ${esc(k.occ || '')}</div><h1 style="margin:10px 0 14px">${esc(k.name)}</h1>
    <p class="muted" style="line-height:1.7;max-width:560px">${esc(k.desc || '')}</p>
    <div class="pcs">${ps.map(p => `<div class="pc"><img src="${esc(p.images?.[0] || '')}" data-g="${p.id}" alt="${esc(p.name)}"><div><b>${esc(p.name)}</b><div class="muted" style="font-size:13px;margin-top:4px">${tl(p.price)}</div>
      ${p.sizes?.length > 1 && prof.h ? `<div style="font-size:12px;color:var(--gold2);margin-top:6px">Ölçülerinize göre: ${esc(recommendSize(p.sizes, prof.h, prof.k))}</div>` : ''}</div>
      <select class="in" data-p="${p.id}">${(p.sizes || []).map(s => `<option ${s === recommendSize(p.sizes, prof.h, prof.k) ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>`).join('')}</div>
    <div class="seal"><i></i><span>Markalar mühürlü. Ödeme adımında, siparişi onaylamadan önce açıklanır.</span></div>
    <div class="between" style="margin-top:26px"><b class="serif" style="font-size:34px;color:var(--gold2)">${tl(kombinTotal(k, products))}</b><button class="btn" id="add">Kombini sepete ekle</button></div>
    <p class="muted" style="font-size:12.5px;margin-top:14px">Her ay 1 iade ya da beden değişimi ücretsiz.</p></div></div>`;
  loadKombinImage(k).then(s => { if (s) $('#hero').style.backgroundImage = `url("${s}")`; else $('#hero').style.backgroundImage = `url("${ps[0]?.images?.[0] || ''}")`; });
  $('#add').onclick = () => { const sizes = {}; $$('[data-p]').forEach(s => sizes[s.dataset.p] = s.value); addToCart(k.id, sizes);
    toast('Sepete eklendi'); $('#add').outerHTML = '<a class="btn" href="/sepet">Sepete git →</a>'; };
  $$('[data-g]').forEach(i => i.onclick = () => { const p = products[i.dataset.g];
    $('#mbody').innerHTML = `<div class="lab">${esc(k.name)}</div><h2 style="margin:8px 0 16px">${esc(p.name)}</h2><div class="gal">${(p.images || []).map(s => `<img src="${esc(s)}" alt="">`).join('')}</div>`;
    $('#modal').classList.add('on'); });
} catch (e) {
  root.innerHTML = `<div class="empty">Bu kombin bulunamadı ya da artık yayında değil. <a class="link" href="/kombinler">Tüm kombinler</a></div>`;
}
