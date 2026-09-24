# Roller, Kanatlar, Proje Akışı ve Yarışmalar — Tasarım Önerisi

> Durum: **onaylandı; uygulanıyor (faz 1).** Onaylanan kararlar
> uygulanırken CLAUDE.md'ye taşınacak; bu belge o zamana kadar tek kaynak.
>
> Verilen kararlar: unvanlar **Stajyer / Junior / Mid / Senior / Uzman**; yarışma günleri
> **22 / 44 / 62 / 80**; oyuncuya **saat gösterilmez, gün gösterilir** (§2); Haberleşme
> seviyesi **tutkudan türetilir** (§3.2); abonelikli projeler **sürüm güncellemesiyle**
> yaşar (§6.5); yeni proje listesi onaylandı (§1.2).

## 0. Neden

Bugün bir projenin niteliğini büyük ölçüde tasarım ekranındaki yıldızlar belirliyor.
Yıldızlar ekibin yeteneğine bağlı ama bağ zayıf: 6 ayrı yetenek, 10 tür, türe göre
değişen eksenler. Oyuncu "bu projeyi kim iyi yapar" sorusunu kafasında kuramıyor.

> **Projenin değerini, onu yapan insanın o alandaki ustalığı belirler. Ustalık eğitimle
> kazanılır.**

Tezle bağı: iyi bir ekip kurmak ve yetiştirmek zaman alan bir yatırım. Aceleyle başlanan
proje ekibin tavanında kalır; yarışma takvimi de bitirmeyi ödüllendirir.

## 1. Dört kanat

On tür dörde iniyor. Tooling, Civic, Home ve Retro ayrı tür olmaktan çıkıyor; projeler
konularına göre dağılıyor. Tür değil **kanat** diyoruz, çünkü her kanadın bir rolü var.

| Kanat | Rol | Neyi kapsar | Karakteri |
|---|---|---|---|
| **Yazılım** | Yazılımcı | Web, SaaS, mobil, gömülü yazılım, kamu uygulamaları | Para getirir; parça yok, yazıcı sırası yok |
| **Elektronik** | Elektronikçi | Kartlar, güç, lehim, retro, ev elektroniği | Parça bekler, test riski yüksek |
| **Haberleşme** | Haberleşmeci | Radyo, IoT, sensör ağları, akıllı şehir | İsim yapar, belediye ve sivil işler |
| **Mekanik** | Makineci | Gövde, hareket, robotik, 3D baskı, CNC, araçlar | Baskı ağırlıklı, en büyük projeler |

Pazar (§4d) kanat başına tutulur: dört sayı, on değil.

### 1.1 Mevcut 52 projenin eşlemesi

*İkincil* sütunu karma projeler içindir (§5.3).

| Proje | Eski tür | Kanat | İkincil |
|---|---|---|---|
| Space Website | software | Yazılım | — |
| Tool Booking System | software | Yazılım | — |
| Basic CMS | software | Yazılım | — |
| Member Portal & Door Access | software | Yazılım | Elektronik |
| B2B Portal | software | Yazılım | — |
| Social Media System | software | Yazılım | — |
| Marina Navigation Suite | software | Yazılım | — |
| Hospital Queue System | civic | Yazılım | — |
| Museum Interactive Kiosk | civic | Yazılım | Elektronik |
| LED Name Badge | electronics | Elektronik | — |
| Bench Power Supply | electronics | Elektronik | — |
| Macropad | electronics | Elektronik | — |
| Geiger Counter | electronics | Elektronik | — |
| Analogue Synth Module | electronics | Elektronik | — |
| Nixie Clock | retro | Elektronik | — |
| Cyberdeck | retro | Elektronik | Yazılım |
| Pinball Restoration | retro | Elektronik | Mekanik |
| Fume Extractor | tooling | Elektronik | — |
| Reflow Oven | tooling | Elektronik | — |
| Coffee Roaster | home | Elektronik | Mekanik |
| Barrel Sauna Controller | home | Elektronik | — |
| Repair Café Rig | civic | Elektronik | — |
| E-ink Dashboard | iot | Haberleşme | Yazılım |
| Home Assistant Hub | iot | Haberleşme | Yazılım |
| Car Park Control System | iot | Haberleşme | Yazılım |
| LoRaWAN Gateway | radio | Haberleşme | — |
| SDR Ground Station | radio | Haberleşme | Yazılım |
| Satellite Tracker Rotator | radio | Haberleşme | Mekanik |
| Neighbourhood Mesh | civic | Haberleşme | — |
| Air Quality Node | civic | Haberleşme | Elektronik |
| City Air Quality Network | civic | Haberleşme | — |
| Smart Waste Bins | civic | Haberleşme | — |
| Solar Bus Stop Display | civic | Haberleşme | Elektronik |
| River Flood Early Warning | civic | Haberleşme | — |
| Adaptive Street Lighting | civic | Haberleşme | Elektronik |
| Neighbourhood Quake Sensors | civic | Haberleşme | — |
| Hydroponic Wall | home | Haberleşme | Mekanik |
| Phone Stand | home | Mekanik | — |
| Desk Cable Tidy | home | Mekanik | — |
| Filament Dry Box | tooling | Mekanik | — |
| Pen Plotter | tooling | Mekanik | Elektronik |
| Space Vending Machine | tooling | Mekanik | Elektronik |
| CNC Router | tooling | Mekanik | Elektronik |
| Pizza Oven | home | Mekanik | — |
| Cargo Bike Trailer | mechanical | Mekanik | — |
| Dobsonian Telescope | mechanical | Mekanik | — |
| E-bike Conversion | mechanical | Mekanik | Elektronik |
| 3D-Printed Motorcycle | mechanical | Mekanik | Elektronik |
| FPV Drone | mechanical | Mekanik | Elektronik |
| Robot Arm | robotics | Mekanik | Yazılım |
| Prosthetic Hand | robotics | Mekanik | Elektronik |
| Drone Grocery Delivery | robotics | Mekanik | Haberleşme |

