// Kombin stüdyosu: onaylı influencer/stilist mankenin üzerinde kombin hazırlar ve kendi gardırobuna asar.
// Akış: parçalar (üst, alt, dış giyim, elbise, ayakkabı) → aksesuar eklensin mi? → çanta eklensin mi? → ad ve kaydet → giydirme.
// Aksesuar ve çanta "eşlik eden" ürünlerdir (extraIds): kombin fiyatına dahil değildir.
import {
  db, fs, onUser, mountNav, OCCASIONS, STYLES, WORLDS, tl, esc, toast, $, $$, uid8
} from './app.js';
import { colorScore } from './engine.js';
import { getBodyPhoto, requestTryon, photoForm } from './bodyphoto.js';
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp } = fs;
mountNav('');
const root = $('#root');

/* Bölgeler: x,y = manken görselindeki konum (oran). side = açıklama kartının tarafı. */
const ZONES = {
  aksesuar: { label: 'Aksesuar', sub: 'Şapka, kemer, atkı, takı', x: .5, y: .262, side: 'l', extra: true },
  dis: { label: 'Dış giyim', sub: 'Ceket, mont, kaban', x: .385, y: .345, side: 'l' },
  ust: { label: 'Üst gövde', sub: 'Gömlek, kazak, tişört', x: .56, y: .385, side: 'r' },
  elbise: { label: 'Boydan', sub: 'Elbise, tulum', x: .5, y: .5, side: 'r' },
  alt: { label: 'Alt gövde', sub: 'Pantolon, etek, şort', x: .55, y: .63, side: 'r' },
  canta: { label: 'Çanta', sub: 'El, omuz, sırt çantası', x: .705, y: .555, side: 'r', extra: true },
  ayakkabi: { label: 'Ayakkabı', sub: 'Topuklu, sneaker, bot', x: .455, y: .895, side: 'l' }
};
const CORE = ['dis', 'ust', 'elbise', 'alt', 'ayakkabi'];
const STEP_TITLES = ['Parçalar', 'Aksesuar', 'Çanta', 'Detaylar', 'Hazır'];

let U, INF, P = {}, G = 'kadin', pick = {}, step = 0, EDIT = null, SAVED = null, BODY = null;

onUser(async u => {
  U = u;
  if (!u) return locked('Giriş gerekli', 'Kombin stüdyosu onaylı influencer ve stilistlere açıktır.', '<a class="btn" href="/hesap?next=/studyo">Giriş yap</a>');
  const s = await getDoc(doc(db, 'influencers', u.uid)); INF = s.exists() ? s.data() : null;
  if (!INF || INF.status !== 'aktif') return locked('Stüdyo henüz açık değil', 'Kombin stüdyosu, başvurusu onaylanan influencer ve stilistlere açılır.', '<a class="btn" href="/influencer">Satış ortaklığı</a>');
  if (!INF.slug) return locked('Mağazanız hazırlanıyor', 'Kişisel mağaza adresiniz tanımlanınca stüdyo açılır. Ekibimiz kısa süre içinde tamamlayacak.', '<a class="btn ghost" href="/influencer">Panele dön</a>');
  const ps = await getDocs(collection(db, 'products'));
  ps.forEach(d => { const p = { id: d.id, ...d.data() }; if (p.active !== false) P[p.id] = p; });
  const id = new URLSearchParams(location.search).get('id');
  if (id) await loadEdit(id);
  build();
});
function locked(t, m, a) {
  root.innerHTML = `<div class="locked card gold"><div class="lab">Kombin stüdyosu</div><h2 style="margin:12px 0 10px">${t}</h2><p class="muted" style="line-height:1.7">${m}</p><div class="sep"></div>${a}</div>`;
  root.className = 'wrap';
}
async function loadEdit(id) {
  const s = await getDoc(doc(db, 'kombins', id));
  if (!s.exists() || s.data().ownerUid !== U.uid) return toast('Kombin bulunamadı', 'bad');
  EDIT = { id, ...s.data() }; G = EDIT.gender || 'kadin';
  [...(EDIT.productIds || []), ...(EDIT.extraIds || [])].forEach(pid => { const p = P[pid]; if (p && ZONES[p.type]) pick[p.type] = p; });
}

