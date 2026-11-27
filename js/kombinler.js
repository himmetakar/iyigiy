// Tüm kombinler: standart liste görünümü
import { mountNav, loadCatalog, loadKombinImage, kombinTotal, localProfile, WORLDS, OCCASIONS, tl, esc, $, $$ } from './app.js';
import { rankForProfile } from './reco.js';
mountNav('list');

const prof = localProfile();
const { products, kombins } = await loadCatalog();
$('#fo').innerHTML = [...new Set(kombins.map(k => k.occ).filter(Boolean))].map(o => `<button class="chip" data-v="${esc(o)}">${esc(o)}</button>`).join('');
if (prof.kim) $(`#fg [data-v="${prof.kim}"]`)?.classList.add('on');
$$('.filters .chip').forEach(c => c.onclick = () => { c.classList.toggle('on'); draw(); });
$('#fb').oninput = draw; $('#sort').onchange = draw;
$('#clr').onclick = () => { $$('.filters .chip.on').forEach(c => c.classList.remove('on')); $('#fb').value = 30000; draw(); };
const vals = id => $$('#' + id + ' .chip.on').map(c => c.dataset.v);

function draw() {
  const g = vals('fg'), w = vals('fw'), o = vals('fo'), max = +$('#fb').value;
  $('#bv').textContent = max >= 30000 ? 'sınırsız' : tl(max).replace(',00', '');
  let list = kombins.filter(k => (!g.length || g.includes(k.gender)) && (!w.length || w.includes(k.world)) && (!o.length || o.includes(k.occ)) && (max >= 30000 || kombinTotal(k, products) <= max));
  const s = $('#sort').value;
  if (s === 'rec') list = rankForProfile(list, products, prof);
  if (s === 'new') list.sort((a, b) => (b.publishedAt?.seconds || 0) - (a.publishedAt?.seconds || 0));
  if (s === 'asc') list.sort((a, b) => kombinTotal(a, products) - kombinTotal(b, products));
  if (s === 'desc') list.sort((a, b) => kombinTotal(b, products) - kombinTotal(a, products));
  $('#cnt').textContent = list.length + ' kombin';
  const L = $('#list'); L.innerHTML = '';
  if (!list.length) { L.innerHTML = '<div class="empty" style="grid-column:1/-1">Bu filtrelere uyan kombin yok.</div>'; return; }
  for (const k of list) {
    const a = document.createElement('a'); a.className = 'kcard'; a.href = '/kombin?id=' + k.id;
    const ps = k.productIds.map(id => products[id]).filter(Boolean);
    a.innerHTML = `<div class="ph" data-ph><div class="collage">${ps.slice(0, 4).map(p => `<img src="${esc(p.images?.[0] || '')}" alt="" loading="lazy">`).join('')}</div><span class="w">${WORLDS[k.world]}</span></div>
      <div class="meta"><span class="lab">${esc(k.occ || '')}</span><b>${esc(k.name)}</b><div class="p">${tl(kombinTotal(k, products))} <span class="muted" style="font-size:12px">· ${ps.length} parça</span></div></div>`;
    loadKombinImage(k).then(src => { if (src) { const ph = a.querySelector('[data-ph]'); ph.querySelector('.collage').remove(); ph.style.backgroundImage = `url("${src}")`; } });
    L.appendChild(a);
  }
}
draw();