### 1.2 Yeni projeler (38)

Proje yelpazesini genişletmek; özellikle Yazılım kanadı 9 projeyle ince kalıyordu.
İsimler katalog içeriği olduğu için İngilizce kalır (§11); boyut sütunu bugünkü süre
katmanlarıdır: **küçük 1–2 gün, orta 4–7, büyük 6–10**.

**Yazılım (+11 → 20)**

| Proje | Boyut | Dönem | İkincil | Kısa |
|---|---|---|---|---|
| Admin Panel | küçük | 1 | — | Bir müşterinin iç işleri için yönetim paneli |
| Café Point of Sale | küçük | 1 | — | Kafeye kasa ve stok, tablet üzerinde |
| Makerspace Inventory App | küçük | 1 | — | Alanın kendi envanteri, barkodla |
| E-Commerce Store | orta | 1 | — | Ürün, sepet, ödeme; platform seçimi burada önemli |
| Mobile Transit App | orta | 2 | Haberleşme | Otobüs saatleri ve canlı konum |
| Municipal Open Data Portal | orta | 2 | — | Belediyenin verileri, herkese açık |
| Smart City Parking App | orta | 2 | Haberleşme | Boş park yerini gösteren şehir uygulaması |
| ECU Programming | orta | 2 | Elektronik | Bir araç kontrol ünitesinin yazılımı; test riski yüksek |
| SaaS Platform | büyük | 2 | — | Abonelikli ürün; **teslimden sonra aylık gelir** (§6.5) |
| Telemedicine Portal | büyük | 3 | — | Hastane ile hasta arasında görüntülü görüşme |
| City Services Super-App | büyük | 3 | Haberleşme | Şehrin bütün hizmetleri tek uygulamada |

**Elektronik (+9 → 22)**

| Proje | Boyut | Dönem | İkincil | Kısa |
|---|---|---|---|---|
| Guitar Effects Pedal | küçük | 1 | — | Analog distorsiyon, dayanıklı kasa |
| Arcade Stick | küçük | 1 | Mekanik | Dövüş oyunu kolu, gerçek butonlar |
| LED Matrix Wall | orta | 1 | Yazılım | Alanın duvarına kayan yazı |
| Smart Energy Meter | orta | 1 | Haberleşme | Evin elektriğini ölçen ve raporlayan kutu |
| Solar Charge Controller | orta | 2 | — | Güneş panelinden aküye, verimli |
| Retro Handheld Console | orta | 2 | Yazılım | Cebe sığan retro konsol |
| Bench Oscilloscope Kit | orta | 2 | — | Öğrencilere satılabilen osiloskop kiti |
| Battery Management System | büyük | 2 | Yazılım | Elektrikli araç aküsünün beyni |
| EV Charger Controller | büyük | 3 | Haberleşme | Araç şarj istasyonunun kontrol kartı |

**Haberleşme (+9 → 24)**

