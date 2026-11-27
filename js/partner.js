// Influencer / stilist kombin hakkı.
// Başlangıçta 10 kombin. Mağaza ya da referans linkinden ilk satışta +10, 10. satışta +10, sonraki her 10 satışta +10.
// En fazla 100. İptal edilen satışlar sayılmaz. Sunucudaki (functions/index.js) formülle aynıdır;
// sayım ve sınır sunucuda tutulur (influencers/{uid}.salesCount, kombinLimit) ve aşım orada engellenir.
export const MAX_KOMBINS = 100;
export const kombinLimit = sales => Math.min(MAX_KOMBINS, 10 + (sales >= 1 ? 10 : 0) + Math.floor(sales / 10) * 10);

// Bir sonraki hak açılışı için gereken satış sayısı (sınırdaysa null)
export function nextUnlock(sales) {
  if (kombinLimit(sales) >= MAX_KOMBINS) return null;
  const target = sales < 1 ? 1 : (Math.floor(sales / 10) + 1) * 10;
  return { at: target, left: target - sales };
}
export function quotaOf(inf, used) {
  const sales = inf?.salesCount || 0, limit = inf?.kombinLimit || kombinLimit(sales);
  return { sales, limit, used, left: Math.max(0, limit - used), next: nextUnlock(sales) };
}
export function quotaText(q) {
  const n = q.next;
  return `Kombin hakkınız: <b>${q.used} / ${q.limit}</b> kullanıldı.` + (n
    ? ` ${n.at === 1 ? 'İlk satışınızda' : `${n.at}. satışınızda (${n.left} satış sonra)`} 10 hak daha açılır.`
    : ' En yüksek hak seviyesindesiniz.');
}
