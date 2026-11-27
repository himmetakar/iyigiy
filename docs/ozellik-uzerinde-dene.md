# Özellik: Kombini üzerinde gör

Durum: planlandı, henüz yazılmadı.

## Kullanıcının isteği (kendi sözleriyle)

> Kombini üzerinde görmek ister misin? gibi bir buton. Ona basar basmaz eğer profilinde boydan fotoğrafı varsa hemen üretime geçecek görseli. Üretim sırasında sıkılmanızı istemeyiz. Prensin alışveriş paketlerini Rapunzel'e götürmesine yardım edin (basitçe hazırlanmış kale duvarlarından zıplayarak çıkan sarışın bir prens, elinde alışveriş paketleri, yukarıda Rapunzel bekler ama yol hiç bitmez, Sisifos misali).

## Akış

1. Kombin detayında **"Kombini üzerinde görmek ister misin?"** butonu.
2. Butona basılınca:
   - Profilde boydan fotoğraf **varsa**: görsel üretimi hemen başlar.
   - **Yoksa**: kullanıcıdan boydan fotoğraf yüklemesi istenir, fotoğraf profilde saklanır, sonra üretim başlar.
3. Üretim sürerken bekleme ekranında mini oyun açılır.
4. Görsel hazır olunca oyun kapanır ve kombin kullanıcının üstünde gösterilir.

## Bekleme oyunu: "Prensi Rapunzel'e ulaştır"

- Basit çizimli kale duvarı; sarışın bir prens elinde alışveriş paketleriyle duvardaki çıkıntılardan zıplayarak yukarı tırmanır.
- En üstte kule penceresinde Rapunzel bekler.
- Yol hiç bitmez (Sisifos gibi): prens tırmandıkça duvar uzar, Rapunzel hep biraz daha yukarıda kalır.
- Tek dokunuşla/tıklamayla zıplama; kısa süreli oynanacak kadar basit.
- Üretim bitince oyun nazikçe biter ("Paketler teslim edildi!" gibi) ve sonuç görseline geçilir.

## Daha önce konuşulan kurallar

- Aynı kullanıcı aynı kombini yalnızca bir kez üretir; sonuç saklanır, tekrar istekte yeniden üretilmez.
- Kötüye kullanıma karşı koruma: kullanıcı başına kota, hız sınırı, giriş zorunluluğu. Amaç Gemini kotasını korumak.
- Gemini API anahtarı yalnızca sunucuda durur, tarayıcıya asla gönderilmez.
- Boydan fotoğraf KVKK kapsamında hassas veri: açık rıza alınır, kullanıcı tek tıkla silebilir, fotoğraflar şifreli saklanır.
