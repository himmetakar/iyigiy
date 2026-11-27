// Influencer (satış ortağı) paneli
import {
  db, fs, onUser, mountNav, getSettings, loadCatalog, loadKombinImage, kombinTotal, CATEGORIES, WORLDS,
  tl, pct, esc, fmtDate, toDate, toast, $, $$, round2
} from './app.js';
const { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, serverTimestamp } = fs;
mountNav('');
const root = $('#root');
let U, S, INF, RANGE = 30;

onUser(async u => {
  U = u; S = await getSettings();
  if (!u) return intro();
  const s = await getDoc(doc(db, 'influencers', u.uid));
  INF = s.exists() ? s.data() : null;
  if (!INF) return apply();
  if (INF.status === 'aktif') return dashboard();
  const msg = { basvuru: ['Başvurunuz inceleniyor', 'Ekibimiz başvurunuzu değerlendiriyor. Onaylandığında referans kodunuz ve paneliniz burada açılacak.'],
    red: ['Başvurunuz onaylanmadı', 'Şu an için iş birliği yapamıyoruz. Sorularınız için bizimle iletişime geçebilirsiniz.'],
    durduruldu: ['Hesabınız durduruldu', 'Satış ortaklığı hesabınız geçici olarak durduruldu.'] }[INF.status] || ['Durum bilinmiyor', ''];
  root.innerHTML = `<div class="card gold" style="max-width:620px;margin:8vh auto;text-align:center"><div class="lab">Satış ortaklığı</div><h2 style="margin:12px 0">${msg[0]}</h2><p class="muted">${msg[1]}</p></div>`;
});

const ratesTable = (custom = {}) => `<table class="tbl" style="margin-top:10px"><tr><th>Kategori</th><th class="num">Komisyon</th></tr>
  ${Object.entries(CATEGORIES).map(([k, l]) => `<tr><td>${l}</td><td class="num"><b>${pct(custom[k] ?? S.commissions[k])}</b>${custom[k] != null ? ' <span class="badge gold">size özel</span>' : ''}</td></tr>`).join('')}
  <tr><td>Linkteki kombin dışındaki alışverişler</td><td class="num"><b>${pct(S.offLinkRate)}</b></td></tr></table>
  <p class="muted" style="font-size:12.5px;margin-top:12px;line-height:1.7">Komisyon KDV hariç tutar üzerinden hesaplanır. Linkinize tıklayan kişi ${S.cookieHours} saat içinde alışveriş yaparsa satış size yazılır. İptal edilen ve tamamen iade edilen siparişlerin komisyonu düşer; beden değişimleri komisyonu etkilemez. 20/B istisna belgesiyle ödeme alanlarda %${S.stopaj} stopaj kesilir.</p>`;

function intro() {
  root.innerHTML = `<div class="hero" style="margin-top:4vh"><div><div class="lab">iyigiy satış ortaklığı</div><h1 style="margin:12px 0 18px">Kombinleri paylaş, <em>her satıştan kazan.</em></h1>
    <p class="muted" style="font-size:16px;line-height:1.7;max-width:520px">Size özel linkle paylaştığınız kombinlerden gelen her alışverişten komisyon alırsınız. Kaç kişinin tıkladığını, ne kadar alışveriş yaptığını ve kazancınızı panelinizden anlık izlersiniz.</p>
    <div class="row" style="margin-top:28px"><a class="btn" href="/hesap?next=/influencer">Giriş yap ve başvur</a></div></div>
    <div class="card gold"><div class="lab">Komisyon oranları</div>${ratesTable()}</div></div>`;
}

function apply() {
  root.innerHTML = `<div class="hero"><div><div class="lab">Başvuru</div><h1 style="margin:12px 0 14px">Satış ortağımız olun</h1>
    <p class="muted" style="line-height:1.7;max-width:520px">Başvurunuz onaylanınca size özel bir referans kodu ve link verilir.</p>
    <div class="card" style="margin-top:24px"><div class="grid">
     <label class="f">Ad soyad<input class="in" id="n" value="${esc(U.displayName || '')}"></label>
     <label class="f">Sosyal medya hesapları (Instagram, TikTok, YouTube…)<input class="in" id="h" placeholder="@kullaniciadi, tiktok.com/@..."></label>
     <div class="grid g2"><label class="f">Toplam takipçi<input class="in" id="f" type="number"></label>
      <label class="f">Ödeme şekli<select class="in" id="t"><option value="20b">20/B istisna belgesi (bireysel)</option><option value="sirket">Şirket (fatura keserim)</option></select></label></div>
     <label class="f">Kısaca kendinizi ve içeriklerinizi anlatın<textarea class="in" id="a"></textarea></label>
     <label class="check"><input type="checkbox" id="ok"> Satış ortaklığı koşullarını ve komisyon kurallarını kabul ediyorum.</label>
     <button class="btn" id="go">Başvuruyu gönder</button></div></div></div>
    <div class="card gold"><div class="lab">Komisyon oranları</div>${ratesTable()}</div></div>`;
  $('#go').onclick = async () => {
    const d = { name: $('#n').value.trim(), handles: $('#h').value.trim(), followers: +$('#f').value || 0, taxType: $('#t').value, about: $('#a').value.trim() };
    if (!d.name || !d.handles) return toast('Ad ve sosyal medya hesabı gerekli', 'bad');
    if (!$('#ok').checked) return toast('Koşulları kabul edin', 'bad');
    await setDoc(doc(db, 'influencers', U.uid), { ...d, email: U.email, status: 'basvuru', createdAt: serverTimestamp() });
    location.reload();
  };
}

