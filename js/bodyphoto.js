// Giydirme: kombin Gemini ile ya influencer'ın kendi üzerinde ya da seçtiği özelliklerde yeni bir manken üzerinde
// tek görselde üretilir. Gemini anahtarı tarayıcıya hiç gelmez: görsel Cloud Function'da (functions/index.js ·
// tryonGenerate) üretilir, anahtar Secret Manager'dadır.
// Yayın akışı: üretildi (onay) → influencer ürünleri kontrol edip gönderir (kontrol) → iyigiy ekibi onaylar (tamam).
// Boydan fotoğraf yalnızca sahibine ve admine görünür (firestore.rules: bodyPhotos), sahibi her an siler.
import { db, fs, fbApp, compressImage, esc, toast } from './app.js';
import { onSnapshot } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js';
const { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } = fs;

/* Manken ve çekim seçenekleri (anahtarlar functions/index.js ile aynı). */
export const WEAR = {
  look: { label: 'Görünüm', opts: { akdeniz: 'Akdenizli', avrupa: 'Avrupalı', asya: 'Doğu Asyalı', siyahi: 'Siyahi', latin: 'Latin', ortadogu: 'Orta Doğulu', guneyasya: 'Güney Asyalı' } },
  age: { label: 'Yaş', opts: { '20': '20\'li yaşlar', '30': '30\'lu yaşlar', '40': '40\'lı yaşlar', '50': '50+' } },
  build: { label: 'Beden', opts: { ince: 'İnce', orta: 'Orta', dolgun: 'Dolgun / büyük beden' } },
  pose: { label: 'Duruş', opts: { dogal: 'Doğal duruş', yuruyus: 'Yürürken', ucceyrek: 'Üç çeyrek dönük', rahat: 'Rahat, el cepte' } },
  scene: { label: 'Ortam', opts: { studyo: 'Siyah-altın stüdyo', beyaz: 'Açık renk stüdyo', sokak: 'Şehir sokağı', ic: 'Şık iç mekân' } }
};
const DEFAULTS = { look: 'akdeniz', age: '30', build: 'orta', pose: 'dogal', scene: 'studyo' };

// action: 'submit' (ekibin onayına gönder) | 'retry' (yeniden üret) | 'cancel' (vazgeç) | admin: 'approve' | 'reject'
export const tryonDecide = (kombinId, action, note) => httpsCallable(getFunctions(fbApp, 'europe-west3'), 'tryonDecide')({ kombinId, action, note });

// Kombin için giydirme talebi açar (talep kimliği = kombin kimliği). Varsa eski talep silinip yenisi açılır.
// wear: { subject: 'self' | 'model', options: {look, age, build, pose, scene} }
export async function requestTryon(uid, k, wear = { subject: 'self', options: {} }) {
  const ref = doc(db, 'tryons', k.id), old = await getDoc(ref).catch(() => null);
  if (old?.exists()) await deleteDoc(ref);
  const options = {}; for (const key in WEAR) { const v = wear.options?.[key]; if (v in WEAR[key].opts) options[key] = v; }
  await setDoc(ref, { uid, kombinId: k.id, kombinName: k.name || '', subject: wear.subject === 'model' ? 'model' : 'self', options, status: 'bekliyor', createdAt: serverTimestamp() });
  await updateDoc(doc(db, 'kombins', k.id), { tryon: 'bekliyor', updatedAt: serverTimestamp() });
}

