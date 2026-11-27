// iyigiy Cloud Functions
// Giydirme (sanal deneme): influencer boydan fotoğrafını ve kombin ürünlerini Gemini'ye gönderip
// kendi üzerinde kombin görseli üretir. Gemini anahtarı yalnızca Secret Manager'dadır (GEMINI_API_KEY);
// tarayıcıya hiçbir zaman gitmez.
//
// Akış (tryons/{kombinId}.status):
//   bekliyor  → (tetikleyici) uretiliyor → onay   : görsel hazır, sahibinin onayını bekler
//                                       → hata   : üretilemedi (error alanında neden)
//   onay      → tryonDecide("submit")  → kontrol : influencer ürünlerin doğru olduğunu onaylayıp gönderdi
//   kontrol   → tryonDecide("approve") → tamam   : iyigiy ekibi onayladı; kombin bu görselle gardıropta yayında
//             → tryonDecide("reject")  → red     : ekip not ile geri çevirdi (yeniden üretilebilir)
//             → tryonDecide('retry')   → bekliyor: yeniden üretilir (deneme sınırı var)
//             → tryonDecide('cancel')  → talep ve görsel silinir
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore');
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
const MAX_ATTEMPTS = 8;          // bir kombin için en fazla görsel üretimi (maliyet sınırı)
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

/* Influencer'ın seçebildiği manken ve çekim özellikleri (js/bodyphoto.js ile aynı anahtarlar). */
const LOOKS = { avrupa: 'Northern or Western European', akdeniz: 'Mediterranean (Turkish, Italian or Greek)', asya: 'East Asian', siyahi: 'Black, of African descent',
  latin: 'Latin American', ortadogu: 'Middle Eastern', guneyasya: 'South Asian' };
const AGES = { '20': 'in their twenties', '30': 'in their thirties', '40': 'in their forties', '50': 'in their fifties' };
const BODIES = { ince: 'a slim build', orta: 'an average, healthy build', dolgun: 'a curvy, plus-size build' };
const POSES = { dogal: 'natural relaxed standing pose facing the camera', yuruyus: 'confident mid-stride walk towards the camera, natural arm swing',
  ucceyrek: 'three-quarter turn towards the camera, weight on one leg', rahat: 'relaxed stance with one hand in a pocket or resting on the hip' };
const SCENES = { studyo: 'elegant minimal studio set: deep warm charcoal backdrop, soft golden key light, subtle floor reflection, editorial luxury look',
  beyaz: 'bright minimal studio: seamless warm off-white backdrop, soft diffused light, clean e-commerce editorial look',
  sokak: 'stylish European city street in soft daylight, shallow depth of field, editorial street-style look',
  ic: 'refined interior with warm wood, stone and soft lamp light, quiet luxury editorial look' };
const pickKey = (map, k, d) => (Object.prototype.hasOwnProperty.call(map, k) ? k : d);

