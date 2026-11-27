// iyigiy Cloud Functions
// Giydirme (sanal deneme): influencer boydan fotoğrafını ve kombin ürünlerini Gemini'ye gönderip
// kendi üzerinde kombin görseli üretir. Gemini anahtarı yalnızca Secret Manager'dadır (GEMINI_API_KEY);
// tarayıcıya hiçbir zaman gitmez.
//
// Akış (tryons/{kombinId}.status):
//   bekliyor  → (tetikleyici) uretiliyor → onay   : görsel hazır, sahibinin onayını bekler
//                                       → hata   : üretilemedi (error alanında neden)
//   onay      → tryonDecide('publish') → tamam   : kombin görseli bu görsel olur, gardıropta yayınlanır
//             → tryonDecide('retry')   → bekliyor: yeniden üretilir (deneme sınırı var)
//             → tryonDecide('cancel')  → talep ve görsel silinir
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const sharp = require('sharp');

initializeApp();
const db = getFirestore();
const GEMINI_KEY = defineSecret('GEMINI_API_KEY');
setGlobalOptions({ region: 'europe-west3', maxInstances: 5 });

const SITE = 'https://iyigiy-39c89.web.app';
const ADMIN_EMAILS = ['himmet.akarr@gmail.com', 'himmettakarr@gmail.com'];
const MAX_ATTEMPTS = 6;          // bir kombin için en fazla üretim denemesi (maliyet sınırı)
const DEFAULT_MODEL = 'gemini-3-pro-image';

/* ---------------- görsel yardımcıları ---------------- */
async function loadImage(src) {
  if (!src) throw new Error('boş görsel');
  let buf;
  if (src.startsWith('data:')) buf = Buffer.from(src.split(',')[1], 'base64');
  else {
    const url = src.startsWith('/') ? SITE + src : src;
    if (!/^https:\/\//.test(url)) throw new Error('desteklenmeyen görsel adresi');
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('görsel alınamadı: HTTP ' + r.status);
    buf = Buffer.from(await r.arrayBuffer());
  }
  // Gemini'ye giden her görsel en fazla 1024 px JPEG (hız ve maliyet için)
  const out = await sharp(buf).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  return { mimeType: 'image/jpeg', data: out.toString('base64') };
}
// Firestore belge sınırı (1 MB) için çıktıyı küçültür.
async function toStoredDataUrl(b64) {
  let q = 84, out;
  do { out = await sharp(Buffer.from(b64, 'base64')).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true }).toBuffer(); q -= 8; }
  while (out.length > 700000 && q > 50);
  return 'data:image/jpeg;base64,' + out.toString('base64');
}

async function generate(key, model, body, products) {
  const parts = [{ inlineData: body }];
  const used = [];
  for (const p of products) {
    try { parts.push({ inlineData: await loadImage(p.images?.[0]) }); used.push(p); }
    catch (e) { logger.warn('ürün görseli atlandı', p.id, e.message); }
  }
  if (!used.length) throw new Error('Ürün görselleri okunamadı');
  const list = used.map((p, i) => `image ${i + 2}: the ${p.name} (${(p.colors || []).join('/')})`).join('; ');
  parts.push({ text: `Image 1 is a photo of a real person. Images 2 to ${used.length + 1} are product photos of clothing and accessories. Create one new photorealistic full-length fashion photograph of THE SAME PERSON from image 1: keep their face, facial features, hair, skin tone, body shape and proportions exactly as they are, so they are clearly recognisable as the same individual. They now wear, as one complete outfit, exactly these items reproduced faithfully in colour, cut, fabric and details: ${list}. If a bag is given they carry it naturally; if no shoes are given, add simple shoes that suit the outfit. Natural relaxed standing pose facing the camera, whole figure from head to toe, centred, with space above the head and below the feet. Elegant minimal studio set: deep warm charcoal backdrop, soft golden key light, subtle floor reflection, editorial luxury look, real skin and fabric texture. No text, no logos, no watermark.` });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16', imageSize: '1K' } } }),
    signal: AbortSignal.timeout(240000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || ('Gemini HTTP ' + r.status));
  const img = j.candidates?.[0]?.content?.parts?.find(x => x.inlineData);
  if (!img) throw new Error('Model görsel döndürmedi' + (j.candidates?.[0]?.finishReason ? ' (' + j.candidates[0].finishReason + ')' : ''));
  return img.inlineData.data;
}