/* "Kombininizi kim giysin?" seçici. Talep açılınca onRequested() çağrılır. */
export function wearPicker(el, uid, k, onRequested) {
  const sel = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem('iy_wear') || '{}')) };
  let subject = 'model', body = null;
  const chips = key => `<div class="wp-g"><div class="lab">${WEAR[key].label}</div><div class="chips">${Object.entries(WEAR[key].opts).map(([v, l]) =>
    `<button class="chip ${sel[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
  const draw = () => {
    el.innerHTML = `<div class="wp">
      <div class="wp-s"><button class="wp-o ${subject === 'model' ? 'on' : ''}" data-s="model"><i>✦</i><b>Bir manken üzerinde</b><span>Seçtiğiniz özelliklerde, bu kombine özel yeni bir manken</span></button>
        <button class="wp-o ${subject === 'self' ? 'on' : ''}" data-s="self"><i>◐</i><b>Kendi üzerimde</b><span>Boydan fotoğrafınızla, yüzünüz ve hatlarınız korunarak</span></button></div>
      ${subject === 'model' ? ['look', 'age', 'build'].map(chips).join('') : '<div id="wp-self"></div>'}
      ${['pose', 'scene'].map(chips).join('')}
      <p class="muted" style="font-size:12px;line-height:1.6;margin-top:14px">Görsel, lüks moda kampanyası kalitesinde tek karede üretilir; ürünler aslına uygun ve zarif biçimde giydirilir. Sonucu siz kontrol edersiniz, ardından ekibimiz onaylayınca yayına çıkar.</p>
      <button class="btn" id="wp-go" style="width:100%;margin-top:14px">Giydir</button></div>`;
    el.querySelectorAll('.wp-o').forEach(b => b.onclick = () => { subject = b.dataset.s; draw(); });
    el.querySelectorAll('.chip[data-k]').forEach(c => c.onclick = () => { sel[c.dataset.k] = c.dataset.v; el.querySelectorAll(`.chip[data-k="${c.dataset.k}"]`).forEach(x => x.classList.toggle('on', x === c)); });
    if (subject === 'self') selfBox();
    el.querySelector('#wp-go').onclick = go;
  };
  const selfBox = async () => {
    const box = el.querySelector('#wp-self'); if (!box) return;
    body = body || await getBodyPhoto(uid);
    if (body) box.innerHTML = `<div class="upl" style="grid-template-columns:72px 1fr"><div class="pv" style="width:72px;background-image:url('${body.data}');cursor:default"></div>
      <div style="font-size:12.5px;color:var(--soft);line-height:1.6">Kayıtlı boydan fotoğrafınız kullanılacak. Değiştirmek ya da silmek için panelinizdeki “Boydan fotoğraf” sekmesini kullanın.</div></div>`;
    else { box.innerHTML = '<div id="wp-pf"></div>'; photoForm(box.querySelector('#wp-pf'), uid, d => { body = { data: d }; draw(); }); el.querySelector('#wp-go').style.display = 'none'; }
  };
  const go = async () => {
    const b = el.querySelector('#wp-go'); b.disabled = true; b.textContent = 'Gönderiliyor…';
    try {
      if (subject === 'self' && !(body || await getBodyPhoto(uid))) throw new Error('Önce boydan fotoğrafınızı yükleyin');
      try { localStorage.setItem('iy_wear', JSON.stringify(sel)); } catch {}
      await requestTryon(uid, k, { subject, options: sel });
      onRequested();
    } catch (e) { console.error(e); toast(e.message || 'Gönderilemedi', 'bad'); b.disabled = false; b.textContent = 'Giydir'; }
  };
  draw();
}

/* Bir kombinin giydirme durumunu canlı gösterir. Dönen fonksiyon dinlemeyi bırakır.
   onState(durum) yalnızca durum değişince çağrılır; 'yok' gelirse çağıran seçiciyi yeniden gösterebilir. */