| Proje | Boyut | Dönem | İkincil | Kısa |
|---|---|---|---|---|
| APRS Tracker | küçük | 1 | — | Amatör telsizle konum yayını |
| Ham Radio Repeater | orta | 1 | Elektronik | Tepeye kurulan röle istasyonu |
| Smart Parking Sensors | orta | 2 | Elektronik | Park yerlerine gömülü sensörler |
| Park Wi-Fi Mesh | orta | 2 | — | Parka ücretsiz, kesintisiz internet |
| Smart Park Irrigation | orta | 2 | Mekanik | Parkları nem ölçerek sulayan ağ |
| Urban Noise Monitoring | orta | 2 | — | Şehrin gürültü haritası |
| Bus Fleet Tracking | büyük | 2 | Yazılım | Belediye otobüslerinin canlı takibi |
| Weather Balloon Telemetry | büyük | 2 | Mekanik | Stratosfere balon, yere canlı veri |
| Traffic Light Coordination | büyük | 3 | Yazılım | Kavşakları konuşturan akıllı şehir projesi |

**Mekanik (+9 → 24)**

| Proje | Boyut | Dönem | İkincil | Kısa |
|---|---|---|---|---|
| Camera Slider | küçük | 1 | — | Motorlu kamera rayı |
| Bicycle Repair Stand | küçük | 1 | — | Alanın kapısına bisiklet tamir standı |
| Drone Racing Gates | küçük | 1 | — | Drone yarışı için katlanır kapılar |
| Kinetic Sculpture | orta | 1 | — | Bir kafenin vitrinine hareketli heykel |
| Wind Turbine | orta | 2 | Elektronik | Çatıya küçük rüzgâr türbini |
| Laser Cutter Build | büyük | 2 | Elektronik | Alanın kendi lazer kesicisi (bir makine açar) |
| Hovercraft | büyük | 2 | Elektronik | Gölde gezen hava yastıklı araç |
| Mars Rover Replica | büyük | 3 | Yazılım | Müze için çalışan rover kopyası |
| Autonomous Lawn Robot | büyük | 3 | Yazılım | Belediye parkları için çim biçen robot |

Toplam **90 proje**: Yazılım 20, Elektronik 22, Haberleşme 24, Mekanik 24.

## 2. Zaman: oyuncu gün görür

Oyuncuya **saat gösterilmez.** Bir proje "3 gün", bir kurs "2 gün", bir baskı "yarım
gün" sürer. Simülasyon içeride saatle hesaplamaya devam eder (harness'ler buna bağlı),
ama ekrandaki her süre gün ve yarım gün olarak yuvarlanır:

| Nerede | Bugün | Yeni |
|---|---|---|
| Proje tahmini | iş birimi, makine saati | "≈ 4 gün" |
| Aşama çubuğu | 21/24 | "yarım gün kaldı" |
| Baskı | 52h | "2 gün" |
| Kurs | 24h | "3 iş günü" |
| Parça teslimi | zaten gün | aynı |

Saat yalnız sol üstteki saatte kalır, günün akışını hissettirmek için. **Hackathon da
saatle değil günle tanımlanır** (§7.3); mesai dışı istisnası yok.

## 3. Roller ve ustalık

### 3.1 Dört seviye alanı

Altı yetenek yerine her kişinin dört **rol seviyesi** var, 0–5:

| Seviye | Unvan | Ne demek |
|---|---|---|
| 0 | — | Bu rolde değil |
| 1 | Stajyer | Tutar, ama rehberle |
| 2 | Junior | Standart işi yapar |
| 3 | Mid | Bugünkü "3 yıldız"ın ustası |
| 4 | Senior | İleri seçenekleri açar |
| 5 | Uzman | Kanadın tavanı |

**Birincil rol:** En yüksek seviyeli rol, kişinin rozeti ("Safa · Yazılımcı · Uzman").
Kilitlidir: eğitimle başka bir rolde onu geçse de birincil rol değişmez, ama bir ikincil
rol kazanılmış olur.

### 3.2 Eski yeteneklerden dönüşüm — ve "tutkudan türetmek" ne demek

Yazılım, Elektronik ve Mekanik rolünün eski yeteneklerde doğrudan bir karşılığı var:

| Rol | Kaynak |
|---|---|
| Yazılım | `software` |
| Elektronik | `electronics` |
| Mekanik | `max(cad, machining, welding)` |

**Haberleşme'nin eski altı yetenekte karşılığı yok.** Radyo ve IoT hiçbir zaman bir
yetenek değildi, sadece bir *tutku*ydu: her kişinin kartında "Loves: Radio · Software"
gibi ilgi alanları yazıyor. Haberleşme seviyesini iki yoldan biriyle verebiliriz:

