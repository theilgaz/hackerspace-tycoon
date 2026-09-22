/**
 * Turkish case suffixes for names the game did not write — projects, people, machines.
 *
 * Turkish marks case with a suffix that follows vowel harmony, and a proper noun takes it
 * after an apostrophe: Konya'dan, Drone'u, CNC'ye. A template cannot do that, so a message
 * that needs a name in a case asks for it here: `ek(name, 'dat')`.
 *
 * Harmony is read from the spelling, which is right for Turkish words and a fair guess for
 * English ones. An all-caps acronym is read the way it is said, by its last letter's name —
 * "CNC" ends in "ce", so it is CNC'ye.
 */
export type Case = 'acc' | 'dat' | 'loc' | 'abl' | 'gen';

const BACK = 'aıou';
const FRONT = 'eiöü';
const VOWELS = BACK + FRONT;
/** Fıstıkçı şahap: after these, d becomes t. */
const HARD = 'fstkçşhp';

/** How a letter is said when an acronym is spelt out. */
const LETTER_NAME: Record<string, string> = {
  a: 'a', b: 'be', c: 'ce', ç: 'çe', d: 'de', e: 'e', f: 'fe', g: 'ge', ğ: 'yumuşak ge',
  h: 'he', ı: 'ı', i: 'i', j: 'je', k: 'ke', l: 'le', m: 'me', n: 'ne', o: 'o', ö: 'ö',
  p: 'pe', q: 'kü', r: 're', s: 'se', ş: 'şe', t: 'te', u: 'u', ü: 'ü', v: 've', w: 've',
  x: 'iks', y: 'ye', z: 'ze',
};

const DIGIT_NAME = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS_NAME = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];

/** How a number is said at its end, which is all a suffix cares about: 3'te, 10'da, 100'de. */
function spokenNumber(digits: string): string {
  if (/[1-9]000$/.test(digits) || digits === '1000') return 'bin';
  if (/[1-9]00$/.test(digits)) return 'yüz';
  if (digits.length > 1 && digits.endsWith('0')) return TENS_NAME[Number(digits.slice(-2, -1))];
  return DIGIT_NAME[Number(digits.slice(-1))];
}

/** The end of a name the way it is pronounced, lower-cased — only its last sounds matter. */
function spoken(word: string): string {
  const token = word.trim().split(/[\s\-/]+/).pop() ?? '';
  const digits = token.match(/[0-9]+$/);
  if (digits) return spokenNumber(digits[0]);
  const letters = token.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  const isAcronym = letters.length > 0 && letters.length <= 5 && letters === letters.toLocaleUpperCase('tr');
  if (isAcronym) {
    return LETTER_NAME[letters.slice(-1).toLocaleLowerCase('tr')] ?? letters.toLocaleLowerCase('tr');
  }
  return letters.toLocaleLowerCase('tr');
}

function lastVowel(sound: string): string {
  for (let i = sound.length - 1; i >= 0; i--) {
    if (VOWELS.includes(sound[i])) return sound[i];
  }
  return 'e';
}

/** The suffix alone, without the apostrophe. */
export function suffix(word: string, grammaticalCase: Case): string {
  const sound = spoken(word);
  const vowel = lastVowel(sound);
  const endsInVowel = VOWELS.includes(sound.slice(-1));
  const hard = HARD.includes(sound.slice(-1));
  const two = BACK.includes(vowel) ? 'a' : 'e';
  const four = 'aı'.includes(vowel) ? 'ı' : 'ei'.includes(vowel) ? 'i' : 'ou'.includes(vowel) ? 'u' : 'ü';
  const d = hard ? 't' : 'd';
  switch (grammaticalCase) {
    case 'acc':
      return (endsInVowel ? 'y' : '') + four;
    case 'dat':
      return (endsInVowel ? 'y' : '') + two;
    case 'loc':
      return d + two;
    case 'abl':
      return d + two + 'n';
    case 'gen':
      return (endsInVowel ? 'n' : '') + four + 'n';
  }
}

/** A proper noun in a case: `ek('Konya', 'abl')` → "Konya'dan". */
export function ek(word: string, grammaticalCase: Case): string {
  return `${word}'${suffix(word, grammaticalCase)}`;
}