export function tryonPanel(el, kombinId, onState = () => {}) {
  let last = '';
  return onSnapshot(doc(db, 'tryons', kombinId), async s => {
    const t = s.exists() ? s.data() : null, st = t?.status || 'yok';
    if (st === last) return; const prev = last; last = st;
    const act = (a, label, cls = '') => `<button class="btn sm ${cls}" data-ta="${a}">${label}</button>`;
    const img = async () => { const im = t.resultImage ? await getDoc(doc(db, 'kombinImages', t.resultImage)).catch(() => null) : null; return im?.exists() ? im.data().data : ''; };
    const who = t?.subject === 'model' ? 'manken üzerinde' : 'sizin üzerinizde';
    if (st === 'yok') el.innerHTML = '';
    else if (st === 'bekliyor' || st === 'uretiliyor') el.innerHTML = `<div class="tp wait"><i class="spin" style="margin:0;width:20px;height:20px"></i><div><b>Kombininiz ${who} giydiriliyor</b><span>Genellikle 30-90 saniye sürer. Sayfadan ayrılabilirsiniz; hazır olunca burada kontrolünüze sunulur.</span></div></div>`;
    else if (st === 'hata') el.innerHTML = `<div class="tp"><b>Görsel üretilemedi</b><span>${esc(t.error || 'Bilinmeyen hata')}</span><div class="row" style="gap:8px;margin-top:10px">${act('retry', 'Tekrar dene')}${act('cancel', 'Seçimi değiştir', 'ghost')}</div></div>`;
    else if (st === 'onay') {
      el.innerHTML = `<div class="tp res"><img src="${await img()}" alt="Giydirme sonucu" data-zoom><div><b>Görsel hazır: ürünleri kontrol edin</b>
        <span>Her parçanın rengi, modeli ve detayı görselde doğru mu? Doğruysa ekibimizin onayına gönderin; onaydan sonra gardırobunuzda yayına çıkar.</span>
        <label class="check" style="margin-top:10px;font-size:12.5px"><input type="checkbox" data-ok> Ürünlerin görselde doğru göründüğünü kontrol ettim.</label>
        <div class="row" style="gap:8px;margin-top:10px">${act('submit', 'Onaya gönder')}${act('retry', 'Yeniden üret', 'ghost')}${act('cancel', 'Seçimi değiştir', 'ghost')}</div></div></div>`;
      const sb = el.querySelector('[data-ta="submit"]'), ok = el.querySelector('[data-ok]'); sb.disabled = true; ok.onchange = () => sb.disabled = !ok.checked;
    }
    else if (st === 'kontrol') el.innerHTML = `<div class="tp res"><img src="${await img()}" alt="" data-zoom><div><b>iyigiy ekibinin kontrolünde</b><span>Görseliniz onaylanınca kombin gardırobunuzda bu görselle yayına çıkar. Genellikle aynı gün içinde sonuçlanır.</span></div></div>`;
    else if (st === 'red') el.innerHTML = `<div class="tp"><b>Ekibimiz görseli onaylamadı</b><span>${esc(t.note || 'Ürünler görselde tam doğru görünmüyor.')}</span><div class="row" style="gap:8px;margin-top:10px">${act('retry', 'Yeniden üret')}${act('cancel', 'Seçimi değiştir', 'ghost')}</div></div>`;
    else if (st === 'tamam') el.innerHTML = `<div class="tp ok"><b>Onaylandı: kombininiz bu görselle gardırobunuzda yayında.</b></div>`;
    el.querySelectorAll('[data-zoom]').forEach(i => i.onclick = () => window.open().document.write(`<body style="margin:0;background:#000"><img src="${i.src}" style="max-width:100%;display:block;margin:auto">`));
    el.querySelectorAll('[data-ta]').forEach(b => b.onclick = async () => {
      el.querySelectorAll('[data-ta]').forEach(x => x.disabled = true); b.textContent = '…';
      try { await tryonDecide(kombinId, b.dataset.ta); if (b.dataset.ta === 'submit') toast('Ekibimizin onayına gönderildi'); }
      catch (e) { console.error(e); toast(e.message || 'İşlem yapılamadı', 'bad'); last = ''; el.querySelectorAll('[data-ta]').forEach(x => x.disabled = false); }
    });
    if (prev && prev !== st) onState(st);
    else if (!prev && st === 'yok') onState(st);
  }, e => { console.warn('tryon', e); el.innerHTML = ''; });
}
// Paylaşılan stil (stüdyo ve panel)
if (!document.getElementById('tpCss')) document.head.insertAdjacentHTML('beforeend', `<style id="tpCss">
.tp{margin-top:12px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:rgba(201,164,92,.05);font-size:13px;line-height:1.55}
.tp b{display:block;font-family:var(--f);font-size:13px;font-weight:600;margin:0;color:var(--paper)}.tp span{display:block;color:var(--soft);margin-top:3px}
.tp.wait{display:flex;gap:12px;align-items:center}.tp.ok b{color:var(--gold2);font-weight:500}
.tp.res{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:start}.tp .row .btn{padding:8px 12px;font-size:10.5px}
.tp.res img{width:96px;aspect-ratio:9/16;object-fit:cover;border-radius:8px;background:#1c1a17;cursor:zoom-in}
.wp-s{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.wp-o{text-align:left;border:1px solid var(--line2);border-radius:14px;padding:14px;background:var(--bg);transition:.25s}
.wp-o:hover{border-color:var(--line)}.wp-o.on{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold);background:rgba(201,164,92,.06)}
.wp-o i{font-style:normal;color:var(--gold2);font-size:18px}.wp-o b{display:block;font-size:13.5px;font-weight:600;margin-top:6px}.wp-o span{display:block;font-size:11.5px;color:var(--soft);line-height:1.45;margin-top:4px}
.wp-g{margin-top:16px}.wp-g .lab{margin-bottom:8px}.wp-g .chips{gap:6px}.wp-g .chip{padding:7px 12px;font-size:12px}
.upl{display:grid;grid-template-columns:96px 1fr;gap:14px;align-items:center;margin-top:16px}
.upl .pv{width:96px;aspect-ratio:3/4;border-radius:10px;border:1px dashed var(--line);background:#1c1a17 center/cover;display:grid;place-items:center;color:var(--gold);font-size:24px;cursor:pointer}
.consent{margin-top:14px;font-size:12px;color:var(--soft);line-height:1.65;background:var(--bg);border:1px solid var(--line2);border-radius:10px;padding:12px 14px}
</style>`);