/* ---------------- yerleşim ---------------- */
function build() {
  root.innerHTML = `<div class="studio">
    <section class="stage hint" id="st"><div class="glow"></div>
      <div class="figure" id="fig"><img class="mq" id="mq" src="/assets/img/manken-${G}.jpg" alt="Manken"></div>
      <svg class="lines" id="ln"></svg><div id="hs"></div><div id="co"></div>
      <div class="gtoggle" id="gt"><button data-g="kadin">Kadın</button><button data-g="erkek">Erkek</button></div>
      <div class="stotal"><span class="lab">Kombin fiyatı</span><b id="tot">${tl(0)}</b><span class="muted" style="font-size:11.5px" id="totx"></span></div>
    </section>
    <aside class="panel"><div class="steps" id="sp"></div><div class="pbody" id="pb"></div><div class="pfoot" id="pf"></div></aside></div>`;
  $$('#gt button').forEach(b => b.onclick = () => setGender(b.dataset.g));
  setTimeout(() => $('#st')?.classList.remove('hint'), 4200);
  $('#mq').onload = layout;
  addEventListener('resize', layout);
  render();
}
function setGender(g) {
  if (g === G) return;
  if (Object.keys(pick).length && !confirm('Cinsiyet değişince seçtiğiniz parçalar temizlenir. Devam edilsin mi?')) return;
  G = g; pick = {}; step = 0;
  const im = $('#mq'); im.classList.add('fade');
  setTimeout(() => { im.src = `/assets/img/manken-${G}.jpg`; im.classList.remove('fade'); }, 350);
  render();
}
const coreIds = () => CORE.filter(z => pick[z]).map(z => pick[z].id);
const extraIds = () => ['aksesuar', 'canta'].filter(z => pick[z]).map(z => pick[z].id);
const coreTotal = () => CORE.reduce((s, z) => s + (+pick[z]?.price || 0), 0);
const extraTotal = () => ['aksesuar', 'canta'].reduce((s, z) => s + (+pick[z]?.price || 0), 0);
const valid = () => !!pick.elbise || (!!pick.ust && !!pick.alt);
const visibleZone = z => !ZONES[z].extra || (z === 'aksesuar' ? step >= 1 : step >= 2) || pick[z];

function render() {
  $$('#gt button').forEach(b => b.classList.toggle('on', b.dataset.g === G));
  $('#tot').textContent = tl(coreTotal());
  $('#totx').textContent = extraTotal() ? `+ eşlik eden ${tl(extraTotal())}` : '';
  $('#sp').innerHTML = STEP_TITLES.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('');
  layout(); panel();
}

