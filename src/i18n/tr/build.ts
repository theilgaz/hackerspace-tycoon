import { money } from '@/utils/format';
import type { build as en } from '../en/build';
import { num } from '../locale';
import { ek } from '../turkish';

/**
 * Türkçe — Yeni Proje, İnşa ve açılış toplantısı (CLAUDE.md §4c, §4d). Typed against `en`,
 * so a key missing here is a compile error. A name the game did not write takes its case
 * suffix through `ek()`.
 */
export const build: typeof en = {
  // --- The build menu --------------------------------------------------------
  'build.bar.new': 'Yeni Proje',
  'build.bar.newHint': 'Yeni bir proje tasarla ve ekibini seç',
  'build.bar.projects': 'Projeler',
  'build.bar.projectsHint': 'Süren, bekleyen ve biten her şey',
  'build.bar.ranking': 'Sıralama',
  'build.bar.rankingHint': 'Öteki mekânlar ne durumda',
  'build.bar.machines': 'Atölye',
  'build.bar.machinesHint': 'Makineler ve kuyrukları',
  'build.bar.machinesAlert': 'Bir makine kalibrasyon ya da filament bekliyor',
  'build.bar.people': 'Ekip',
  'build.bar.peopleHint': 'Kim burada, kimi alabilirsin',
  'build.bar.peopleWaiting': (p) => `${num(p.count)} kişi cevap bekliyor`,
  'build.bar.build': 'İnşa',
  'build.bar.buildHint': 'Masalar, iş istasyonları, konfor ve dekor',
  'build.bar.buildQueue': (p) => `${num(p.count)} kişi oturacak yer bekliyor`,
  'build.bar.socials': 'Sosyal',
  'build.bar.socialsHint': 'Bir şeyi insanların önüne koy — ilgi kendiliğinden düşer',

  'build.people': (p) => `${num(p.count)} kişi`,
  'build.days': (p) => `${num(p.days)} gün`,
  'build.stars': (p) => `5 üzerinden ${num(p.value)}`,

  'build.top.moneyHint': (p) =>
    `${num(p.days)} gün sonra fatura: aidatlar +${money(p.income)}, kira ve işletme −${money(p.costs)}. ` +
    `Proje ödemeleri, proje teslim edildiği gün kasaya girer.`,
  'build.top.atBill': (p) => `faturada · ${num(p.days)} gün`,
  'build.top.projects': (p) => `${num(p.count)} proje`,
  'build.top.busy': (p) => `${num(p.used)}/${num(p.total)} meşgul`,
  'build.top.shipped': (p) => `${num(p.count)} teslim`,

  'build.people.hireAll': (p) => `${num(p.count)} kişinin hepsini al · ${money(p.cost)}`,
  'build.people.hireAllHint': 'Olabilen herkes tam zamanlı, günlük işi olanlar yarı zamanlı.',

  'build.skill.cad': 'CAD',
  'build.skill.electronics': 'elektronik',
  'build.skill.machining': 'talaşlı imalat',
  'build.skill.welding': 'kaynak',
  'build.skill.software': 'yazılım',
  'build.skill.docs': 'dokümantasyon',
  'build.note.waitingToTrain': (p) => `öğrenme istasyonu bekliyor (${p.skill})`,
  'build.note.training': (p) => `eğitimde: ${p.skill}`,
  'build.log.onCourse': (p) => `${p.member} eğitimde; bitene kadar bir ekibe katılamaz.`,
  'build.log.noLearning': 'Eğitim için bir Öğrenme İstasyonu yok. Önce bir tane al.',
  'build.log.busyToTrain': (p) => `${p.member} bir ekipte. Eğitime göndermeden önce ekipten çıkar.`,
  'build.log.trainStart': (p) => `${p.member} öğrenme istasyonuna gitti — sıradaki hedef: ${p.skill} ${num(p.level)}.`,
  'build.log.trained': (p) => `${p.member} eğitimi bitirdi: ${p.skill} artık ${num(p.level)}.`,

  'build.np.needsSkill': (p) => `ekipte ${p.skill} ${num(p.level)} gerekiyor — birini eğit`,
  'build.np.crewBest': (p) => `ekip ${p.skill}: ${num(p.level)}`,
  'build.np.crewBestHint': 'Seçtiğin ekipteki en iyi seviye. Üç yıldız için 2, beş yıldız için 4 gerekir.',

  'build.people.train': 'Eğit',
  'build.people.trainHint': 'Bir becerinin bir seviyesi için Öğrenme İstasyonuna gönder',
  'build.people.onCourse': (p) => `eğitimde: ${p.skill} · ${p.pct}`,
  'build.people.noStation': 'Önce bir Öğrenme İstasyonu al.',
  'build.people.onCrew': 'Bir ekipte — önce ekipten çıkar.',
  'build.people.alreadyOnCourse': 'Zaten eğitimde.',

  'build.panel.printers': 'Yazıcılar',
  'build.machines.buyInBuild': (p) => `Yeni yazıcılar ${ek(p.build, 'loc')}.`,
  'build.printer.intro':
    'İki ucuz yazıcı aynı anda iki şey basar; bir pahalı yazıcı tek şeyi hızlı basar. A1 dışındakilerin hepsi kabinli ve fiyatla birlikte büyüyor.',
  'build.printer.fails': (p) => `arıza ${p.pct}`,
  'build.card.ownedN': (p) => `mekânda ${num(p.count)}`,
  'build.card.owned': 'Mekânda',

  'build.sell.notOwned': 'Bu, mekânın satabileceği bir şey değil.',
  'build.sell.fixture': 'Binanın parçası — yerinde kalıyor.',
  'build.sell.inUse': 'Bu masada bir ekip plan yapıyor. Toplantı bitince satabilirsin.',
  'build.sell.button': (p) => `Sat · ${money(p.value)}`,
  'build.log.sold': (p) => `${p.item} ${money(p.value)} karşılığında satıldı.`,

  'build.social.best': 'en iyi',
  'build.social.post': 'Paylaş',

  'build.rank.night': (p) => `${num(p.n)}. gece`,

  // --- The wizard ------------------------------------------------------------
  'build.np.step.genre': 'Tür',
  'build.np.step.brief': 'Brif',
  'build.np.step.design': 'Tasarım',
  'build.np.step.crew': 'Ekip',
  'build.np.step.review': 'Özet',
  'build.np.backTo': (p) => `${p.step} adımına dön`,
  'build.np.back': 'Geri',
  'build.np.foot.design':
    'Üç yıldız, brifte yazdığı gibi. Bir yıldız daha hızlı ve belli eder; beş yıldız daha pahalı ve o da belli eder.',
  'build.np.foot.crew': 'Açılış toplantısı için hepsi aynı anda masada olmalı.',
  'build.np.foot.other': 'Parçalar proje başlar başlamaz sipariş edilir. Sınır slot değil, insan.',
  'build.np.pickBrief': 'Önce bir brif seç.',

  'build.np.offers': 'Teklifler',
  'build.np.offersHint': "Öneriler, sponsorlar ve Reddit'in şu an heyecanlandığı her şey",
  'build.np.offersWaiting': (p) => `${num(p.count)} bekliyor`,
  'build.np.asking': 'Piyasanın istediği',
  'build.np.nothingInGenre': 'Bu türde şu an bir şey yok.',
  'build.np.scopedFor': (p) => `${num(p.count)} kişilik`,
  'build.np.scopedForHint': 'brifin öngördüğü ekip büyüklüğü',
  'build.np.payoutHint': 'brifin fiyatı; kalite ve piyasa hesaba katılmadan',
  'build.np.keepIt': 'sende kalır',
  'build.np.hypeHint': 'itibar; kalite hesaba katılmadan',
  'build.np.machineTimeHint': 'makine süresi',
  'build.np.bomHint': 'malzeme listesi ve teslim süresi',
  'build.np.none': 'yok',
  'build.np.needs': (p) => `${p.machines} gerekiyor — önce bir tane al`,
  'build.np.needsHint': 'Bir tane al ya da yap, bu da açılır',
  'build.np.needsMachine': (p) => `${p.machines} gerekiyor`,

  'build.fx.quality': (p) => `kalite ${p.value}`,
  'build.fx.appeal': (p) => `cazibe ${p.value}`,
  'build.fx.appealHint': 'piyasanın buna ödediği',
  'build.fx.work': (p) => `emek ${p.value}`,
  'build.fx.testRisk': (p) => `test riski ${p.value}`,
  'build.fx.parts': (p) => `parçalar ${p.value}`,
  'build.fx.printing': (p) => `baskı ${p.value}`,
  'build.fx.delivery': (p) => `teslimat +${num(p.days)} gün`,
  'build.fx.perSeat': (p) => `${money(p.cost)} · kişi başı ${money(p.each)}`,
  'build.fx.cost': (p) => money(p.cost),
  'build.fx.costHint': 'proje başlarken ödenir',
  'build.fx.noSim': 'simülasyon aşaması yok',
  'build.fx.needs': (p) => `${p.machines} gerekir`,
  'build.fx.asBrief': 'brifte yazdığı gibi',

  'build.np.crewSize': 'Ekip büyüklüğü',
  'build.np.seatBlocked': (p) => `${num(p.count)} kişilik ekip için ${p.table} gerekiyor — İnşa'dan al`,
  'build.np.fitQuality': (p) => `kalite ${p.value}`,
  'build.np.fitQualityHint': 'planı yapan ekibin büyüklüğünden gelen kalite',
  'build.np.fitExplain': (p) =>
    `${num(p.count)} kişi için tasarlandı. Daha azı olursa kimse kimsenin işini kontrol etmez; ` +
    `iki katına kadar plan iyileşir; ötesinde fazla aşçı çorbayı bozar. Daha çok insan, açılış ` +
    `toplantısında anlaşılacak daha çok şey ve herkesi aynı gün odaya toplamanın daha zor olması demek.`,
  'build.fit.short': 'eleman eksik',
  'build.fit.thin': 'biraz az',
  'build.fit.right': 'tam kararında',
  'build.fit.well': 'güçlü kadro',
  'build.fit.crowded': 'kalabalık',
  'build.fit.cooks': 'fazla aşçı',
  'build.np.ask': (p) => `${num(p.seats)} kişiden ${num(p.picked)} kişiye sor`,
  'build.np.canSayNo': 'yine de hayır diyebilirler',
  'build.np.proposerLocked': 'Fikir onun — proje başlar başlamaz katılır',
  'build.np.match': (p) => `${p.genre} uyumu ${p.match} · ${p.shift}`,
  'build.np.notIn': 'bugün yok',
  'build.np.everyoneBusy':
    'Herkes bir şeyle meşgul. Yine de başlatıp ekibini sonra tezgâhtan kurabilirsin — ya da ' +
    'kendin katılırsın.',
  'build.np.clash': (p) =>
    `${p.names} hiçbir zaman aynı anda burada olmuyor, yani ikisiyle birlikte açılış toplantısı ` +
    `yapılamaz. Bir ödül, yarı zamanlıyı günün geri kalanında tutar — ya da birini ekipten çıkar.`,
  'build.np.clashNames': (p) => `${p.mornings} (sabahları) ile ${p.afternoons} (öğleden sonraları)`,
  'build.np.largeHint': (p) => `Beş ve on kişilik ekipler için ${p.table} gerekir. ${ek(p.build, 'loc')} bulunur.`,

  'build.shift.ftShort': 'TZ',
  'build.shift.amShort': 'ÖÖ',
  'build.shift.pmShort': 'ÖS',
  'build.shift.ft': 'tam zamanlı, 9-18',
  'build.shift.am': 'sabahları',
  'build.shift.pm': 'öğleden sonraları',

  'build.review.quality': 'Kalite',
  'build.review.qualityHint': 'ekibin ustalığı + tasarım + ekip büyüklüğü',
  'build.review.market': 'Piyasa',
  'build.review.marketHint': 'bu türün bu hafta ödediği',
  'build.review.pays': 'Kazanç',
  'build.review.paysHint': 'çıkışta, kalite tutarsa',
  'build.review.reputation': 'İtibar',
  'build.review.reputationHint': 'çıkarmanın isme kattığı',
  'build.review.design': 'Tasarım',
  'build.review.commitment': 'Taahhüt',
  'build.review.crew': 'Ekip',
  'build.review.kickoff': 'Açılış',
  'build.review.handWork': 'El emeği',
  'build.review.machineTime': 'Makine süresi',
  'build.review.parts': 'Parçalar',
  'build.review.licences': 'Lisanslar',
  'build.review.testRisk': 'Test riski',
  'build.review.noSim': 'simülasyonsuz',
  'build.review.tableFree': (p) => `${p.table} — boş`,
  'build.review.tableBusy': (p) => `${p.table} — dolu; sırasını bekler`,
  'build.review.noTable': 'bu kadar kişiyi oturtan masa yok',
  'build.review.asking': (p) => `Sorulacaklar: ${p.names}.`,
  'build.review.nobodyAsked': 'Henüz kimseye sorulmadı — gönüllüler yine de katılabilir.',
  'build.review.proposerSigns': 'Öneren kişi hemen katılır.',
  'build.review.start': (p) => `${ek(p.project, 'acc')} başlat`,
  'build.review.leaves': (p) => `Geriye ${money(p.cash)} kalır`,
  'build.review.pastOverdraft': 'kredi sınırının ötesinde',

  'build.offer.proposer': (p) => `${p.member} katılacak`,
  'build.offer.upFront': (p) => `${money(p.cash)} peşin`,
  'build.offer.hype': (p) => `×${num(p.multiplier)} ilgi`,
  'build.offer.daysLeft': (p) => `${num(p.days)} gün kaldı`,

  'build.demand.hot': 'sıcak',
  'build.demand.warm': 'yükselişte',
  'build.demand.flat': 'durgun',
  'build.demand.cold': 'soğuyor',
  'build.demand.hint': 'bu türün bu hafta normale göre ödediği',

  // --- The bench -------------------------------------------------------------
  'build.bench.design': 'tasarım',
  'build.kick.neverOverlap': 'ekip hiç denk gelmiyor',
  'build.kick.notIn': (p) => `açılış: ${p.names} burada değil`,
  'build.kick.noTable': 'açılış: boş masa yok',
  'build.kick.at': (p) => `açılış ${ek(p.table, 'loc')}`,
  'build.kick.theTable': 'masa',
  'build.kick.hintBounty': 'bir ödül yarı zamanlıyı bütün gün tutar',
  'build.kick.hintEveryone': 'herkes aynı anda',

  // --- The Build panel -------------------------------------------------------
  'build.panel.title': 'İnşa',
  'build.panel.queue': (p) => `${num(p.count)} kişi yer bekliyor`,
  'build.panel.workspace': 'Çalışma alanı',
  'build.panel.comfort': 'Konfor',
  'build.panel.decor': 'Dekor',
  'build.panel.foot':
    'Her şey boş yer neredeyse oraya konur. Taşımak için <b>odada üstüne tıkla</b>, döndürmek ' +
    'için bir daha tıkla. Yazıcılar ve aletler <b>Atölye</b> panelinde.',
  'build.seats.title': 'Mekândaki oturma yerleri',
  'build.seats.software': (p) => `Yazılım ${num(p.count)}`,
  'build.seats.hardware': (p) => `Donanım ${num(p.count)}`,
  'build.seats.assembly': (p) => `Montaj ${num(p.count)}`,
  'build.seats.waiting': (p) => `${num(p.count)} bekliyor`,
  'build.seats.waitingHint': (p) => `${num(p.count)} kişi bunun için boşta bekliyor`,
  'build.seats.hint': 'mekândaki oturma yerleri',
  'build.seats.tables': (p) => `${num(p.count)} masa · ${num(p.used)} kullanımda`,
  'build.seats.tablesHint': 'açılış toplantıları burada — her masada bir seferde bir ekip',
  'build.card.seats': (p) => `${num(p.count)} kişilik`,
  'build.card.noRoom': 'yer yok',
  'build.card.noRoomHint': 'Zeminde yer kalmadı',
  'build.card.notEnough': 'Yeterli para kalmadı',
  'build.card.comesWith': (p) => `${p.era} ile gelir`,
  'build.card.in': 'var',
  'build.card.alreadyIn': 'Zaten mekânda',
  'build.card.price': (p) => money(p.price),
  'build.card.priceUpkeep': (p) => `Şimdi ${money(p.price)}, ayda ${money(p.upkeep)}`,
  'build.card.perMonth': (p) => `${money(p.upkeep)}/ay`,
  'build.card.perMonthHint': 'her aylık hesap özetine yazılır',
  'build.card.era': (p) => `${num(p.era)}. dönem`,
  'build.card.notYours': 'henüz senin değil',
  'build.comfort.title': 'Mekânda bulunmak nasıl bir his',
  'build.comfort.moodHint': 'herkes daha çok gelir, daha iyi çalışır',
  'build.decor.intro':
    'Bitkiler, sanat ve inek işleri. Hiçbiri parça üretmez; birazı insanlara burada olmayı ' +
    'istetir — ve bir odadaki beşinci güzel şey, ilkinden daha az sayılır.',
  'build.effect.mood': (p) => `moral +${p.value}`,
  'build.effect.focus': (p) => `çalışma hızı ${p.value}`,
  'build.effect.rest': (p) => `dinlenme ${p.value}`,
  'build.effect.fatigue': (p) => `yorgunluk ${p.value}`,
  'build.effect.drift': (p) => `kopma ${p.value}`,
  'build.effect.draw': (p) => `kulaktan kulağa ${p.value}`,

  // --- What the Simulation says ---------------------------------------------
  'build.log.noRoom': (p) => `Zeminde ${p.item} için yer kalmadı.`,
  'build.log.installed': (p) => `${p.item} yerleşti. Taşımak için odada üstüne tıkla.`,
  'build.log.noFloor': (p) => `${p.item} için zeminde yer kalmadı. Daha büyük bir kirada olurdu.`,
  'build.log.wentAhead': (p) =>
    `${p.project} ekibi ${ek(p.member, 'acc')} beklemeyi bıraktı ve onsuz devam etti.`,
  'build.log.noTable': 'Planlanacak bir proje masası yok. Önce bir tane al.',
  'build.log.crewTooBig': (p) => `${num(p.count)} kişilik ekip, mekândakinden büyük bir proje masası istiyor.`,
  'build.log.designNeeds': (p) => `Bu tasarım için ${p.machines} gerekiyor.`,
  'build.log.licencesOut': (p) => `Kredi sınırıyla bile ${p.item} lisansları erişilemez durumda.`,
  'build.log.kickoffDone': (p) =>
    `${p.project}: açılış toplantısı bitti — masada ${num(p.crew)} kişi, ${p.fit}. ` +
    `Planlanan kalite %${Math.round(p.quality * 100)}.`,

  'build.note.wentAhead': (p) => `${p.project} ekibi onsuz devam etti`,
  'build.note.kickoffOnceIn': (p) => `${p.project}: ${p.names} gelince açılış`,
  'build.note.waitingTable': (p) => `${p.project}: boş masa bekliyor`,
  'build.note.toKickoff': (p) => `${p.project}: açılış toplantısına`,
  'build.note.kickoff': (p) => `${p.project}: açılış toplantısı`,
  'build.note.waitingFor': (p) => `${p.project}: ${ek(p.names, 'acc')} bekliyor`,
  'build.note.noFree': (p) => `${p.project}: boş ${p.station} yok`,
};