export const CONSENT_TEXT = 'Yüklediğim boydan fotoğrafımın, seçtiğim kombinlerin üzerimde nasıl duracağını gösteren görseller üretmek amacıyla ' +
  'iyigiy tarafından işlenmesine ve bu amaçla görsel üretim hizmeti sağlayıcısına (Google Gemini, yurt dışı) aktarılmasına açık rıza veriyorum. ' +
  'Fotoğrafım herkese açık yayınlanmaz; yalnızca ben ve iyigiy ekibi görebilir. Fotoğrafımı dilediğim an bu panelden silebilirim. ' +
  'Üretilen kombin görselleri, ben kaldırana kadar kişisel mağazamda yayınlanır.';

export async function getBodyPhoto(uid) {
  const s = await getDoc(doc(db, 'bodyPhotos', uid));
  return s.exists() ? s.data() : null;
}
export async function saveBodyPhoto(uid, file) {
  if (!/^image\//.test(file.type)) throw new Error('Lütfen bir fotoğraf seçin');
  const data = await compressImage(file, 1400, .86);
  if (data.length > 950000) throw new Error('Fotoğraf çok büyük');
  await setDoc(doc(db, 'bodyPhotos', uid), { data, consent: true, consentText: CONSENT_TEXT, consentAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return data;
}
export const deleteBodyPhoto = uid => deleteDoc(doc(db, 'bodyPhotos', uid));

// Yükleme + açık rıza formu. onDone(dataUrl) fotoğraf kaydedilince çağrılır.
export function photoForm(el, uid, onDone, current = null) {
  el.innerHTML = `<div class="upl"><label class="pv" id="bpv" ${current ? `style="background-image:url('${current}')"` : ''}><span>${current ? '' : '+'}</span><input type="file" accept="image/*" id="bpf" hidden></label>
    <div style="font-size:13px;line-height:1.6;color:var(--soft)">Tek kişinin olduğu, <b style="color:var(--paper)">baştan ayağa</b> göründüğü, iyi ışıklı ve sade arka planlı bir fotoğraf en iyi sonucu verir. Yüzünüz ve vücut hatlarınız korunur, yalnızca kıyafetler değişir.</div></div>
    <div class="consent">${esc(CONSENT_TEXT)}</div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="bpok"> Okudum, açık rıza veriyorum.</label>
    <button class="btn" id="bpgo" style="margin-top:14px;width:100%" disabled>Fotoğrafı kaydet</button>`;
  let file = null;
  const go = el.querySelector('#bpgo'), ok = el.querySelector('#bpok');
  const sync = () => { go.disabled = !(file && ok.checked); };
  el.querySelector('#bpf').onchange = e => { file = e.target.files[0] || null;
    if (file) { const pv = el.querySelector('#bpv'); pv.style.backgroundImage = `url('${URL.createObjectURL(file)}')`; pv.querySelector('span').textContent = ''; } sync(); };
  ok.onchange = sync;
  go.onclick = async () => { go.disabled = true; go.textContent = 'Kaydediliyor…';
    try { const d = await saveBodyPhoto(uid, file); onDone(d); } catch (e) { console.error(e); go.disabled = false; go.textContent = 'Tekrar dene'; toast(e.message, 'bad'); } };
}