async function dashboard() {
  root.innerHTML = '<div class="spin"></div>';
  const [cl, rs, py, cat] = await Promise.all([
    getDocs(query(collection(db, 'clicks'), where('infUid', '==', U.uid))),
    getDocs(query(collection(db, 'refSales'), where('infUid', '==', U.uid))),
    getDocs(query(collection(db, 'payouts'), where('infUid', '==', U.uid))),
    loadCatalog()]);
  const clicks = cl.docs.map(d => d.data()), sales = rs.docs.map(d => ({ id: d.id, ...d.data() })), pays = py.docs.map(d => d.data());
  const base = location.origin, link = `${base}/?ref=${INF.code}`;
  root.innerHTML = `<div class="between"><div><div class="lab">Influencer paneli</div><h1 style="margin-top:8px">${esc(INF.name)}</h1>
     <p class="muted" style="margin-top:6px">Referans kodunuz: <span class="badge gold">${esc(INF.code)}</span></p></div>
     <div class="ranges" id="rg">${[[7, '7 gün'], [30, '30 gün'], [90, '90 gün'], [0, 'Tümü']].map(([v, l]) => `<button data-r="${v}" class="${v === RANGE ? 'on' : ''}">${l}</button>`).join('')}</div></div>
   <div class="card gold" style="margin-top:22px"><div class="lab">Genel linkiniz</div><div class="linkbox" style="margin-top:10px"><code>${esc(link)}</code><button class="btn sm" data-copy="${esc(link)}">Kopyala</button></div></div>
   <div id="stats" style="margin-top:22px"></div>
   <div class="tabs" style="margin-top:30px"><button data-t="siparis" class="on">Siparişler</button><button data-t="kombin">Kombin performansı</button><button data-t="link">Kombin linkleri</button><button data-t="odeme">Ödemeler</button><button data-t="kural">Oranlar ve kurallar</button><button data-t="hesap">Hesap bilgileri</button></div>
   <section id="tv"></section>`;
  $$('#rg button').forEach(b => b.onclick = () => { RANGE = +b.dataset.r; $$('#rg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  const tabs = { siparis, kombin, link: links, odeme, kural, hesap };
  let T = 'siparis';
  $$('.tabs button').forEach(b => b.onclick = () => { T = b.dataset.t; $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); tabs[T](); });
  bindCopy(root);

  const inRange = t => { if (!RANGE) return true; const d = toDate(t); return d && Date.now() - d <= RANGE * 864e5; };
  let C, SL;
  function draw() {
    C = clicks.filter(c => inRange(c.at)); SL = sales.filter(s => inRange(s.createdAt));
    const ok = SL.filter(s => s.status !== 'iptal');
    const sum = (arr, f) => round2(arr.reduce((a, x) => a + (x[f] || 0), 0));
    const pend = sum(SL.filter(s => s.status === 'beklemede'), 'commission'), appr = sum(sales.filter(s => s.status === 'onayli'), 'commission');
    const paid = sum(pays, 'net'), cancel = sum(SL.filter(s => s.status === 'iptal'), 'commission');
    const uniq = new Set(C.map(c => c.vid)).size, conv = uniq ? ok.length / uniq * 100 : 0;
    const stop = INF.taxType === 'sirket' ? 0 : S.stopaj;
    $('#stats').innerHTML = `<div class="grid g4">
      ${st('Tıklama', C.length, uniq + ' tekil ziyaretçi')}${st('Sipariş', ok.length, 'Dönüşüm ' + pct(round2(conv)))}
      ${st('Satış tutarı', tl(sum(ok, 'total')), 'KDV hariç ' + tl(sum(ok, 'net')))}${st('Kazanç (dönem)', tl(sum(ok, 'commission')), 'İptal/iade: ' + tl(cancel))}</div>
      <div class="grid g3" style="margin-top:18px">
      <div class="card"><div class="lab">Bekleyen komisyon</div><div class="big" style="margin-top:8px">${tl(pend)}</div><p class="muted" style="font-size:12.5px;margin-top:6px">Teslim edilip iade süresi tamamlanınca onaylanır.</p></div>
      <div class="card gold"><div class="lab">Ödenebilir bakiye</div><div class="big" style="margin-top:8px">${tl(appr)}</div><p class="muted" style="font-size:12.5px;margin-top:6px">${stop ? `Stopaj (%${stop}) sonrası tahmini net: <b style="color:var(--paper)">${tl(appr * (1 - stop / 100))}</b>` : 'Şirket faturasıyla ödenir.'}</p></div>
      <div class="card"><div class="lab">Toplam ödenen</div><div class="big" style="margin-top:8px">${tl(paid)}</div><p class="muted" style="font-size:12.5px;margin-top:6px">${pays.length} ödeme</p></div></div>
      <div class="grid g2" style="margin-top:18px"><div class="card"><div class="lab">Günlük tıklama</div>${bars(C.map(c => ({ t: c.at, v: 1 })), 'tıklama')}</div>
       <div class="card"><div class="lab">Günlük kazanç</div>${bars(ok.map(s => ({ t: s.createdAt, v: s.commission })), 'TL', true)}</div></div>`;
    tabs[T]();
  }
  function siparis() {
    const v = $('#tv');
    v.innerHTML = SL.length ? `<div class="card scroll"><table class="tbl"><tr><th>Tarih</th><th>Sipariş</th><th>Kombinler</th><th class="num">Tutar</th><th class="num">KDV hariç</th><th class="num">Komisyon</th><th>Durum</th></tr>
      ${SL.sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)).map(s => {
        const ks = [...new Map(s.lines.map(l => [l.kombinId, l])).values()];
        return `<tr><td>${fmtDate(s.createdAt, 1)}</td><td>#${esc(s.orderNo)}</td>
        <td style="font-size:12.5px">${ks.map(l => `${esc(l.kombinName)} ${l.linked ? '<span class="badge gold">linkli</span>' : `<span class="badge">link dışı %${S.offLinkRate}</span>`}`).join('<br>')}</td>
        <td class="num">${tl(s.total)}</td><td class="num">${tl(s.net)}</td><td class="num"><b>${tl(s.commission)}</b></td>
        <td><span class="badge ${{ beklemede: 'warn', onayli: 'ok', odendi: 'gold', iptal: 'bad' }[s.status]}">${{ beklemede: 'Beklemede', onayli: 'Onaylandı', odendi: 'Ödendi', iptal: 'İptal / iade' }[s.status]}</span></td></tr>`; }).join('')}</table></div>
      <p class="muted" style="font-size:12px;margin-top:10px">Müşteri bilgileri gizlilik gereği gösterilmez.</p>` : '<div class="empty">Bu dönemde sipariş yok. Linkinizi paylaşmaya başlayın.</div>';
  }
  function kombin() {
    const m = {};
    C.forEach(c => { if (!c.kombinId) return; (m[c.kombinId] ||= { c: 0, o: 0, s: 0, k: 0 }).c++; });
    SL.filter(s => s.status !== 'iptal').forEach(s => { const seen = new Set();
      s.lines.forEach(l => { const r = (m[l.kombinId] ||= { c: 0, o: 0, s: 0, k: 0 }); if (!seen.has(l.kombinId)) { r.o++; seen.add(l.kombinId); } r.s += l.price; r.k += l.commission; r.name = l.kombinName; }); });
    const rows = Object.entries(m).map(([id, r]) => ({ id, ...r, name: r.name || cat.kombins.find(k => k.id === id)?.name || id })).sort((a, b) => b.k - a.k);
    $('#tv').innerHTML = rows.length ? `<div class="card scroll"><table class="tbl"><tr><th>Kombin</th><th class="num">Tıklama</th><th class="num">Sipariş</th><th class="num">Satış</th><th class="num">Komisyon</th></tr>
      ${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.c}</td><td class="num">${r.o}</td><td class="num">${tl(r.s)}</td><td class="num"><b>${tl(r.k)}</b></td></tr>`).join('')}</table></div>`
      : '<div class="empty">Kombin bazlı veri yok. "Kombin linkleri" sekmesinden kombine özel link paylaşın.</div>';
  }
  function links() {
    const v = $('#tv');
    v.innerHTML = `<div class="card"><p class="muted" style="font-size:13px;margin-bottom:6px">Her kombin için size özel link. Linkteki kombinden ${pct(S.commissions.giyim)} gibi kategori oranı, aynı ziyarette alınan diğer kombinlerden ${pct(S.offLinkRate)} kazanırsınız.</p>
      ${cat.kombins.map(k => { const u = `${base}/kombin?id=${k.id}&ref=${INF.code}&k=${k.id}`;
        return `<div class="klink"><div class="im" data-k="${k.id}"></div><div><b class="serif" style="font-size:17px">${esc(k.name)}</b><div class="muted" style="font-size:12px;margin-top:3px">${WORLDS[k.world]} · ${tl(kombinTotal(k, cat.products))}</div></div>
        <button class="btn sm ghost" data-copy="${esc(u)}">Linki kopyala</button></div>`; }).join('') || '<div class="empty">Yayında kombin yok</div>'}</div>`;
    v.querySelectorAll('[data-k]').forEach(el => loadKombinImage(cat.kombins.find(k => k.id === el.dataset.k)).then(s => { if (s) el.style.backgroundImage = `url("${s}")`; }));
    bindCopy(v);
  }
  function odeme() {
    $('#tv').innerHTML = pays.length ? `<div class="card scroll"><table class="tbl"><tr><th>Tarih</th><th class="num">Sipariş sayısı</th><th class="num">Brüt</th><th class="num">Stopaj</th><th class="num">Net ödenen</th></tr>
      ${pays.sort((a, b) => (toDate(b.at) || 0) - (toDate(a.at) || 0)).map(p => `<tr><td>${fmtDate(p.at)}</td><td class="num">${p.count || '-'}</td><td class="num">${tl(p.gross)}</td><td class="num">${tl(p.stopaj)}</td><td class="num"><b>${tl(p.net)}</b></td></tr>`).join('')}</table></div>`
      : '<div class="empty">Henüz ödeme yapılmadı. Onaylanan komisyonlar düzenli olarak IBAN\'ınıza gönderilir.</div>';
  }
  function kural() { $('#tv').innerHTML = `<div class="card" style="max-width:640px"><div class="lab">Size uygulanan oranlar</div>${ratesTable(INF.customRates || {})}</div>`; }
  function hesap() {
    $('#tv').innerHTML = `<div class="card" style="max-width:640px"><div class="grid">
      <label class="f">Sosyal medya hesapları<input class="in" id="hh" value="${esc(INF.handles || '')}"></label>
      <label class="f">IBAN (ödemeler için)<input class="in" id="ib" value="${esc(INF.iban || '')}" placeholder="TR.."></label>
      <label class="f">Ödeme şekli<select class="in" id="tt"><option value="20b" ${INF.taxType !== 'sirket' ? 'selected' : ''}>20/B istisna belgesi</option><option value="sirket" ${INF.taxType === 'sirket' ? 'selected' : ''}>Şirket</option></select></label>
      <button class="btn" id="sv">Kaydet</button></div></div>`;
    $('#sv').onclick = async () => { const d = { handles: $('#hh').value.trim(), iban: $('#ib').value.replace(/\s+/g, '').toUpperCase(), taxType: $('#tt').value, updatedAt: serverTimestamp() };
      if (d.iban && !/^TR\d{24}$/.test(d.iban)) return toast('IBAN TR ile başlayan 26 karakter olmalı', 'bad');
      await updateDoc(doc(db, 'influencers', U.uid), d); Object.assign(INF, d); toast('Kaydedildi'); };
  }
  draw();
}
const st = (l, v, s) => `<div class="stat"><div class="lab">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
function bars(points, unit, money) {
  const days = Math.min(RANGE || 30, 30), out = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); out.push({ d, v: 0 }); }
  points.forEach(p => { const t = toDate(p.t); if (!t) return; const day = new Date(t); day.setHours(0, 0, 0, 0); const o = out.find(x => +x.d === +day); if (o) o.v += p.v; });
  const max = Math.max(1, ...out.map(o => o.v));
  return `<div class="bars">${out.map(o => `<div class="b" style="height:${o.v / max * 100}%" data-t="${o.d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}: ${money ? tl(o.v) : o.v + ' ' + unit}"></div>`).join('')}</div>
   <div class="bars-x"><span>${out[0].d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</span><span style="text-align:right">Bugün</span></div>`;
}
function bindCopy(scope) {
  scope.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Link kopyalandı'); } catch { prompt('Linki kopyalayın:', b.dataset.copy); } });
}