- **Tutkudan türetmek:** Radyoyu ya da IoT'yi seven herkes, elektronik veya yazılımdaki
  seviyesinin bir altından Haberleşmeci sayılır. Sevmeyen 0'dan başlar. Otomatiktir,
  kayıtlı oyunlara da aynı kural uygulanır. Ama sonuç biraz mekanik olur: iyi bir
  yazılımcı radyoyu seviyorsa kendiliğinden iyi bir haberleşmeci sayılır.
- **Elle yazmak:** 25 kişinin her birine dört seviye kararıyla yazılır. Karakterler
  daha kasıtlı olur (Abdullah gerçekten radyocu, Safa değil gibi). Kayıtlı oyunlar yine
  tutku kuralıyla dönüştürülür; elle yazılan değerler yeni oyunlarda geçerli olur.

**Karar: tutkudan türetilir.** Kural hem kadroya hem kayıtlı oyunlara aynı şekilde
uygulanır:

```
Haberleşme = radyo veya IoT tutkusu ≥ 0,5 ise  max(elektronik, yazılım) − 1  (en az 1)
             değilse 0
```

`docs` bir rol olmuyor; yayın aşamasını projenin kanadındaki rol yürütür,
**Documenter** özelliği yayını hızlandıran özellik olarak kalır.

### 3.3 Eğitim

Learning Station ekranı artık yetenek değil **rol** seçtiriyor.

- **Role giriş kursu (0 → 1):** Kişiye ikincil bir rol açar.
- **Seviye kursu (n → n+1):** Fiyat `500 × sonraki seviye`, süre `sonraki seviye × 1,5
  iş günü`.
- Bir istasyonda iki kişi, **aynı rolde**, yan yana eğitim alır (bugünkü panelin mantığı).
- **Seviye 4 ve 5 için eğitmen:** O rolde daha yüksek seviyeli biri o gün binadaysa kurs
  %30 hızlı ilerler; **Mentor** özelliği bunu iki kat iyi yapar.

## 4. Nitelik, hız ve para

### 4.1 Hız

Bir aşamadaki kişinin hızı, projenin kanadındaki rol seviyesinden gelir (bugünkü formül,
yetenek yerine rol). Karma projelerde montaj **ikincil rolü** kullanır: drone'un kartlarını
Elektronikçi toplar.

### 4.2 Kalite tavanı

> Ekipteki en usta kişi, projenin olabileceği en iyi hâli belirler.

```
tavan = 0,35 + 0,13 × (ekipteki en yüksek kanat seviyesi)
        Stajyer 0,48 · Junior 0,61 · Mid 0,74 · Senior 0,87 · Uzman 1,0
```

Tasarım kararları kaliteyi bu tavanın **altında** oynatır.

### 4.3 Para

Değişmiyor: `brief × pazar × tasarım çekiciliği × kalite eğrisi × tekrar cezası`. Kalite
tavanı parayı dolaylı olarak ustalığa bağlar. SaaS gibi abonelikli projeler ek olarak
aylık gelir üretir (§6.5).

## 5. Kanada özel tasarım kararları

Her kanadın üç ekseni var. Her eksende üç seçenek bulunur (Platformlar çoklu seçim) ve
her seçeneğin bir **rol seviyesi şartı** var. Seviye yoksa seçenek kilitli kalır ve
nedenini söyler ("Senior Makineci gerekir — birini eğit"). Kural bugünkü gibi: **orta
seçenek brief'in kendisidir (×1).** Aşağısı ucuz, hızlı ve kötü; yukarısı pahalı, yavaş
ve iyi. Hiçbir seçenek bedava üstünlük değildir (§13).

### Yazılım

| Eksen | Seçenek | Şart | Etki |
|---|---|---|---|
| **Dağıtım** | On-Prem | Stajyer | Az iş, küçük pazar |
| | Cloud | Junior | ×1; ilk kez kurulunca **kalıcı altyapı** |
| | Hibrit | Senior | Çok iş, kurumsal pazar, kalite + |
| **Teknoloji** | Hazır CMS / No-code | Stajyer | Hızlı, kalite tavanı −0,1 |
| | Framework | Junior | ×1 |
| | Özel mimari / servisler | Senior | Çok iş, kalite +, test riski − |
| **Platformlar** (çoklu) | Web | Stajyer | Taban |
| | Android | Junior | İş +%35, pazar +%25 |
| | iOS | Mid | İş +%35, pazar +%30, kalıcı geliştirici hesabı |
| | Masaüstü | Junior | İş +%25, pazar +%15 |