// opts: { gender: 'kadin'|'erkek', subject: 'self'|'model', body?: inlineImage, look, age, build, pose, scene }
async function generate(key, model, opts, products) {
  const self = opts.subject === 'self';
  const parts = self ? [{ inlineData: opts.body }] : [];
  const used = [];
  for (const p of products) {
    try { parts.push({ inlineData: await loadImage(p.images?.[0]) }); used.push(p); }
    catch (e) { logger.warn('ürün görseli atlandı', p.id, e.message); }
  }
  if (!used.length) throw new Error('Ürün görselleri okunamadı');
  const off = self ? 2 : 1;
  const list = used.map((p, i) => `image ${i + off}: the ${p.name} (${(p.colors || []).join('/')})`).join('; ');
  const pose = POSES[pickKey(POSES, opts.pose, 'dogal')], scene = SCENES[pickKey(SCENES, opts.scene, 'studyo')];
  const person = self
    ? `Image 1 is a photo of a real person. Images 2 to ${used.length + 1} are product photos of clothing and accessories. Create one new photorealistic full-length fashion photograph of THE SAME PERSON from image 1: keep their face, facial features, hair, skin tone, body shape and proportions exactly as they are, so they are clearly recognisable as the same individual.`
    : `Images 1 to ${used.length} are product photos of clothing and accessories. In a single image, create one new photorealistic full-length photograph of a completely new, unique professional ${opts.gender === 'erkek' ? 'male' : 'female'} runway and campaign model already wearing the outfit: ${LOOKS[pickKey(LOOKS, opts.look, 'akdeniz')]}, ${AGES[pickKey(AGES, opts.age, '30')]}, with ${BODIES[pickKey(BODIES, opts.build, 'orta')]}. Refined, poised, high-fashion presence with a calm, self-assured expression; a distinctive face and tidy, styled hair of their own. Do not copy any person shown in the product photos.`;
  // Lüks moda evi kampanyası estetiği; kesinlikle zarif ve örtünük (müstehcenlik yok). Marka adı/logo kullanılmaz.
  parts.push({ text: `${person} They wear, as one complete outfit, exactly these items reproduced faithfully in colour, cut, fabric, length, fit and details: ${list}. Wear every garment the way it is designed to be worn and keep its true coverage; do not shorten, crop, open, unbutton, make sheer or tighten anything, and do not add or remove garments. If a bag is given they carry it naturally; if no shoes are given, add simple elegant shoes that suit the outfit. Pose: ${pose}. Whole figure from head to toe, centred, with space above the head and below the feet. Setting: ${scene}. The image must look like an official campaign photograph of a top Italian luxury fashion house: impeccable styling, sophisticated art direction, flawless but real skin and fabric texture, natural proportions, premium medium-format quality. Strictly tasteful and modest, suitable for all audiences: no nudity, no exposed underwear, no lingerie styling, no suggestive or sexualised pose, gaze or framing, no cleavage emphasis. No text, no brand names, no logos, no watermark.` });
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
    // Maliyet sınırı kombin başına tutulur (tryonUsage yalnızca sunucuya açık); talep silinip yeniden açılsa da sıfırlanmaz.
    const uRef = db.doc('tryonUsage/' + event.params.id);
    const t = await db.runTransaction(async tx => {
      const [s, u] = [await tx.get(ref), await tx.get(uRef)];
      if (!s.exists || s.data().status !== 'bekliyor') return null;
      const used = (u.exists ? u.data().count : 0) + 1, extra = u.exists ? u.data().extra || 0 : 0;
      if (used > MAX_ATTEMPTS + extra) { tx.update(ref, { status: 'hata', error: 'Bu kombin için görsel üretim sınırına ulaşıldı. Ekibimizle iletişime geçin.' }); return null; }
      tx.set(uRef, { count: used, uid: s.data().uid, lastAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.update(ref, { status: 'uretiliyor', attempts: (s.data().attempts || 0) + 1, startedAt: FieldValue.serverTimestamp(), error: FieldValue.delete() });
      return s.data();
    });
    if (!t) return;
    const kRef = db.doc('kombins/' + t.kombinId);
    try {
      const self = t.subject !== 'model';
      const [ks, bs, ss] = await Promise.all([kRef.get(), self ? db.doc('bodyPhotos/' + t.uid).get() : null, db.doc('settings/main').get()]);
      if (!ks.exists || ks.data().ownerUid !== t.uid) throw new Error('Kombin bulunamadı');
      if (self && !bs.exists) throw new Error('Boydan fotoğraf bulunamadı (silinmiş olabilir)');
      const k = ks.data();
      const ids = [...(k.productIds || []), ...(k.extraIds || [])];
      const ps = (await Promise.all(ids.map(id => db.doc('products/' + id).get()))).filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));
      const model = ss.exists && ss.data().geminiModel || DEFAULT_MODEL;
      const o = t.options || {};
      const opts = { subject: self ? 'self' : 'model', gender: k.gender, look: o.look, age: o.age, build: o.build, pose: o.pose, scene: o.scene,
        body: self ? await loadImage(bs.data().data) : null };
      const out = await generate(GEMINI_KEY.value().trim(), model, opts, ps);
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
  const { kombinId, action, note } = req.data || {};
  if (typeof kombinId !== 'string' || !['submit', 'approve', 'reject', 'retry', 'cancel'].includes(action)) throw new HttpsError('invalid-argument', 'Geçersiz istek');
  const isAdmin = req.auth.token.email_verified === true && ADMIN_EMAILS.includes(req.auth.token.email);
  const ref = db.doc('tryons/' + kombinId), kRef = db.doc('kombins/' + kombinId);
  const [ts, ks] = await Promise.all([ref.get(), kRef.get()]);
  if (!ts.exists || !ks.exists) throw new HttpsError('not-found', 'Talep bulunamadı');
  const t = ts.data(), k = ks.data();
  if (t.uid !== uid && !isAdmin) throw new HttpsError('permission-denied', 'Bu talep size ait değil');
  if (['approve', 'reject'].includes(action) && !isAdmin) throw new HttpsError('permission-denied', 'Yalnızca iyigiy ekibi onaylar');

  // 1. adım: influencer ürünlerin görselde doğru olduğunu kontrol edip ekibe gönderir.
  if (action === 'submit') {
    if (t.status !== 'onay' || !t.resultImage) throw new HttpsError('failed-precondition', 'Gönderilecek görsel yok');
    await ref.update({ status: 'kontrol', submittedAt: FieldValue.serverTimestamp(), note: FieldValue.delete() });
    await kRef.update({ tryon: 'kontrol' });
    return { ok: true };
  }
  if (action === 'reject') {
    if (t.status !== 'kontrol') throw new HttpsError('failed-precondition', 'Kontrol bekleyen görsel yok');
    await ref.update({ status: 'red', note: String(note || '').slice(0, 300), reviewedAt: FieldValue.serverTimestamp() });
    await kRef.update({ tryon: 'red' });
    return { ok: true };
  }
  // 2. adım: iyigiy ekibi onaylar; kombin bu görselle yayına çıkar.
  if (action === 'approve') {
    if (t.status !== 'kontrol' || !t.resultImage) throw new HttpsError('failed-precondition', 'Onaylanacak görsel yok');
    const old = k.image?.startsWith('img:') ? k.image.slice(4) : null;
    // Giydirilen taslak kombin bu anda sahibinin gardırobunda yayına çıkar.
    await kRef.update({ image: 'img:' + t.resultImage, tryon: 'hazir', ...(k.status === 'taslak' ? { status: 'magaza' } : {}), updatedAt: FieldValue.serverTimestamp() });
    await ref.update({ status: 'tamam', doneAt: FieldValue.serverTimestamp(), reviewedAt: FieldValue.serverTimestamp() });
    if (old && old !== t.resultImage) await db.doc('kombinImages/' + old).delete().catch(() => {});
    return { ok: true };
  }
  if (action === 'retry') {
    if (!['onay', 'hata', 'red'].includes(t.status)) throw new HttpsError('failed-precondition', 'Görsel zaten hazırlanıyor ya da kontrolde');
    const u = await db.doc('tryonUsage/' + kombinId).get(), used = u.exists ? u.data().count : 0, extra = u.exists ? u.data().extra || 0 : 0;
    if (used >= MAX_ATTEMPTS + extra) {
      if (!isAdmin) throw new HttpsError('resource-exhausted', 'Bu kombin için görsel üretim sınırına ulaşıldı');
      await db.doc('tryonUsage/' + kombinId).set({ extra: extra + MAX_ATTEMPTS }, { merge: true }); // admin ek hak tanır
    }
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

/* ---------------- kombin hakkı ----------------
   Başlangıçta 10 kombin. Mağaza/referans linkinden ilk satışta +10, 10. satışta +10,
   sonraki her 10 satışta +10. En fazla 100. İptal edilen satışlar sayılmaz.
   (js/partner.js'teki kombinLimit ile aynı formül.) */
const kombinLimit = sales => Math.min(100, 10 + (sales >= 1 ? 10 : 0) + Math.floor(sales / 10) * 10);

async function syncQuota(uid) {
  if (!uid) return null;
  const rs = await db.collection('refSales').where('infUid', '==', uid).get();
  const sales = rs.docs.filter(d => d.data().status !== 'iptal').length;
  const limit = kombinLimit(sales);
  const iRef = db.doc('influencers/' + uid);
  if ((await iRef.get()).exists) await iRef.set({ salesCount: sales, kombinLimit: limit }, { merge: true });
  return { uid, sales, limit };
}
// Her satış (ya da iptal) influencer'ın hakkını yeniden hesaplar.
exports.quotaOnSale = onDocumentWritten('refSales/{id}', async event => {
  const a = event.data?.after?.data(), b = event.data?.before?.data();
  const uids = new Set([a?.infUid, b?.infUid].filter(Boolean));
  for (const u of uids) await syncQuota(u);
});
// Hak aşılırsa (tarayıcı kontrolü atlanmış olsa bile) fazladan oluşturulan kombin silinir.
exports.quotaGuard = onDocumentCreated('kombins/{id}', async event => {
  const k = event.data?.data(); if (!k?.ownerUid) return;
  const inf = await db.doc('influencers/' + k.ownerUid).get();
  const limit = inf.exists && inf.data().kombinLimit || 10;
  const count = (await db.collection('kombins').where('ownerUid', '==', k.ownerUid).count().get()).data().count;
  if (count <= limit) return;
  logger.warn('kombin hakkı aşıldı, silindi', { uid: k.ownerUid, count, limit });
  await event.data.ref.delete();
  if (k.image?.startsWith('img:')) await db.doc('kombinImages/' + k.image.slice(4)).delete().catch(() => {});
});
// Admin: tüm influencerların hakkını yeniden hesaplar (geçmiş satışlar için).
exports.quotaSyncAll = onCall({ cors: true }, async req => {
  if (!(req.auth?.token.email_verified === true && ADMIN_EMAILS.includes(req.auth.token.email))) throw new HttpsError('permission-denied', 'Yalnızca admin');
  const inf = await db.collection('influencers').get();
  const out = [];
  for (const d of inf.docs) out.push(await syncQuota(d.id));
  return { updated: out.length, list: out };
});