/* Sahne: + işaretleri, seçili ürün kartları ve kılavuz çizgileri */
function layout() {
  const st = $('#st'), fig = $('#fig'); if (!st || !fig) return;
  const S = st.getBoundingClientRect(), F = fig.getBoundingClientRect();
  const fx = F.left - S.left, fw = F.width, fh = F.height, W = S.width, mob = W < 640;
  const cw = Math.round(Math.max(mob ? 88 : 120, Math.min(150, W * .13)));
  const ch = cw * 4 / 3 + 56;
  const pt = z => ({ x: fx + ZONES[z].x * fw, y: ZONES[z].y * fh });
  // + işaretleri
  $('#hs').innerHTML = Object.keys(ZONES).map(z => {
    const p = pt(z), off = (z === 'elbise' && (pick.ust || pick.alt)) || ((z === 'ust' || z === 'alt') && pick.elbise);
    return `<button class="hs ${ZONES[z].side} ${pick[z] ? 'filled' : ''} ${off ? 'off' : ''} ${visibleZone(z) ? '' : 'hidden'}" data-z="${z}" style="left:${p.x}px;top:${p.y}px" aria-label="${ZONES[z].label} ekle"><i>+</i><span class="tip">${ZONES[z].label}</span></button>`;
  }).join('');
  $$('#hs .hs').forEach(b => b.onclick = () => openDrawer(b.dataset.z));
  // kartlar: her tarafta çakışmayacak şekilde dikey yerleşim
  const cards = [];
  for (const side of ['l', 'r']) {
    const zs = Object.keys(ZONES).filter(z => ZONES[z].side === side && pick[z]).sort((a, b) => ZONES[a].y - ZONES[b].y);
    const top = 70, bot = fh - 14, gap = 12;
    let ys = zs.map(z => Math.max(top + ch / 2, pt(z).y));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + ch + gap);
    const over = ys.length ? ys.at(-1) + ch / 2 - bot : 0;
    if (over > 0) ys = ys.map(y => y - over);
    for (let i = 1; i < ys.length; i++) if (ys[i] < ys[i - 1] + ch + gap) ys[i] = ys[i - 1] + ch + gap;
    const x = side === 'l' ? Math.max(10, fx + fw * .3 - cw - (mob ? 6 : 28)) : Math.min(W - cw - 10, fx + fw * .7 + (mob ? 6 : 28));
    zs.forEach((z, i) => cards.push({ z, x, y: ys[i], side }));
  }
  $('#co').innerHTML = cards.map(c => { const p = pick[c.z], ex = ZONES[c.z].extra;
    return `<div class="callout" style="left:${c.x}px;top:${c.y}px;--cw:${cw}px" data-z="${c.z}"><div class="card2">
      <div class="im" style="background-image:url('${esc(p.images?.[0] || '')}')"><div class="acts"><button data-ch="${c.z}">Değiştir</button><button data-rm="${c.z}" aria-label="Kaldır" title="Kaldır">✕</button></div></div>
      <div class="mt"><div class="lab">${ZONES[c.z].label}</div><b title="${esc(p.name)}">${esc(p.name)}</b><span class="${ex ? 'x' : ''}">${ex ? '+' : ''}${tl(p.price)}</span></div></div></div>`; }).join('');
  $$('#co [data-ch]').forEach(b => b.onclick = () => openDrawer(b.dataset.ch));
  $$('#co [data-rm]').forEach(b => b.onclick = () => { delete pick[b.dataset.rm]; render(); });
  $('#ln').innerHTML = cards.map(c => { const p = pt(c.z), ex = c.side === 'l' ? c.x + cw : c.x, kx = ex + (c.side === 'l' ? 22 : -22);
    return `<path d="M${p.x} ${p.y} L${kx} ${c.y} L${ex} ${c.y}"/><circle cx="${p.x}" cy="${p.y}" r="2.5"/>`; }).join('');
}

/* ---------------- ürün seçimi ---------------- */
let DZ = null, DC = '';
const poolFor = z => Object.values(P).filter(p => p.type === z && (p.gender === G || p.gender === 'unisex'));
function harmony(p, z) {
  const others = Object.entries(pick).filter(([k]) => k !== z).map(([, v]) => v);
  if (!others.length) return 0;
  const sty = new Set(others.flatMap(o => o.styles || []));
  return colorScore([...others, p]) + (p.styles || []).filter(s => sty.has(s)).length * 1.5;
}
function openDrawer(z) {
  DZ = z; DC = '';
  $('#drl').textContent = ZONES[z].extra ? 'Eşlik eden ürün · fiyata dahil değil' : 'Bölge seçimi';
  $('#drt').textContent = ZONES[z].label + ' · ' + ZONES[z].sub;
  $('#drq').value = ''; $('#drs').value = 'uyum';
  const cols = [...new Set(poolFor(z).flatMap(p => p.colors || []))];
  $('#drc').innerHTML = cols.length > 1 ? `<button class="on" data-c="">Tüm renkler</button>` + cols.map(c => `<button data-c="${esc(c)}">${esc(c)}</button>`).join('') : '';
  $$('#drc button').forEach(b => b.onclick = () => { DC = b.dataset.c; $$('#drc button').forEach(x => x.classList.toggle('on', x === b)); drawGrid(); });
  drawGrid(); $('#dr').classList.add('on');
}
function drawGrid() {
  const q = $('#drq').value.trim().toLocaleLowerCase('tr'), s = $('#drs').value;
  let list = poolFor(DZ).filter(p => (!DC || (p.colors || []).includes(DC)) && (!q || p.name.toLocaleLowerCase('tr').includes(q)));
  list = list.map(p => ({ p, h: harmony(p, DZ) }));
  if (s === 'uyum') list.sort((a, b) => b.h - a.h); else list.sort((a, b) => s === 'asc' ? a.p.price - b.p.price : b.p.price - a.p.price);
  const hasCtx = Object.keys(pick).some(k => k !== DZ);
  const best = hasCtx ? list.slice().sort((a, b) => b.h - a.h).slice(0, 2).filter(x => x.h > 0).map(x => x.p.id) : [];
  $('#drg').innerHTML = list.length ? list.map(({ p }) => sugCard(p, pick[DZ]?.id === p.id, best.includes(p.id))).join('')
    : `<div class="empty none">${poolFor(DZ).length ? 'Bu filtreye uyan ürün yok.' : 'Bu bölge için henüz ürün yok.'}</div>`;
  $$('#drg .sug').forEach(b => b.onclick = () => { choose(DZ, P[b.dataset.p]); closeDrawer(); });
}
const sugCard = (p, on, best) => `<button class="sug ${on ? 'on' : ''}" data-p="${p.id}"><div class="im" style="background-image:url('${esc(p.images?.[0] || '')}')"></div>
  ${best ? '<span class="bd">Uyumlu</span>' : ''}<span class="ck">✓</span><div class="mt">${esc(p.name)}<span>${tl(p.price)}</span></div></button>`;