ECU Programming'in Platformlar yerine **Hedef donanım** ekseni var (tek çekirdek
mikrodenetleyici / RTOS / çok çekirdekli otomotiv); Elektronikçi şartı buradan gelir.

### Elektronik

| Eksen | Seçenek | Şart | Etki |
|---|---|---|---|
| **Kart** | Perfboard | Stajyer | Hızlı, test riski + |
| | 2 katman PCB | Junior | ×1; teslim +1 gün |
| | 4 katman + SMD | Senior | Kalite +, Reflow Oven gerekir |
| **Güç** | USB | Stajyer | Basit, pazar − |
| | Batarya + şarj | Mid | Pazar +, test riski + |
| | Şebeke + izolasyon | Senior | Pazar ++, iş + |
| **Kasa** | 3D baskı | Stajyer | ×1 baskı |
| | Lazer kesim | Junior | Hızlı; lazer kesici gerekir |
| | CNC alüminyum | Senior | Kalite ++; CNC gerekir |

### Haberleşme

| Eksen | Seçenek | Şart | Etki |
|---|---|---|---|
| **Protokol** | WiFi / BLE | Stajyer | Kısa menzil, hızlı |
| | LoRa | Junior | ×1 |
| | SDR / özel | Senior | Kalite ++, iş ++ |
| **Anten ve menzil** | Hazır çubuk | Stajyer | Pazar − |
| | Yönlü (Yagi) | Mid | Pazar + |
| | Direk + saha testi | Senior | Kalite +, test riski −, bir gün sahada |
| **Altyapı** | Yerel | Stajyer | Basit |
| | Gateway | Junior | ×1 |
| | Bulut panosu + OTA | Mid | Kalıcı altyapı |

### Mekanik

| Eksen | Seçenek | Şart | Etki |
|---|---|---|---|
| **Malzeme** | PLA | Stajyer | Ucuz, kalite − |
| | PETG / karbon katkılı | Mid | Baskı +%30, kalite + |
| | CNC alüminyum | Senior | Kalite ++; CNC gerekir |
| **Tahrik** | Yok / manuel | Stajyer | — |
| | DC motor | Junior | ×1 |
| | BLDC / servo + kontrol | Senior | Pazar ++; **ekipte Junior Elektronikçi şart** |
| **Doğrulama** | Göz kararı | Stajyer | Test riski ++ |
| | FEA simülasyonu | Mid | Kalıcı çözücü lisansı |
| | Yük testi düzeneği | Senior | Test riski −−, parça + |

### 5.3 Karma projeler

*İkincil* rolü olan projelerde bazı seçenekler ekipte o rolden birini ister. Ekip
adımında her kişinin rozeti görünür; "bu seçeneği açan kişi" bilgisi bugünkü yıldız
karelerinin yerini alır.

### 5.4 Tasarım adımını yeniden düşünmek

> **Uygulandı** (yarışma bağlantısı hariç — yarışmalar henüz yok). Yaklaşım, kanadın dilinde
> kapsam, ekipten türeyen teknoloji, kilit yerine bedel, tahmin şeridi, müşteri istekleri ve
> üç hazır ayar `src/utils/design.ts` ve sihirbazın Tasarım adımında.

Bugünkü adım (üç eksen × üç kart, her kartta 5–7 rozet) şu yüzden işlemiyor:

- **Bir menü, bir plan değil.** Dokuz kart ve kırk rozet okunuyor, ama oyuncu "bu proje
  için ne istiyorum?" sorusunu hiç sormuyor. Her eksen ayrı ayrı optimize ediliyor.
- **Kilit üzüyor.** "Yazılım 4 gerekir — birini eğit" kartı gri kalıyor. Oyuncuyu hırslı
  olduğu için cezalandırıyor, hırsın bedelini söylemiyor.
- **Varsayılan her zaman yetiyor.** Üç yıldız ×1; seçmemek de bir seçim ve genelde en iyisi.
- **Hiçbir şeye bağlı değil.** Müşteri ne istiyor, yarışma ne zaman, pazar ne diyor —
  tasarım bunların hiçbirini görmüyor.

**Önerim: menü yerine üç soru.**

1. **Yaklaşım — tek stratejik karar.** *Hızlı · Dengeli · İddialı.* Süreyi, kaliteyi ve
   riski birlikte kaydırır. Oyuncunun asıl sorusu budur: "bunu çabuk mu bitireyim, iyi mi
   yapayım?"
