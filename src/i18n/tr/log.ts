import { money } from '@/utils/format';
import type { log as en } from '../en/log';
import { num } from '../locale';
import { ek } from '../turkish';

/**
 * Türkçe. Typed against `en`, so a key missing here is a compile error.
 *
 * This is a first draft written alongside the extraction; the copy pass (step 5) is where it
 * gets rewritten to carry the same warmth as the English rather than merely its meaning.
 * A name the game did not write takes its case suffix through `ek()` — never glue a suffix
 * onto `${name}` by hand, because the harmony depends on the name.
 */
export const log: typeof en = {
  // --- The log ---------------------------------------------------------------
  'log.day1': '1. gün. Garaj PLA ve neskafe kokuyor.',
  'log.pickSomething': "Bir iş seç — + Yeni Proje'ye bas.",
  'log.noHours': 'Bugün buna vaktin kalmadı.',

  'log.amenity.needsEra': (p) => `${p.item} için ${p.era} gerekiyor.`,
  'log.amenity.cantAfford': (p) => `${p.item} için yeterli para kalmadı.`,
  'log.amenity.installed': (p) => `${p.item} kuruldu.`,
  'log.amenity.installedUpkeep': (p) => `${p.item} kuruldu. Aylık gideri ${money(p.upkeep)}.`,

  'log.shelved': (p) => `${p.days} gündür kimse ${ek(p.project, 'acc')} ellemedi. Artık rafta.`,
  'log.offer.expired': (p) => `${p.item} teklifinin süresi doldu.`,
  'log.offer.proposal': (p) => `${p.member}: "Bence bir ${p.item} yapalım. Bir aşamasını ben alırım."`,
  'log.offer.sponsor': (p) => `Bir sponsor ${p.item} için ${money(p.cash)} ödemeye hazır.`,
  'log.offer.trending': (p) => `r/DIY bu hafta ${p.item} projeleriyle çalkalanıyor.`,

  'log.drifted': (p) => `${p.member}, ${p.project} projesinden soğudu.`,
  'log.requeued': (p) => `${p.member}, ${p.part} parçasını yeniden kuyruğa aldı (${p.project}).`,
  'log.requeuedByYou': (p) => `${p.part} parçasını yeniden kuyruğa aldın (${p.project}).`,

  'log.part.finished': (p) => `${p.part} bitti${p.project ? ` (${p.project})` : ''}. ${p.time}`,
  'log.part.failed': (p) =>
    `${p.part}${p.project ? ` (${p.project})` : ''}: ${p.hours} saatlik baskının ` +
    `${num(p.atHour, 1)}. saatinde ${p.reason}.` +
    (p.wasted > 0 ? ` ${p.wasted} g boşa gitti.` : ''),
  'fail.noFilament': 'filament bitti',
  'fail.adhesion': 'parça tabladan koptu',
  'fail.firstLayer': 'ilk katman kalktı',
  'fail.nozzle': 'nozul tıkandı',
  'fail.spaghetti': 'baskı spagettiye döndü',
  'fail.layerShift': 'katman kaydı oldu',
  'fail.thermal': 'termal kaçak koruması devreye girdi',
  'fail.gantry': 'portal parçayı yerinden söktü',

  'log.stage.cadDone': (p) =>
    `${p.project}: CAD %${Math.round(p.quality * 100)} kaliteyle bitti, yapılacak ${p.parts} parça var.`,
  'log.stage.simClean': (p) => `${p.project}: simülasyon temiz.`,
  'log.stage.simSkipped': (p) => `${p.project}: simülasyon atlandı. Hesap tutar inşallah.`,
  'log.stage.allParts': (p) => `${p.project}: tüm parçalar hazır.`,
  'log.stage.assembled': (p) => `${p.project} monte edildi. Bakalım çalışacak mı.`,
  'log.stage.passed': (p) => `${p.project} çalışıyor. ${p.attempt}. denemede geçti.`,
  'log.stage.testFailed': (p) => `${p.project} testten kaldı: ${p.defect}`,
  'log.stage.remake': 'Bir parçanın yeniden yapılması gerekiyor.',
  'log.stage.backToCad': "Tekrar CAD'e.",
  'log.stage.backOnMachine': (p) => `${p.project}: ${p.count} parça yeniden makinede.`,
  'log.stage.fixesIn': (p) => `${p.project}: düzeltmeler tamam, yeniden test ediliyor.`,

  'log.shipped': (p) => `${p.project} ${p.day}. günde teslim edildi — ${money(p.payout)}.`,
  'log.shippedAgain': (p) =>
    `${p.project} yeniden teslim edildi — ${money(p.payout)}, ama millet bunu daha önce görmüştü.`,
  'log.shippedUnpaid': (p) => `${p.project} ${p.day}. günde teslim edildi.`,
  'log.eraUp': (p) => `Adın duyuluyor — ${p.era}. Yeni projeler açıldı.`,

  'log.printer.needsEra': (p) => `Kimse garaja ${p.model} göndermez.`,
  'log.printer.cantAfford': (p) => `Eksi bakiyeyle bile ${p.model} alınamıyor.`,
  'log.printer.noRoom': 'Başka bir yazıcıya yer yok.',
  'log.printer.arrived': (p) => `${p.model} geldi: tablası ayarlı, filamenti dolu.`,
  'log.lease.cantAfford': (p) => `Eksi bakiyeyle bile ${ek(p.space, 'dat')} taşınmak mümkün değil.`,
  'log.lease.signed': (p) =>
    `${p.space} kontratını imzaladın. Taşınmak ${money(p.cost)} tutuyor, kira da artıyor.`,
  'log.machine.sold': (p) => `${p.machine} ${money(p.value)} karşılığında satıldı.`,
  'log.machine.soldLast': (p) =>
    `${p.machine} ${money(p.value)} karşılığında satıldı. Baskı alacak makine kalmadı.`,
  'log.machine.duplicate': (p) => `İkinci bir ${p.machine} — ilki hâlâ çalışıyor. Depoya kaldırıldı.`,
  'log.machine.noRoom': 'Yeni makineye yer kalmadı. Artık koridorda yaşıyor.',
  'log.machine.installed': (p) => `${p.machine} kuruldu, çalışıyor. Artık yeni şeyler yapılabilir.`,

  'log.team.full': (p) => `${p.project} ekibi dolu (${p.size}).`,
  'log.team.busy': (p) => `${p.member} zaten ${p.project} projesinde.`,
  'log.team.busyElsewhere': (p) => `${p.member} zaten başka bir işte.`,
  'log.team.saidNo': (p) => `${p.member}, ${p.project} projesine zaten hayır dedi.`,
  'log.team.declined': (p) => `${p.member}, ${p.project} projesini geri çevirdi. "Pek bana göre değil."`,
  'log.team.joined': (p) => `${p.member}, ${p.project} ekibine katıldı.`,
  'log.team.left': (p) => `${p.member}, ${p.project} ekibinden ayrıldı.`,

  'log.cash.backInBlack': 'Bakiye yeniden artıda.',
  'log.cash.overdraftStarted': (p) =>
    `Bakiye ekside. Sıfırın üstüne çıkarmak için ${p.days} günün var.`,
  'log.cash.daysLeft': (p) => `Bakiyeyi sıfırın üstüne çıkarmak için ${p.days} gün kaldı.`,
  'log.bill.short': (p) => `Fatura karşılanamadı — ${money(p.amount)} eksik. Eksi bakiyeye yazıldı.`,
  'log.bill.up': (p) => `Fatura ödendi. Bu ay ${money(p.amount)} kârdasın.`,
  'log.bill.down': (p) => `Fatura ödendi. Bu ay ${money(p.amount)} zarardasın.`,
  'over.bank': (p) => `Borç ${money(p.amount)} oldu, banka musluğu kapattı. Kontrat gitti.`,
  'over.landlord': 'İki aydır eksidesin ve çıkış yolu yok. Ev sahibi kilitleri değiştirdi.',

  'log.awards.won': (p) => `Ödül gecesi: ${p.total} ödülden ${p.won} tanesi bizim.`,
  'log.awards.none': 'Ödül gecesi: bu yıl bize bir şey çıkmadı.',
  'log.awards.countdown': (p) =>
    (p.days === 1 ? 'Ödül gecesi yarın!' : `Ödül gecesine ${p.days} gün kaldı.`) +
    (p.leading ? ` Önde olduğun kategoriler: ${p.leading}.` : ' Henüz hiçbir kategoride önde değilsin.') +
    (p.race ? ` En yakın yarış ${p.race}, önde ${p.rival} var.` : ''),
  'log.rank.up': (p) =>
    `Ay kapandı: sıralamada ${p.from}. sıradan ${p.to}. sıraya çıktın` + (p.space ? ` — ${p.space} geride kaldı.` : '.'),
  'log.rank.down': (p) =>
    `Ay kapandı: sıralamada ${p.from}. sıradan ${p.to}. sıraya düştün` + (p.space ? ` — ${p.space} seni geçti.` : '.'),

  'log.applicant.via': (p) => `${p.name}, ${p.via} yazısını görüp kapını çaldı.`,
  'log.applicant.asking': (p) => `${p.name} aramıza katılmak istiyor.`,
  'log.applicant.passed': (p) => `${ek(p.name, 'dat')} "şimdi olmaz" dedin.`,
  'log.applicant.passedAnon': '"Şimdi olmaz" dedin.',
  'log.applicant.cantAfford': (p) => `Eksi bakiyeyle bile ${ek(p.name, 'acc')} almak mümkün değil.`,
  'log.hired.full': (p) => `${p.name} aramıza katıldı — tam zamanlı, haftada ${p.hours} saat.`,
  'log.member.offBooks': (p) => `${p.member} artık üye değil.`,

  'log.post.alreadyProject': (p) => `${p.project} bugün zaten paylaşıldı.`,
  'log.post.alreadySpace': 'Mekânı bugün zaten paylaştın.',
  'log.post.burned': (p) => `${p.room}, ${p.name} paylaşımını yerden yere vurdu — ${p.upvotes} oy ve linç.`,
  'log.post.did': (p) => `${p.name}, ${ek(p.room, 'loc')} ${p.upvotes} oy aldı.`,
  'word.theSpace': 'mekân',

  'log.role.set': (p) => `${p.member} artık ${p.role} işine bakıyor.`,
  'log.role.cleared': (p) => `${p.member} görevi bıraktı.`,
  'log.role.loaded': (p) => `${p.member}, ${ek(p.machine, 'acc')} yeniden doldurdu.`,
  'log.role.ordered': (p) => `${p.member}, ${p.project} parçalarını siparişe verdi.`,
  'log.pitch.cantBuild': 'Bunu yapacak altyapı henüz yok.',
  'log.pitch.sponsorPaid': (p) => `Sponsor ${p.item} için ${money(p.cash)} peşin ödedi.`,
  'log.pitch.proposerSigned': (p) => `${p.member} hemen ${p.item} ekibine yazıldı.`,
  'log.pitch.ordered': (p) =>
    `${p.item} başladı. Parçalar sipariş edildi — ${money(p.cost)}, ${p.days} gün içinde gelir.`,
  'log.pitch.noCash': (p) =>
    `${p.item} başladı ama ${money(p.cost)} tutarındaki malzeme listesine para yetmedi. ` +
    `Sipariş verilmeden hiçbir şey monte edilemez.`,
  'log.pitch.plain': (p) => `${p.item} başladı. ${p.blurb}`,
  'log.repitch.took': (p) => `${p.project} yeniden duyuruldu: ${p.count} kişi katıldı.`,
  'log.repitch.none': (p) => `${p.project} yeniden duyuruldu. Kimse oltaya gelmedi.`,

  'log.bounty.cantAfford': 'Eksi bakiyeyle bile bu prim verilemiyor.',
  'log.bounty.posted': (p) => `${p.project} · ${p.stage} için prim kondu. Pizza yolda.`,
  'log.parts.cantAfford': (p) => `Eksi bakiyeyle bile ${p.project} parçaları alınamıyor.`,
  'log.parts.ordered': (p) => `${p.project} parçaları sipariş edildi. ${p.days} gün içinde gelir.`,
  'log.parts.expediteCantAfford': 'Eksi bakiyeyle bile kargo hızlandırılamıyor.',
  'log.parts.expedited': (p) => `${p.project} siparişi için hızlı kargo parası ödendi.`,
  'log.parts.noMachine': (p) => `Mekânda ${p.part} için ${p.machine} yok.`,
  'log.parts.queued': (p) => `${p.count} parça kuyruğa alındı (${p.project}).`,
  'log.filament.cantAfford': (p) => `Eksi bakiyeyle bile ${p.machine} için filament alınamıyor.`,
  'log.filament.loaded': (p) => `${p.machine} dolduruldu.`,

  // --- What somebody is doing -------------------------------------------------
  'note.atHome': 'evde',
  'note.justArrived': 'yeni geldi',
  'note.headingHome': 'eve gidiyor',
  'note.lunch': 'öğle yemeğinde',
  'note.backOnIt': 'işe döndü',
  'note.needsSitDown': 'biraz oturması lazım',
  'note.lostInterest': 'ilgisini kaybetti',
  'note.joined': (p) => `${p.project} ekibine katıldı`,
  'note.working': (p) => `${p.project}: ${p.stage}`,
  'note.waiting': (p) => `${p.project}: bekliyor`,
  'note.levelling': 'tablayı ayarlıyor',
  'note.watchingPrint': 'baskıyı izliyor',
  'note.hangingAround': 'ortalıkta takılıyor',
  'note.notSigningOff': 'bu hâliyle onay vermiyor',
  'note.projectDone': (p) => `${p.project} bitti`,
  'note.doneForToday': 'bugünlük bu kadar',
  'note.outOfHours': 'saati kalmadı',
  'note.inTheSpace': 'mekânda',
  'note.lookingForWork': 'yapacak iş arıyor',
  'note.bedFlat': 'tabla yine terazide',
  'note.nothingByHand': (p) => `${p.project}: elle yapılacak iş yok`,
  'note.free': 'boşta — bir iş seç',
  // --- The monthly statement ------------------------------------------------------
  'bill.work': 'Teslim edilen işler',
  'bill.workDetail': 'teslim edilen işlerin ödemeleri',
  'bill.sponsor': 'Sponsorlar',
  'bill.sponsorDetail': 'proje başlarken peşin ödendi',
  'bill.sales': 'Satışlar',
  'bill.salesDetail': 'geri satılan ekipman ve mobilya',
  'bill.parts': 'Parçalar',
  'bill.partsDetail': 'malzeme listeleri ve hızlı kargo',
  'bill.design': 'Tasarım bütçeleri',
  'bill.designDetail': 'proje başında seçilen araç ve teknolojiler',
  'bill.kit': 'Ekipman ve mobilya',
  'bill.kitDetail': 'yazıcılar, masalar, istasyonlar, konfor',
  'bill.filament': 'Filament',
  'bill.filamentDetail': 'yazıcılara takılan makaralar',
  'bill.hiring': 'Giriş ücretleri',
  'bill.hiringDetail': 'aramıza katılan herkes için bir kerelik',
  'bill.training': 'Eğitim',
  'bill.trainingDetail': 'eğitim istasyonundaki kurslar',
  'bill.bounties': 'Primler',
  'bill.bountiesDetail': 'sıkıcı işler için pizza, para ve baskı',
  'bill.lease': 'Taşınma',
  'bill.leaseDetail': 'kamyonet ve yeni kontrat',
  'bill.other': 'Diğer',
  'bill.otherDetail': 'ayrıntısız',
  'bill.crewDues': 'Ekip aidatı',
  'bill.crewDuesDetail': (p) => `${p.count} üye · kişi başı ${p.each}`,
  'bill.communityDues': 'Topluluk aidatı',
  'bill.communityDuesDetail': (p) => `${p.count} kişi mekânı kullanıyor · kişi başı ${p.each}`,
  'bill.rent': 'Kira',
  'bill.power': 'Elektrik ve sarf malzemesi',
  'bill.powerDetail': (p) => `${p.hours} makine-saat`,
  'bill.comforts': 'Konfor',
  'bill.comfortsDetail': (p) => `mekânda ${p.count} tane · işletme giderleri`,
  'log.role.levelled': (p) => `${p.member}, iki baskı arasında ${p.machine} tablasını ayarladı.`,

  'trait.perfectionist.hold': (p) =>
    `${p.member}, ${p.project} için ${p.stage} aşamasını %${Math.round(p.quality * 100)} kaliteyle onaylamıyor — en az %${Math.round(p.gate * 100)} istiyor. Ekip üstünde çalışmaya devam ediyor.`,
  'trait.perfectionist.relent': (p) => `${p.member}, ${p.project} için ${p.stage} aşamasını sonunda onayladı — söylene söylene.`,
  'trait.scope.added': (p) => `${p.member}, ${ek(p.project, 'dat')} ${p.idea} ekledi. ${p.stage} aşamasına iş çıktı ama tavan da yükseldi.`,
  'trait.scope.idea.software.0': 'karanlık mod',
  'trait.scope.idea.software.1': 'açık bir API',
  'trait.scope.idea.software.2': 'çevrimdışı çalışma',
  'trait.scope.idea.electronics.0': 'USB-C girişi',
  'trait.scope.idea.electronics.1': 'pil göstergesi',
  'trait.scope.idea.electronics.2': 'RGB, tabii ki',
  'trait.scope.idea.comms.0': 'mesh yedeği',
  'trait.scope.idea.comms.1': 'ikinci bir anten',
  'trait.scope.idea.comms.2': 'uçtan uca şifreleme',
  'trait.scope.idea.mechanical.0': 'hızlı sökülen bağlantı',
  'trait.scope.idea.mechanical.1': 'katlanır şase',
  'trait.scope.idea.mechanical.2': 'ikinci bir motor',
  'trait.mentor': (p) => `${p.member}, ${p.project} ekibine işin inceliklerini gösteriyor — herkes bir seviye yukarıdan çalışıyor.`,
  'trait.documenter': (p) => `${p.member}, ${p.project} için dokümantasyonu yazmaya başladı. Kimse istemeden.`,
  'trait.gatekeeper': (p) => `${p.member}, yazıcıya giden her işi kontrol ediyor: daha az bozuk baskı, daha yavaş çıraklar.`,
  'trait.nightOwl': (p) => `${p.member} bu gece baskılara göz kulak olmak için kalıyor.`,
  'trait.ghost': (p) => `${p.member} son zamanlarda pek görünmüyor. Ekip onun yükünü taşıyor.`,
};