function choose(z, p) {
  if (z === 'elbise' && (pick.ust || pick.alt)) { delete pick.ust; delete pick.alt; toast('Elbise seçildi: üst ve alt parça kaldırıldı'); }
  if ((z === 'ust' || z === 'alt') && pick.elbise) { delete pick.elbise; toast('Elbise kaldırıldı'); }
  pick[z] = p; render();
}
function closeDrawer() { $('#dr').classList.remove('on'); }
$('#drx').onclick = closeDrawer;
$('#dr').addEventListener('click', e => { if (e.target.id === 'dr') closeDrawer(); });
$('#drq').oninput = drawGrid; $('#drs').onchange = drawGrid;
addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ---------------- adım paneli ---------------- */
function foot(html) { $('#pf').innerHTML = html; $('#pf').style.display = html ? '' : 'none'; }
function go(n) { step = n; render(); $('#pb').scrollTop = 0; if (innerWidth < 1000 && n) $('.panel').scrollIntoView({ behavior: 'smooth' }); }
function panel() {
  const pb = $('#pb');
  if (step === 0) {
    pb.innerHTML = `<div class="lab">${EDIT ? 'Kombini düzenle' : 'Kombin stüdyosu'}</div><h2>Mankeni giydirin</h2>
      <p class="lead">Mankenin üzerindeki <b style="color:var(--gold2)">+</b> işaretlerine dokunun ve her bölge için ürün seçin. Kombin için üst ve alt parça ya da bir elbise yeterli; dış giyim ve ayakkabı ile tamamlayabilirsiniz.</p>
      <div class="plist">${CORE.map(z => pick[z] ? `<div class="pitem"><img src="${esc(pick[z].images?.[0] || '')}" alt=""><div><small>${ZONES[z].label}</small>${esc(pick[z].name)}</div><span class="p">${tl(pick[z].price)}</span></div>`
        : `<div class="pitem open ${(z === 'elbise' && (pick.ust || pick.alt)) || ((z === 'ust' || z === 'alt') && pick.elbise) ? 'dis' : ''}" data-z="${z}"><span class="ph">+</span><div><small>${ZONES[z].label}</small>${ZONES[z].sub}</div></div>`).join('')}</div>
      <div class="sum">Kombin fiyatı <b style="float:right">${tl(coreTotal())}</b></div>`;
    $$('#pb .pitem.open').forEach(r => { if (r.classList.contains('dis')) { r.style.opacity = .4; r.style.pointerEvents = 'none'; } else r.onclick = () => openDrawer(r.dataset.z); });
    foot(`<button class="btn" id="nx" ${valid() ? '' : 'disabled'}>Devam</button>`);
    $('#nx').onclick = () => go(1);
  } else if (step === 1 || step === 2) {
    const z = step === 1 ? 'aksesuar' : 'canta', pool = poolFor(z).map(p => ({ p, h: harmony(p, z) })).sort((a, b) => b.h - a.h).slice(0, 6).map(x => x.p);
    if (pick[z] && !pool.some(p => p.id === pick[z].id)) pool.unshift(pick[z]);
    pb.innerHTML = `<div class="lab">Eşlik eden ürün</div><h2>${z === 'aksesuar' ? 'Aksesuar eklensin mi?' : 'Çanta eklensin mi?'}</h2>
      <p class="lead">Seçtiğiniz parçalarla renk ve tarz uyumuna göre önerdik. ${z === 'aksesuar' ? 'Aksesuar' : 'Çanta'} kombin fiyatına <b style="color:var(--paper)">dahil değildir</b>; takipçileriniz isterse kombine ekler.</p>
      <div class="sugs">${pool.map((p, i) => sugCard(p, pick[z]?.id === p.id, i < 2 && !pick[z])).join('') || `<div class="empty" style="grid-column:1/-1">Uygun ${z === 'aksesuar' ? 'aksesuar' : 'çanta'} henüz yok.</div>`}</div>
      ${poolFor(z).length > pool.length ? `<button class="link" id="all" style="margin-top:16px;font-size:13px">Tüm ${z === 'aksesuar' ? 'aksesuarları' : 'çantaları'} gör (${poolFor(z).length})</button>` : ''}`;
    $$('#pb .sug').forEach(b => b.onclick = () => { const p = P[b.dataset.p]; if (pick[z]?.id === p.id) delete pick[z]; else pick[z] = p; render(); });
    $('#all') && ($('#all').onclick = () => openDrawer(z));
    foot(`<button class="btn ghost" id="bk" style="flex:0 0 auto">← Geri</button><button class="btn" id="nx">${pick[z] ? 'Ekle ve devam et' : (z === 'aksesuar' ? 'Aksesuarsız devam et' : 'Çantasız devam et')}</button>`);
    $('#bk').onclick = () => go(step - 1); $('#nx').onclick = () => go(step + 1);
  } else if (step === 3) {
    const items = CORE.filter(z => pick[z]).map(z => pick[z]);
    const sty = EDIT?.styles || STYLES.filter(s => items.length && items.every(p => (p.styles || []).includes(s)));
    pb.innerHTML = `<div class="lab">Son adım</div><h2>Kombininize ad verin</h2>
      <div class="grid" style="margin-top:18px">
        <label class="f">Kombin adı<input class="in" id="kn" maxlength="48" value="${esc(EDIT?.name || '')}" placeholder="Örn. Pazar Kahvaltısı"></label>
        <label class="f">Takipçilerinize kısa bir not<textarea class="in" id="kd" maxlength="400" placeholder="Bu kombini neden seviyorsunuz, nerede giyerdiniz?">${esc(EDIT?.desc || '')}</textarea></label>
        <label class="f">Kullanım alanı<select class="in" id="ko">${OCCASIONS.map(o => `<option ${o === (EDIT?.occ || 'Günlük') ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
        <div><div class="lab" style="margin-bottom:10px">Tarz</div><div class="chips" id="ks">${STYLES.map(s => `<button class="chip ${sty.includes(s) ? 'on' : ''}">${s}</button>`).join('')}</div></div>
        <label class="check"><input type="checkbox" id="kc" ${EDIT?.catalog === 'yok' ? '' : 'checked'}> iyigiy ana kataloğunda da yayınlansın (ekip onayından sonra). Gardırobunuzda hemen görünür.</label>
      </div>
      <div class="sum">Kombin fiyatı <b style="float:right">${tl(coreTotal())}</b><br>
        ${extraTotal() ? `<span class="muted">Eşlik eden (fiyata dahil değil): ${['aksesuar', 'canta'].filter(z => pick[z]).map(z => esc(pick[z].name)).join(', ')} · +${tl(extraTotal())}</span>` : '<span class="muted">Eşlik eden ürün yok</span>'}</div>`;
    $$('#ks .chip').forEach(c => c.onclick = () => c.classList.toggle('on'));
    foot(`<button class="btn ghost" id="bk" style="flex:0 0 auto">← Geri</button><button class="btn" id="sv">${EDIT ? 'Değişiklikleri kaydet' : 'Kaydet ve gardırobuma as'}</button>`);
    $('#bk').onclick = () => go(2); $('#sv').onclick = save;
  } else {
    const url = `${location.origin}/${INF.slug}`;
    pb.innerHTML = `<div class="done"><div class="seal">✓</div><h2 style="margin-top:18px">Kombininiz gardırobunuzda</h2>
      <p class="lead">“${esc(SAVED.name)}” kişisel mağazanızda askıda. ${SAVED.catalog === 'bekliyor' ? 'Ana katalog için ekibimizin onayına gönderildi.' : ''}</p>
      <div class="row" style="justify-content:center;margin-top:18px"><a class="btn sm" href="/${esc(INF.slug)}" target="_blank">Gardırobumu aç ↗</a><button class="btn sm ghost" data-copy="${esc(url)}">Linki kopyala</button></div></div>
      <div class="sep"></div><div id="tw"></div>`;
    $('[data-copy]').onclick = async e => { try { await navigator.clipboard.writeText(e.target.dataset.copy); toast('Link kopyalandı'); } catch { prompt('Link:', e.target.dataset.copy); } };
    tryonAsk();
    foot(`<a class="btn ghost" href="/influencer#gardirop" style="flex:0 0 auto">Panele dön</a><button class="btn" id="nw">Yeni kombin hazırla</button>`);
    $('#nw').onclick = () => { pick = {}; EDIT = null; SAVED = null; history.replaceState(null, '', '/studyo'); go(0); };
  }
}

/* ---------------- kaydet ---------------- */
async function save() {
  const name = $('#kn').value.trim();
  if (!name) { $('#kn').focus(); return toast('Kombine bir ad verin', 'bad'); }
  const b = $('#sv'); b.disabled = true; b.textContent = 'Kaydediliyor…';
  try {
    const core = CORE.filter(z => pick[z]).map(z => pick[z]);
    const wc = {}; core.forEach(p => wc[p.world] = (wc[p.world] || 0) + 1);
    const world = Object.entries(wc).filter(([w]) => WORLDS[w]).sort((a, b) => b[1] - a[1])[0]?.[0] || 'tanidik';
    const ref = EDIT ? doc(db, 'kombins', EDIT.id) : doc(collection(db, 'kombins'));
    const same = EDIT && JSON.stringify([...EDIT.productIds].sort()) === JSON.stringify(coreIds().sort());
    let image = EDIT?.image || '';
    // Ürünler değiştiyse (ya da yeni kombinse) vitrin görseli parçalardan yeniden hazırlanır.
    if (!same) {
      const data = await collage(core);
      if (data) { const imgId = ref.id + '-' + uid8();
        await setDoc(doc(db, 'kombinImages', imgId), { data, kombinId: ref.id, ownerUid: U.uid, kind: 'kolaj', createdAt: serverTimestamp() });
        if (EDIT?.image?.startsWith('img:')) deleteDoc(doc(db, 'kombinImages', EDIT.image.slice(4))).catch(() => {});
        image = 'img:' + imgId; }
    }
    const d = { name, desc: $('#kd').value.trim(), occ: $('#ko').value, styles: $$('#ks .chip.on').map(c => c.textContent),
      gender: G, world, productIds: coreIds(), extraIds: extraIds(), image,
      ownerUid: U.uid, ownerSlug: INF.slug, ownerName: INF.name, status: 'magaza', source: 'studyo',
      catalog: $('#kc').checked ? 'bekliyor' : 'yok', // düzenlenen kombin ana katalog için yeniden onaya gider
      tryon: same ? (EDIT?.tryon || 'yok') : 'yok', updatedAt: serverTimestamp() };
    if (EDIT) await updateDoc(ref, d); else await setDoc(ref, { ...d, createdAt: serverTimestamp() });
    SAVED = { id: ref.id, ...d }; EDIT = null; go(4);
  } catch (e) { console.error(e); toast('Kaydedilemedi: ' + e.message, 'bad'); b.disabled = false; b.textContent = 'Tekrar dene'; }
}

// Ürün görsellerinden 9:16 vitrin görseli (giydirme görseli gelene kadar askıda bu görünür).
async function collage(items) {
  const load = src => new Promise(r => { const im = new Image(); if (/^https?:/.test(src)) im.crossOrigin = 'anonymous'; im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
  const ims = (await Promise.all(items.map(p => load(p.images?.[0] || '')))).filter(Boolean);
  if (!ims.length) return '';
  const W = 900, H = 1600, g = 8, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.fillStyle = '#0f0d0b'; x.fillRect(0, 0, W, H);
  const n = ims.length, cells = [];
  if (n === 1) cells.push([0, 0, W, H]);
  else if (n === 2) cells.push([0, 0, W, H / 2 - g / 2], [0, H / 2 + g / 2, W, H / 2 - g / 2]);
  else if (n === 3) cells.push([0, 0, W, H * .56 - g / 2], [0, H * .56 + g / 2, W / 2 - g / 2, H * .44 - g / 2], [W / 2 + g / 2, H * .56 + g / 2, W / 2 - g / 2, H * .44 - g / 2]);
  else { const top = n === 4 ? 0 : 1, h = top ? H * .42 : 0; if (top) cells.push([0, 0, W, h - g / 2]);
    const rest = n - top, rows = Math.ceil(rest / 2), rh = (H - h - (top ? g / 2 : 0) - g * (rows - 1)) / rows, y0 = h + (top ? g / 2 : 0);
    for (let i = 0; i < rest; i++) { const r = Math.floor(i / 2), cw = (rest % 2 && i === rest - 1) ? W : W / 2 - g / 2; cells.push([i % 2 ? W / 2 + g / 2 : 0, y0 + r * (rh + g), cw, rh]); } }
  ims.forEach((im, i) => { const [cx, cy, cw, ch] = cells[i]; const s = Math.max(cw / im.width, ch / im.height), w = im.width * s, h = im.height * s;
    x.save(); x.beginPath(); x.rect(cx, cy, cw, ch); x.clip(); x.drawImage(im, cx + (cw - w) / 2, cy + (ch - h) * .35, w, h); x.restore(); });
  try { return c.toDataURL('image/jpeg', .84); } catch { return ''; }
}

/* ---------------- giydirme ---------------- */
async function tryonAsk() {
  const el = $('#tw'); if (!el) return;
  el.innerHTML = `<div class="lab">Sanal deneme</div><h3 style="font-family:var(--serif);font-weight:400;font-size:24px;line-height:1.2;margin-top:10px">Bu ürünleri kendi üzerinize giydirip takipçilerinizle paylaşmak ister misiniz?</h3>
    <p class="lead" style="margin-top:10px">Boydan fotoğrafınızın üzerinde, yüzünüz ve vücut hatlarınız korunarak bu kombin giydirilir. Görsel hazırlanınca gardırobunuzdaki kombin bu görselle yayınlanır.</p>
    <div class="row" style="margin-top:16px"><button class="btn sm" id="ty">Evet, üzerimde görmek istiyorum</button><button class="btn sm ghost" id="tn">Şimdilik hayır</button></div>`;
  $('#tn').onclick = () => { el.innerHTML = '<p class="muted" style="font-size:13px">İsterseniz daha sonra panelinizdeki “Gardırobum” sekmesinden giydirme isteyebilirsiniz.</p>'; };
  $('#ty').onclick = async () => {
    BODY = BODY || await getBodyPhoto(U.uid);
    if (BODY) return sendTryon(el);
    el.innerHTML = `<div class="lab">Boydan fotoğrafınız</div><div id="pfm"></div>`;
    photoForm($('#pfm'), U.uid, d => { BODY = { data: d }; sendTryon(el); });
  };
}
async function sendTryon(el) {
  try { await requestTryon(U.uid, SAVED); SAVED.tryon = 'bekliyor';
    el.innerHTML = `<div class="card gold"><div class="lab">Giydirme talebi alındı</div><p style="margin-top:10px;line-height:1.7;font-size:14px">Görseliniz hazırlanıyor. Ekibimiz kontrol edip yayına aldığında “${esc(SAVED.name)}” gardırobunuzda sizin fotoğrafınızla görünecek. Durumu panelinizdeki “Gardırobum” sekmesinden izleyebilirsiniz.</p></div>`;
  } catch (e) { console.error(e); toast('Talep gönderilemedi: ' + e.message, 'bad'); }
}
