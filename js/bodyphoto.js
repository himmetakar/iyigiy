// Giydirme (sanal deneme) için boydan fotoğraf ve talepler.
// Fotoğraf yalnızca sahibine ve admine görünür (firestore.rules: bodyPhotos), sahibi her an siler.
// Gemini anahtarı influencer tarayıcısına hiç gelmez: talepler admin panelindeki kuyrukta üretilir.
import { db, fs, compressImage, esc, toast } from './app.js';
const { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } = fs;

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