/* ---------------- tetikleyici: talep "bekliyor" olunca üret ---------------- */
exports.tryonGenerate = onDocumentWritten(
  { document: 'tryons/{id}', secrets: [GEMINI_KEY], memory: '1GiB', timeoutSeconds: 300 },
  async event => {
    const after = event.data?.after;
    if (!after?.exists || after.data().status !== 'bekliyor') return;
    const ref = after.ref;
    // Aynı talep iki kez işlenmesin
    const t = await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists || s.data().status !== 'bekliyor') return null;
      const attempts = (s.data().attempts || 0) + 1;
      if (attempts > MAX_ATTEMPTS) { tx.update(ref, { status: 'hata', error: 'Deneme sınırına ulaşıldı' }); return null; }
      tx.update(ref, { status: 'uretiliyor', attempts, startedAt: FieldValue.serverTimestamp(), error: FieldValue.delete() });
      return s.data();
    });
    if (!t) return;
    const kRef = db.doc('kombins/' + t.kombinId);
    try {
      const [ks, bs, ss] = await Promise.all([kRef.get(), db.doc('bodyPhotos/' + t.uid).get(), db.doc('settings/main').get()]);
      if (!ks.exists || ks.data().ownerUid !== t.uid) throw new Error('Kombin bulunamadı');
      if (!bs.exists) throw new Error('Boydan fotoğraf bulunamadı (silinmiş olabilir)');
      const k = ks.data();
      const ids = [...(k.productIds || []), ...(k.extraIds || [])];
      const ps = (await Promise.all(ids.map(id => db.doc('products/' + id).get()))).filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));
      const model = ss.exists && ss.data().geminiModel || DEFAULT_MODEL;
      const body = await loadImage(bs.data().data);
      const out = await generate(GEMINI_KEY.value().trim(), model, body, ps);
      const data = await toStoredDataUrl(out);
      const imgRef = db.collection('kombinImages').doc(`${t.kombinId}-tryon-${Date.now().toString(36)}`);
      await imgRef.set({ data, kombinId: t.kombinId, ownerUid: t.uid, kind: 'giydirme', model, createdAt: FieldValue.serverTimestamp() });
      const old = (await ref.get()).data()?.resultImage;
      await ref.update({ status: 'onay', resultImage: imgRef.id, generatedAt: FieldValue.serverTimestamp() });
      await kRef.update({ tryon: 'onay' });
      if (old && old !== imgRef.id) await db.doc('kombinImages/' + old).delete().catch(() => {});
      logger.info('giydirme hazır', { kombin: t.kombinId, model });
    } catch (e) {
      logger.error('giydirme üretilemedi', { kombin: t.kombinId, err: e.message });
      await ref.update({ status: 'hata', error: String(e.message || e).slice(0, 300) }).catch(() => {});
      await kRef.update({ tryon: 'hata' }).catch(() => {});
    }
  });

/* ---------------- karar: yayınla / yeniden üret / vazgeç ---------------- */
exports.tryonDecide = onCall({ cors: true }, async req => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Giriş gerekli');
  const { kombinId, action } = req.data || {};
  if (typeof kombinId !== 'string' || !['publish', 'retry', 'cancel'].includes(action)) throw new HttpsError('invalid-argument', 'Geçersiz istek');
  const isAdmin = req.auth.token.email_verified === true && ADMIN_EMAILS.includes(req.auth.token.email);
  const ref = db.doc('tryons/' + kombinId), kRef = db.doc('kombins/' + kombinId);
  const [ts, ks] = await Promise.all([ref.get(), kRef.get()]);
  if (!ts.exists || !ks.exists) throw new HttpsError('not-found', 'Talep bulunamadı');
  const t = ts.data(), k = ks.data();
  if (t.uid !== uid && !isAdmin) throw new HttpsError('permission-denied', 'Bu talep size ait değil');

  if (action === 'publish') {
    if (t.status !== 'onay' || !t.resultImage) throw new HttpsError('failed-precondition', 'Yayınlanacak görsel yok');
    const old = k.image?.startsWith('img:') ? k.image.slice(4) : null;
    await kRef.update({ image: 'img:' + t.resultImage, tryon: 'hazir', updatedAt: FieldValue.serverTimestamp() });
    await ref.update({ status: 'tamam', doneAt: FieldValue.serverTimestamp() });
    if (old && old !== t.resultImage) await db.doc('kombinImages/' + old).delete().catch(() => {});
    return { ok: true };
  }
  if (action === 'retry') {
    if (!['onay', 'hata'].includes(t.status)) throw new HttpsError('failed-precondition', 'Görsel zaten hazırlanıyor');
    if ((t.attempts || 0) >= MAX_ATTEMPTS && !isAdmin) throw new HttpsError('resource-exhausted', 'Bu kombin için deneme sınırına ulaşıldı');
    if (isAdmin && (t.attempts || 0) >= MAX_ATTEMPTS) await ref.update({ attempts: 0 });
    await ref.update({ status: 'bekliyor' });
    await kRef.update({ tryon: 'bekliyor' });
    return { ok: true };
  }
  // cancel
  if (t.resultImage && t.status !== 'tamam') await db.doc('kombinImages/' + t.resultImage).delete().catch(() => {});
  await ref.delete();
  if (k.tryon !== 'hazir') await kRef.update({ tryon: 'yok' });
  return { ok: true };
});