2. **Kapsam — müşteriye ne verildiği.** Kanadın kendi dili: Yazılımda platformlar (Web,
   Android, iOS, Masaüstü) ve dağıtım; Haberleşmede menzil; Elektronikte güç; Mekanikte
   tahrik. Kapsam **ödemeyi ve pazarı** büyütür, işi de büyütür. Burada sayılar değil
   müşterinin cümlesi durur ("iOS da isteniyor").
3. **Teknoloji — seçilmez, ekipten gelir.** Ekibin o kanattaki en iyi seviyesi teknolojiyi
   belirler ve kart sadece söyler: "Senior Yazılımcı var → servis mimarisi". Kilit yok,
   yanlış seçim yok; eğitim bu kartı kendiliğinden yükseltir. §4.2'deki kalite tavanıyla
   aynı fikir.

**Kilit yerine bedel.** Ekibin seviyesinin üstünde bir kapsam ya da *İddialı* yaklaşım
seçilebilir, ama bedeli açıkça yazar: "Ekibin Mid, bu Senior işi: süre +%40, test riski
×1,5." Hırslı oyuncu risk alır, eğitimli ekip bedeli sıfırlar. Hem zorlamaz hem üzmez.

**Sonuç bir tahmin şeridi.** Kırk rozet yerine üç gösterge, her seçimde canlı değişir:
**Süre** (≈ gün, varsa yarışmaya yetişip yetişmediği), **Kalite** (yıldız ve ekibin tavan
çizgisi), **Kazanç** (₺ aralığı ve hype). Ayrıntı isteyen üzerine gelince görür.

**Müşterinin isteği (rekabetin tohumu).** Her brief'in bir iki isteği olur: *"en az 3
yıldız"*, *"Android şart"*, *"7 günde teslim"*. Karşılanan her istek bonus öder,
karşılanmayan bonusu kaçırır, ceza yok. Böylece seçimlerin bir amacı olur. İleride
ihaleler (rakibin de teklif verdiği işler) tam bu isteklerin üstüne kurulur.

**Hazır planlar.** Üç düğme: *En hızlı · En iyi · En kârlı.* Seçimleri ekibe ve isteğe
göre kurar. Detayla uğraşmak istemeyen tek tıkla geçer, isteyen sonra değiştirir.

**Yarışma bağı.** Yaklaşan bir yarışmaya uyan projede şerit "Drone Yarışı'na 9 gün var —
bu plan 7 günde biter" der ve hedefi o güne bağlama seçeneği sunar (§6.3).

## 6. Bir projenin yaşamı

Bu bölüm bir projenin başından sonuna nasıl aktığını netleştiriyor. Bugünkü akışın
iskeleti (sihirbaz → kickoff → aşamalar → test → yayın) korunuyor; değişen yerler **kalın**.

### 6.1 Nereden gelir

| Kaynak | Ne getirir |
|---|---|
| Katalog | Kanadın ve dönemin izin verdiği her şey |
| Üye önerisi | Önereni ekibe hazır katılır |
| Sponsor | Peşin para, onların projesi, teklif süresi |
| Trend | Reddit'in ilgisi; pencere içinde bitirene hype çarpanı |
| Baskı siparişi | Makineler panelinde; sabit fiyat, teslim tarihi |
| **Yarışma brief'i** | **Yaklaşan yarışmaya uygun proje; bitirilirse yarışmaya girer (§7)** |

### 6.2 Oluşturma: sihirbaz

**Kanat → Brief → Ekip → Tasarım → Özet**

1. **Kanat:** Dört kart. Her kartta brief sayısı, bu haftaki pazar ve **alanın o
   kanattaki en usta kişisi** ("en iyi: Safa · Uzman").
2. **Brief:** Müşterinin istediği, önerilen ekip boyutu, **tahmini gün** ve fiyat aralığı.
   Yaklaşan bir yarışmaya uyan brief'lerde yarışma rozeti ve kalan gün yazar.
3. **Ekip:** Kişiler rozetleriyle (rol + seviye). En usta kişi seçilince **kalite tavanı**
   canlı güncellenir. İkincil rol gerekiyorsa uyarı çıkar.
4. **Tasarım:** Kanadın üç ekseni; kilitli seçenek nedenini söyler.
5. **Özet:** Tavan, beklenen kalite, **tahmini gün**, bütçe, parça ve teslimi, ödeme
   aralığı; varsa hangi yarışmaya yetişeceği.

### 6.3 Planlama: kickoff

