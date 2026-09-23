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
  'log.day1': '1. gün. Garaj PLA ve hazır kahve kokuyor.',
  'log.pickSomething': 'Yapacak bir şey seç — + Yeni Proje menüsünü aç.',
  'log.noHours': 'Bugün buna ayıracak saatin kalmadı.',

  'log.amenity.needsEra': (p) => `${p.item} için ${p.era} gerekiyor.`,
  'log.amenity.cantAfford': (p) => `${p.item} için yeterli para kalmadı.`,
  'log.amenity.installed': (p) => `${p.item} kuruldu.`,
  'log.amenity.installedUpkeep': (p) => `${p.item} kuruldu. İşletmesi ayda ${money(p.upkeep)}.`,

  'log.shelved': (p) => `${p.days} gündür kimse ${ek(p.project, 'acc')} ellemedi. Artık rafta.`,
  'log.offer.expired': (p) => `${p.item} teklifinin süresi doldu.`,
  'log.offer.proposal': (p) => `${p.member}: "Bir ${p.item} yapmalıyız. Bir aşamayı ben üstlenirim."`,
  'log.offer.sponsor': (p) => `Bir sponsor ${p.item} için ${money(p.cash)} ödemeye hazır.`,
  'log.offer.trending': (p) => `r/DIY bu hafta ${p.item} projeleriyle dolu.`,

  'log.drifted': (p) => `${p.member}, ${p.project} projesinden koptu.`,
  'log.requeued': (p) => `${p.member}, ${p.part} parçasını yeniden kuyruğa aldı (${p.project}).`,
  'log.requeuedByYou': (p) => `${p.part} parçasını yeniden kuyruğa aldın (${p.project}).`,

  'log.part.finished': (p) => `${p.part} bitti${p.project ? ` (${p.project})` : ''}. ${p.time}`,
  'log.part.failed': (p) =>
    `${p.part}${p.project ? ` (${p.project})` : ''}: ${p.hours} saatlik baskının ` +
    `${num(p.atHour, 1)}. saatinde ${p.reason}.` +
    (p.wasted > 0 ? ` ${p.wasted} g boşa gitti.` : ''),
  'fail.noFilament': 'filament bitti',
  'fail.adhesion': 'parça tablaya tutunamadı',
  'fail.firstLayer': 'ilk katman kalktı',
  'fail.nozzle': 'nozul tıkandı',
  'fail.spaghetti': 'baskı spagettiye döndü',
  'fail.layerShift': 'katman kaydı oldu',
  'fail.thermal': 'termal kaçak koruması devreye girdi',
  'fail.gantry': 'portal parçayı yerinden söktü',

  'log.stage.cadDone': (p) =>
    `${p.project}: CAD %${Math.round(p.quality * 100)} kaliteyle bitti, yapılacak ${p.parts} parça var.`,
  'log.stage.simClean': (p) => `${p.project}: simülasyon temiz.`,
  'log.stage.simSkipped': (p) => `${p.project}: simülasyon atlandı. Umarım hesaplar doğrudur.`,
  'log.stage.allParts': (p) => `${p.project}: tüm parçalar hazır.`,
  'log.stage.assembled': (p) => `${p.project} monte edildi. Şimdi göreceğiz.`,
  'log.stage.passed': (p) => `${p.project} çalışıyor. ${p.attempt}. denemede geçti.`,
  'log.stage.testFailed': (p) => `${p.project} testten kaldı: ${p.defect}`,
  'log.stage.remake': 'Bir parçanın yeniden yapılması gerekiyor.',
  'log.stage.backToCad': "CAD'e geri dönülüyor.",
  'log.stage.backOnMachine': (p) => `${p.project}: ${p.count} parça yeniden makinede.`,
  'log.stage.fixesIn': (p) => `${p.project}: düzeltmeler tamam, yeniden test ediliyor.`,

  'log.shipped': (p) => `${p.project} ${p.day}. günde teslim edildi — ${money(p.payout)}.`,
  'log.shippedAgain': (p) =>
    `${p.project} yeniden teslim edildi — ${money(p.payout)}, ama bunu daha önce de görmüştük.`,
  'log.shippedUnpaid': (p) => `${p.project} ${p.day}. günde teslim edildi.`,
  'log.eraUp': (p) => `Adın duyuluyor — ${p.era}. Yeni projeler açıldı.`,

  'log.printer.needsEra': (p) => `Kimse garaja ${p.model} göndermez.`,
  'log.printer.cantAfford': (p) => `Eksi bakiyeyle bile ${p.model} alınamıyor.`,
  'log.printer.noRoom': 'Başka bir yazıcıya yer yok.',
  'log.printer.arrived': (p) => `${p.model} tezgâhta, tablası ayarlı. Dolu geldi.`,
  'log.lease.cantAfford': (p) => `Eksi bakiyeyle bile ${ek(p.space, 'dat')} taşınmak mümkün değil.`,
  'log.lease.signed': (p) =>
    `${p.space} için sözleşmeyi imzaladın. Taşınma ${money(p.cost)}, kira da artıyor.`,
  'log.machine.sold': (p) => `${p.machine} ${money(p.value)} karşılığında satıldı.`,
  'log.machine.soldLast': (p) =>
    `${p.machine} ${money(p.value)} karşılığında satıldı. Baskı alacak makine kalmadı.`,
  'log.machine.duplicate': (p) => `İkinci bir ${p.machine} — ilki hâlâ çalışıyor. Depoya kaldırıldı.`,
  'log.machine.noRoom': 'Yeni makineye yer kalmadı. Artık koridorda yaşıyor.',
  'log.machine.installed': (p) => `${p.machine} kuruldu ve çalışıyor. Yeni şeyler mümkün.`,

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
  'over.bank': (p) => `Eksi bakiye ${money(p.amount)} ile sınırı aştı. Banka kira sözleşmesini feshetti.`,
  'over.landlord': 'İki aydır eksidesin ve çıkış yolu yok. Ev sahibi kilitleri değiştirdi.',

  'log.awards.won': (p) => `Ödül gecesi: ${p.total} ödülden ${p.won} tanesi bizim.`,
  'log.awards.none': 'Ödül gecesi: bu yıl bize bir şey çıkmadı.',

  'log.applicant.via': (p) => `${p.name}, ${p.via} yazısını görünce iletişime geçti.`,
  'log.applicant.asking': (p) => `${p.name} katılmak için soruyor.`,
  'log.applicant.passed': (p) => `${ek(p.name, 'dat')} şu an doğru zaman olmadığını söyledin.`,
  'log.applicant.passedAnon': 'Şu an doğru zaman olmadığını söyledin.',
  'log.applicant.cantAfford': (p) => `Eksi bakiyeyle bile ${ek(p.name, 'acc')} almak mümkün değil.`,
  'log.hired.full': (p) => `${p.name} tam zamanlı katıldı — haftada ${p.hours} saat.`,
  'log.member.offBooks': (p) => `${p.member} artık üye değil.`,

  'log.post.alreadyProject': (p) => `${p.project} bugün zaten paylaşıldı.`,
  'log.post.alreadySpace': 'Mekân bugün zaten paylaşıldı.',
  'log.post.burned': (p) => `${p.room}, ${p.name} paylaşımına saldırdı — ${p.upvotes} oy ve linç.`,
  'log.post.did': (p) => `${p.name}, ${ek(p.room, 'loc')} ${p.upvotes} oy aldı.`,
  'word.theSpace': 'mekân',

  'log.role.set': (p) => `${p.member} artık ${p.role} işine bakıyor.`,
  'log.role.cleared': (p) => `${p.member} görevi bıraktı.`,
  'log.role.loaded': (p) => `${p.member}, ${ek(p.machine, 'acc')} yeniden doldurdu.`,
  'log.role.ordered': (p) => `${p.member}, ${p.project} parçalarını siparişe verdi.`,
  'log.role.started': (p) => `${p.member}, ${p.item} projesini başlattı — boşta eller vardı.`,

  'log.pitch.cantBuild': 'Mekân bunu henüz yapamaz.',
  'log.pitch.sponsorPaid': (p) => `Sponsor ${p.item} için ${money(p.cash)} peşin ödedi.`,
  'log.pitch.proposerSigned': (p) => `${p.member} hemen ${p.item} ekibine yazıldı.`,
  'log.pitch.ordered': (p) =>
    `${p.item} önerildi. Parçalar sipariş edildi — ${money(p.cost)}, ${p.days} gün içinde gelir.`,
  'log.pitch.noCash': (p) =>
    `${p.item} önerildi ama ${money(p.cost)} tutarındaki malzeme listesi için para yok. ` +
    `Sipariş verilene kadar hiçbir şey monte edilemez.`,
  'log.pitch.plain': (p) => `${p.item} önerildi. ${p.blurb}`,
  'log.repitch.took': (p) => `${p.project} yeniden önerildi: ${p.count} kişi katıldı.`,
  'log.repitch.none': (p) => `${p.project} yeniden önerildi. Kimse ilgilenmedi.`,

  'log.bounty.cantAfford': 'Eksi bakiyeyle bile bu prim verilemiyor.',
  'log.bounty.posted': (p) => `${p.project} · ${p.stage} için prim kondu. Pizza yolda.`,
  'log.parts.cantAfford': (p) => `Eksi bakiyeyle bile ${p.project} parçaları alınamıyor.`,
  'log.parts.ordered': (p) => `${p.project} parçaları sipariş edildi. ${p.days} gün içinde gelir.`,
  'log.parts.expediteCantAfford': 'Eksi bakiyeyle bile kargo hızlandırılamıyor.',
  'log.parts.expedited': (p) => `${p.project} siparişini hızlandırmak için ödeme yapıldı.`,
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
  'note.hangingAround': 'takılıyor',
  'note.notSigningOff': 'buna onay vermiyor',
  'note.projectDone': (p) => `${p.project} bitti`,
  'note.doneForToday': 'bugünlük bu kadar',
  'note.outOfHours': 'saati kalmadı',
  'note.inTheSpace': 'mekânda',
  'note.lookingForWork': 'yapacak iş arıyor',
  'note.bedFlat': 'tabla yine düz',
  'note.nothingByHand': (p) => `${p.project}: elle yapılacak iş yok`,
  'note.free': 'boşta — bir iş seç',
  // --- The monthly statement ------------------------------------------------------
  'bill.work': 'Teslim edilen işler',
  'bill.workDetail': 'teslim edilen işlerin ödemeleri',
  'bill.sponsor': 'Sponsorlar',
  'bill.sponsorDetail': 'teklif kabul edilince peşin ödendi',
  'bill.sales': 'Satışlar',
  'bill.salesDetail': 'geri satılan ekipman ve mobilya',
  'bill.parts': 'Parçalar',
  'bill.partsDetail': 'malzeme listeleri ve hızlı kargo',
  'bill.design': 'Tasarım bütçeleri',
  'bill.designDetail': 'projeye seçilen araç ve teknolojiler',
  'bill.kit': 'Ekipman ve mobilya',
  'bill.kitDetail': 'yazıcılar, masalar, istasyonlar, konfor',
  'bill.filament': 'Filament',
  'bill.filamentDetail': 'yazıcılara takılan makaralar',
  'bill.hiring': 'Katılım ücretleri',
  'bill.hiringDetail': 'aramıza katılan herkes için bir kerelik',
  'bill.training': 'Eğitim',
  'bill.trainingDetail': 'öğrenme istasyonundaki kurslar',
  'bill.bounties': 'Ödüller',
  'bill.bountiesDetail': 'sıkıcı işler için pizza, para ve baskı',
  'bill.lease': 'Taşınma',
  'bill.leaseDetail': 'kamyon ve yeni kira sözleşmesi',
  'bill.other': 'Diğer',
  'bill.otherDetail': 'kalem kalem ayrılmamış',
  'bill.crewDues': 'Ekip aidatı',
  'bill.crewDuesDetail': (p) => `${p.count} kayıtlı · kişi başı ${p.each}`,
  'bill.communityDues': 'Topluluk aidatı',
  'bill.communityDuesDetail': (p) => `${p.count} kişi mekânı kullanıyor · kişi başı ${p.each}`,
  'bill.rent': 'Kira',
  'bill.power': 'Elektrik ve sarf malzemesi',
  'bill.powerDetail': (p) => `${p.hours} makine-saat`,
  'bill.comforts': 'Konfor',
  'bill.comfortsDetail': (p) => `mekânda ${p.count} tane · işletme giderleri`,
};
