// Giydirme (sanal deneme) için boydan fotoğraf ve talepler.
// Fotoğraf yalnızca sahibine ve admine görünür (firestore.rules: bodyPhotos), sahibi her an siler.
// Gemini anahtarı tarayıcıya hiç gelmez: görsel, Cloud Function (functions/index.js · tryonGenerate) ile
// sunucuda üretilir, anahtar Secret Manager'dadır. Kişi sonucu görür ve yayınlar (tryonDecide).
import { db, fs, fbApp, compressImage, esc, toast } from './app.js';
import { onSnapshot } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js';
const { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } = fs;

// action: 'publish' (gardıropta bu görselle yayınla) | 'retry' (yeniden üret) | 'cancel' (vazgeç)
export const tryonDecide = (kombinId, action) => httpsCallable(getFunctions(fbApp, 'europe-west3'), 'tryonDecide')({ kombinId, action });

// Bir kombinin giydirme durumunu canlı gösterir. Dönen fonksiyon dinlemeyi bırakır.
export function tryonPanel(el, kombinId, onDone = () => {}) {
  let last = '';
  return onSnapshot(doc(db, 'tryons', kombinId), async s => {
    const t = s.exists() ? s.data() : null, st = t?.status || 'yok';
    if (st === last && st !== 'onay') return; const prev = last; last = st;
    const changed = prev && prev !== st; // ilk okumada değil, yalnızca durum değişince haber ver
    const act = (a, label, cls = '') => `<button class="btn sm ${cls}" data-ta="${a}">${label}</button>`;
    if (st === 'yok') { el.innerHTML = ''; if (changed) onDone(st); return; }
    if (st === 'bekliyor' || st === 'uretiliyor') el.innerHTML = `<div class="tp wait"><i class="spin" style="margin:0;width:20px;height:20px"></i><div><b>Görseliniz hazırlanıyor</b><span>Genellikle 30-90 saniye sürer. Sayfadan ayrılabilirsiniz; hazır olunca burada onayınıza sunulur.</span></div></div>`;
    else if (st === 'hata') el.innerHTML = `<div class="tp"><div><b>Görsel üretilemedi</b><span>${esc(t.error || 'Bilinmeyen hata')}</span></div><div class="row" style="gap:8px;margin-top:10px">${act('retry', 'Tekrar dene')}${act('cancel', 'Vazgeç', 'ghost')}</div></div>`;
    else if (st === 'tamam') { el.innerHTML = `<div class="tp ok"><b>Gardırobunuzda sizin fotoğrafınızla yayında.</b></div>`; if (changed) onDone(st); }
    else if (st === 'onay') {
      const im = t.resultImage ? await getDoc(doc(db, 'kombinImages', t.resultImage)).catch(() => null) : null;
      el.innerHTML = `<div class="tp res"><img src="${im?.exists() ? im.data().data : ''}" alt="Giydirme sonucu"><div><b>Görseliniz hazır</b>
        <span>Beğendiyseniz yayınlayın; kombin gardırobunuzda bu görselle askıya çıkar. Beğenmediyseniz yeniden üretebilirsiniz.</span>
        <div class="row" style="gap:8px;margin-top:12px">${act('publish', 'Gardırobumda yayınla')}${act('retry', 'Yeniden üret', 'ghost')}${act('cancel', 'Vazgeç', 'ghost')}</div></div></div>`;
    }
    el.querySelectorAll('[data-ta]').forEach(b => b.onclick = async () => {
      el.querySelectorAll('[data-ta]').forEach(x => x.disabled = true); b.textContent = '…';
      try { await tryonDecide(kombinId, b.dataset.ta); if (b.dataset.ta === 'publish') toast('Kombininiz sizin fotoğrafınızla yayında'); if (b.dataset.ta === 'cancel') onDone('yok'); }
      catch (e) { console.error(e); toast(e.message || 'İşlem yapılamadı', 'bad'); el.querySelectorAll('[data-ta]').forEach(x => x.disabled = false); last = ''; }
    });
  }, e => { console.warn('tryon', e); el.innerHTML = ''; });
}
// Paylaşılan stil (stüdyo ve panel)
if (!document.getElementById('tpCss')) document.head.insertAdjacentHTML('beforeend', `<style id="tpCss">
.tp{margin-top:12px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:rgba(201,164,92,.05);font-size:13px;line-height:1.55}
.tp b{display:block;font-family:var(--f);font-size:13px;font-weight:600;margin:0;color:var(--paper)}.tp span{display:block;color:var(--soft);margin-top:3px}
.tp.wait{display:flex;gap:12px;align-items:center}.tp.ok b{color:var(--gold2);font-weight:500}
.tp.res{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:start}.tp .row .btn{padding:8px 12px;font-size:10.5px}.tp.res img{width:96px;aspect-ratio:9/16;object-fit:cover;border-radius:8px;background:#1c1a17}
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

// Kombin için giydirme talebi açar (talep kimliği = kombin kimliği).
// Önceki (ör. reddedilmiş) talep varsa silinip yenisi açılır; kurallar talebi güncellemeyi yalnızca admine verir.
export async function requestTryon(uid, k) {
  const ref = doc(db, 'tryons', k.id), old = await getDoc(ref).catch(() => null);
  if (old?.exists()) await deleteDoc(ref);
  await setDoc(doc(db, 'tryons', k.id), { uid, kombinId: k.id, kombinName: k.name || '', status: 'bekliyor', createdAt: serverTimestamp() });
  await updateDoc(doc(db, 'kombins', k.id), { tryon: 'bekliyor', updatedAt: serverTimestamp() });
}

// Yükleme + açık rıza formu. onDone(dataUrl) fotoğraf kaydedilince çağrılır.
export function photoForm(el, uid, onDone, current = null) {
  el.innerHTML = `<div class="upl"><label class="pv" id="bpv" ${current ? `style="background-image:url('${current}')"` : ''}>${current ? '' : '+'}<input type="file" accept="image/*" id="bpf" hidden></label>
    <div style="font-size:13px;line-height:1.6;color:var(--soft)">Tek kişinin olduğu, <b style="color:var(--paper)">baştan ayağa</b> göründüğü, iyi ışıklı ve sade arka planlı bir fotoğraf en iyi sonucu verir. Yüzünüz ve vücut hatlarınız korunur, yalnızca kıyafetler değişir.</div></div>
    <div class="consent">${esc(CONSENT_TEXT)}</div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="bpok"> Okudum, açık rıza veriyorum.</label>
    <button class="btn" id="bpgo" style="margin-top:14px;width:100%" disabled>Fotoğrafı kaydet</button>`;
  let file = null;
  const go = el.querySelector('#bpgo'), ok = el.querySelector('#bpok');
  const sync = () => { go.disabled = !(file && ok.checked); };
  el.querySelector('#bpf').onchange = e => { file = e.target.files[0] || null; if (file) { const u = URL.createObjectURL(file); const pv = el.querySelector('#bpv'); pv.style.backgroundImage = `url('${u}')`; pv.firstChild.nodeType === 3 && (pv.firstChild.textContent = ''); } sync(); };
  ok.onchange = sync;
  go.onclick = async () => { go.disabled = true; go.textContent = 'Kaydediliyor…';
    try { const d = await saveBodyPhoto(uid, file); onDone(d); } catch (e) { console.error(e); go.disabled = false; go.textContent = 'Tekrar dene'; toast(e.message, 'bad'); } };
}