- Bugünkü gibi bütün ekip **aynı anda masada** olmalı; Toplantı Köşesi hızlandırır.
- **Kickoff bir takvim üretir:** her aşamanın tahmini günü, parçaların geleceği gün,
  baskının sürdüğü gün ve **hedef teslim günü**. Tezgâhta bu, projenin satırında küçük
  bir şerit olarak görünür.
- **Hedef bir yarışmaya bağlanabilir.** Brief uygunsa kickoff "Field Day'e yetiştir"
  seçeneği sunar. Yetişmek yarışmaya girmek demektir, yetişememek bir şey kaybettirmez;
  sadece fırsat kaçar.

### 6.4 Yürütme: aşamalar

Aşama isimleri kanadın dilinde (bugünkü `stageLabel` mekanizması):

| Kanat | Aşamalar |
|---|---|
| Yazılım | Kickoff → Analiz → Mimari → Geliştirme → Test → Düzeltme → Yayın |
| Elektronik | Kickoff → Şema → PCB → Üretim → Montaj → Test → Düzeltme → Teslim |
| Haberleşme | Kickoff → Tasarım → Kurulum → Saha Testi → Düzeltme → Devreye Alma |
| Mekanik | Kickoff → CAD → Simülasyon → Üretim → Montaj → Test → Düzeltme → Teslim |

- Tezgâh her projede **"≈ n gün kaldı"** gösterir. Kalan gün, ekipte kimin olduğu ve
  kimin bugün binada olduğuyla her gün yeniden hesaplanır.
- Engeller bugünkü gibi satırda yazar: parça yolda, baskı sırada, koltuk yok, ekip eksik.
- Sen (sahip) istediğin projeye girersin; ustalığın ekibin tavanını **değiştirmez**,
  sadece iş hızına katkı yapar. Böylece "sahip her şeyi yapar" tuzağına düşülmez (§3a).

### 6.5 Tamamlama

1. **Test:** Kaliteye ve tasarımın riskine göre geçer ya da kalır. Kalırsa Düzeltme'ye
   döner; Elektronik ve Mekanik'te kırılan parça yeniden basılır.
2. **Teslim:** Ödeme, hype, itibar. Proje ekranında kimin ne kadar katkı yaptığı ve
   ödemenin nasıl oluştuğu (bugünkü detay ekranı) kalır.
3. **Yarışma kaydı:** Hedefi bir yarışmaya bağlı olan proje o yarışmanın listesine
   girer. Bitmemişse ama montajdaysa yarım puanla girer.
4. **Teslim sonrası (yeni):**
   - **SaaS / Cloud — sürümler:** Teslim edilen ürün **v1.0 olarak canlıya çıkar** ve
     aylık abonelik geliri getirir. Bir süre sonra (≈ 20–30 gün) müşteriden **v1.1 iş
     paketi** gelir: küçük boyutlu, aynı kanatta, aynı tasarımla bir proje olarak tezgâha
     düşer ve ekip onu bitirip teslim eder. Teslim edilince **v1.0 emekliye ayrılır, v1.1
     canlıya çıkar** ve gelir bir kademe artar. Paket yapılmazsa canlıdaki sürüm eskir:
     her ay geliri azalır, sonunda ürün kapanır. Proje ekranında ürünün sürüm geçmişi
     görünür (v1.0 → v1.1 → v1.2…). Yazılım kanadının "para getirir" karakterini
     sürdürülebilir kılar ve bitirmeyi bir kez değil düzenli olarak ödüllendirir.
   - **Belediye / akıllı şehir:** Teslimden sonra bir referans olur; aynı kanatta bir
     sonraki belediye işi daha yüksek ödemeli gelir.
   - Diğerleri bugünkü gibi rafa kalkar; `REPEAT` kuralı aynı tasarımı ikinci kez
     yapmayı ucuzlatır.

### 6.6 Başarısızlık

Bugünkü kurallar kalır: 14 gün dokunulmayan proje rafa kalkar ve parası yanar; teslim
tarihi olan iş (sipariş, sponsor, yarışma) kaçarsa ceza bellidir. Yeni olan tek şey,
yarışmaya bağlanmış projenin tarihi kaçırması: ceza yok, fırsat kaybı var.

## 7. Yarışmalar

### 7.1 Takvim

Yıl 100 gün; her kanadın yılda bir yarışması var, ödül gecesinden (gün 90) önce:

