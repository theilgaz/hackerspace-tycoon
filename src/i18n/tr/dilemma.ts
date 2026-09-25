import { money } from '@/utils/format';
import type { dilemma as en } from '../en/dilemma';
import { num } from '../locale';
import { ek } from '../turkish';

/** Türkçe — ikilem kartları (CLAUDE.md §7c). */
export const dilemma: typeof en = {
  'promo.log.started': (p) => `${p.project} tanıtılıyor: önümüzdeki ${p.days} günde yaklaşık ${p.gain} itibar.`,
  'promo.title': 'Tanıt',
  'promo.button': (p) => `Tanıt · ${money(p.cost)} → +${p.gain} itibar`,
  'promo.hint': (p) => `İtibar ${p.days} gün boyunca her gün bir parça gelir. Çıkıştan sonraki ${p.window} gün içinde, iş başına bir kez.`,
  'promo.running': (p) => `Tanıtılıyor · şimdiye kadar +${p.paid} / ${p.gain} itibar`,
  'dilemma.kicker': 'Bir karar',
  'dilemma.chance': (p) => `%${p.pct} ihtimalle:`,
  'dilemma.nothing': 'Hiçbir şey — kazanç da yok',
  'dilemma.fx.cash': (p) => `${p.amount < 0 ? '−' : '+'}${money(Math.abs(p.amount))}`,
  'dilemma.fx.rep': (p) => `${p.amount < 0 ? '−' : '+'}${num(Math.abs(p.amount))} itibar`,
  'dilemma.fx.moodAll': (p) => `herkesin morali ${p.delta < 0 ? '−' : '+'}${Math.abs(p.delta)}`,
  'dilemma.fx.moodOne': (p) => `${ek(p.name, 'gen')} morali ${p.delta < 0 ? '−' : '+'}${Math.abs(p.delta)}`,
  'dilemma.fx.away': (p) => `${p.name} ${p.days} gün yok`,
  'dilemma.fx.leave': (p) => `${p.name} ayrılır`,
  'dilemma.fx.work': (p) => `${p.days === 1 ? 'bugün' : `${p.days} gün`} iş hızı ${p.pct < 0 ? '−' : '+'}%${Math.abs(p.pct)}`,
  'dilemma.fx.printers': (p) => `yazıcılar ${p.days} gün durur`,
  'dilemma.fx.power': (p) => `${p.days} gün elektrik ×${num(p.times, 1)}`,
  'dilemma.fx.filament': (p) => `${p.days} gün filament ×${num(p.times, 1)}`,
  'dilemma.fx.dayOff': 'günün geri kalanı',
  'dilemma.log.chose': (p) => `${p.title}: ${p.option}.`,
  'dilemma.log.lucky': (p) => `${p.title} — tuttu.`,
  'dilemma.log.unlucky': (p) => `${p.title} — tutmadı.`,

  'dilemma.inspection.title': () => 'Yangın müfettişi',
  'dilemma.inspection.body': () =>
    'Tezgâhların arkasındaki kablolar odadaki herkesten yaşlı. Şimdi düzgünce yeniden çek, ya da bantla, ' +
    'her şeyi uzatma kablosundan çalıştır ve müfettişin geri gelmemesini um.',
  'dilemma.inspection.a': 'Şimdi yeniden çek',
  'dilemma.inspection.b': 'Bantla geç',

  'dilemma.rush.title': () => 'Müşteri acele ediyor',
  'dilemma.rush.body': () =>
    'Bir müşteri lansmanını öne çekti ve her şeyi daha hızlı istiyor. Ekip bir hafta mesai yapabilir — ' +
    'ya da hayır dersin, o da bunu herkese anlatır.',
  'dilemma.rush.a': 'Bir hafta mesai',
  'dilemma.rush.b': 'Hayır de',

  'dilemma.burnout.title': (p) => `${p.name} tükenmek üzere`,
  'dilemma.burnout.body': (p) =>
    `${p.name} her gün buradaydı ve belli oluyor: kısa cevaplar, soğumuş kahve, aynı hata üç kez. ` +
    'Birkaç gün eve gönder, ya da devam etsin ve geçmesini um.',
  'dilemma.burnout.a': 'Eve gönder',
  'dilemma.burnout.b': 'Devam etsin',

  'dilemma.printer.title': () => 'Yazıcı kartı yandı',
  'dilemma.printer.body': () =>
    'Yanık elektronik kokusu ve yazıcılar katmanın ortasında durdu. Acil tamir bugün çalıştırır; ' +
    'parça kargoyla dört gün sürer.',
  'dilemma.printer.a': 'Acil tamir',
  'dilemma.printer.b': 'Parçayı bekle',

  'dilemma.neighbours.title': () => 'Komşular bıktı',
  'dilemma.neighbours.body': () =>
    'Kapının altından gürültü şikâyeti, sokaktaki herkesin imzasıyla. Bir süre sessiz saatler uygula, ' +
    'ya da düzgün bir kapıya ve biraz akustik süngere para ver.',
  'dilemma.neighbours.a': 'Sessiz saatler',
  'dilemma.neighbours.b': 'Ses yalıtımı yap',

  'dilemma.poach.title': (p) => `Birisi ${ek(p.name, 'acc')} istiyor`,
  'dilemma.poach.body': (p) =>
    `Başka bir hackerspace ${ek(p.name, 'dat')} anahtar, masa ve kendine ait bir yazıcı teklif etti. ` +
    'Aslında karşılayamayacağın imkânlarla eşleyebilirsin, ya da ona iyi şanslar dilersin.',
  'dilemma.poach.a': 'Teklifi eşle',
  'dilemma.poach.b': 'İyi şanslar dile',

  'dilemma.press.title': () => 'Kapıda bir gazeteci',
  'dilemma.press.body': () =>
    'Yerel gazeteden biri bugün, fotoğraflarıyla birlikte bir tur istiyor. İsim için iyi — ama bütün ' +
    'günün gider, herkesin de yarısı.',
  'dilemma.press.a': 'Gezdir',
  'dilemma.press.b': 'Bugün olmaz',

  'dilemma.supplier.title': () => 'Filament zamlanıyor',
  'dilemma.supplier.body': () =>
    'Tedarikçi gelecek hafta fiyatları artırıyor. Şimdi bir yıllığını eski fiyattan sabitle, ya da yeni ' +
    'fiyattan kullandıkça öde.',
  'dilemma.supplier.a': 'Fiyatı sabitle',
  'dilemma.supplier.b': 'Kullandıkça öde',

  'dilemma.grant.title': () => 'Yarın biten bir hibe',
  'dilemma.grant.body': () =>
    'Son tarihini yeni duyduğun bir maker hibesi. Yazmak günün geri kalanını alır ve bunların yarısı ' +
    'başkasına gider.',
  'dilemma.grant.a': 'Bu gece yaz',
  'dilemma.grant.b': 'Boş ver',

  'dilemma.hackathon.title': () => 'Ekip hackathon istiyor',
  'dilemma.hackathon.body': () =>
    'Pizza, kimsenin anlaşamadığı bir tema ve saçma bir şey yapılan kırk sekiz saat. Herkese iyi gelir — ' +
    'ama bedava değil.',
  'dilemma.hackathon.a': 'Parasını ver',
  'dilemma.hackathon.b': 'Bu ay olmaz',
};