| Gün | Yarışma | Kanat | Ne ister |
|---|---|---|---|
| 22 | **Drone Yarışı** | Mekanik | Drone veya araç; hız + dayanıklılık |
| 44 | **Hackathon** | Yazılım | İki günlük özel yapı (§7.3) |
| 62 | **Field Day** | Haberleşme | Menzil ve çalışma süresi |
| 80 | **Maker Faire** | Hepsi | En iyi tek yapı, halk oylaması |

### 7.2 Takvim şeridi ve geri sayım

- **Minik bir zaman şeridi:** Üst çubuktaki bugünkü yıl çubuğunun yerini alır. Şeritte
  **"Bugün"** işareti, yılın dört yarışması ve ödül gecesi küçük işaretler olarak durur.
  En yakın etkinliğin adı ve kalan günü yanında yazar ("Hackathon · 6 gün"). Üzerine
  gelince hepsinin tarihi görünür.
- **Geri sayım bildirimleri:** Yeni bildirim sisteminden (tezgâhın sağında, 5 saniye)
  çıkar: **14, 7, 3 ve 1 gün kala** "Hackathon'a 7 gün kaldı · 2 uygun proje var" gibi.
  Uygun proje yoksa "uygun bir brief seç" der ve Yeni Proje'ye götürür.

### 7.3 Hackathon

İki günlük etkinlik (gün 44–45). Etkinlik günü açılır bir brief gelir; isteyen ekip iki gün
boyunca **sadece ona** çalışır. Normal mesai, fazla mesai yok; saat kavramı yok. Kalite
tavanı ekibin en usta yazılımcısı. Bedeli: o iki gün o ekip diğer projelerinden çekilir.

### 7.4 Puan, rakipler, ödüller

- **Puan:** `kalite × tasarım çekiciliği × kapsam` artı yarışmaya özel eksen (drone:
  mekanik doğrulama; Field Day: anten seçimi).
- **Rakipler:** Her rakip mekânın kanat güçleri olur (c-base Haberleşme, Xinchejian
  Elektronik, Konya Mekanik…). Kendi temposundan ve itibarından bir puan üretir.
- **Ödüller:** Para, itibar, o kanattan **aday önceliği** ve ödül gecesine bir kupa.
  Ranking panelinde "Yarışmalar" sekmesi: yıl şeridi ve her yarışmanın ilk üçü.

## 8. Arayüz özeti

- **Üst çubuk:** Yıl çubuğu → takvim şeridi (§7.2).
- **Yeni Proje:** Dört kanat kartı; rozetli ekip; kanadın eksenleri; gün cinsinden özet.
- **Tezgâh:** Projenin satırında "≈ n gün" ve kickoff'un ürettiği küçük takvim şeridi.
- **People:** Dört rol sütunu, seviye + unvan, birincil rol vurgulu; hücre Eğitim'i açar.
- **Eğitim paneli:** Dört rol; "role giriş" kursları ayrı işaretli; süreler gün.
- **Bildirimler:** Yarışma geri sayımı eklenir.

## 9. Uygulama sırası

Her faz kendi başına oynanabilir; sonunda `era-pace` (üç zorluk), `project-times`,
`sim-check`, `kickoff-check`, `click-check` çalışır.

1. **Kanatlar ve gün dili.** Dört kanat, katalog eşlemesi, pazar; ekranda saat yerine gün.
   Kayıt dönüşümü: eski tür → kanat.
2. **Roller.** Dört rol, elle yazılmış kadro, birincil rol, People ve Eğitim ekranları.
   Kayıt dönüşümü: yetenekler → roller.
3. **Tasarım kararları ve proje akışı.** Kanat eksenleri, seviye şartları, kalite tavanı,
   platform çoklu seçimi, kickoff takvimi, "≈ n gün".
4. **Yeni projeler.** 38 proje; her biri `project-times` ile kendi süre penceresine
   oturtulur. SaaS'ın aylık geliri burada.
5. **Yarışmalar.** Takvim şeridi, geri sayım, rakip kanat güçleri, puan, Hackathon,
   Ranking sekmesi.

## 10. Riskler

- **Denge:** Kalite tavanı erken oyunda ödemeyi düşürür; SaaS geliri geç oyunda artırır.
  Her faz ayrı ölçülecek.
- **Kayıtlar:** İki şekil değişikliği (tür, yetenek). Eski kayıt **dönüştürülür, silinmez**.
- **İçerik yükü:** 38 yeni proje 38 brief, parça listesi ve iş dağılımı demek. Denge
  aracının her birini penceresine oturtması gerekiyor.

## 11. Kararlar

Bütün açık sorular kapandı; belge uygulamaya hazır.
