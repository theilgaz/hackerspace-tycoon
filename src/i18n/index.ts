import { en, type Messages } from './en';
import { tr } from './tr';
import { getLocale, type Locale } from './locale';

export { getLocale, setLocale, isLocale, num, caseLocale, LOCALES, type Locale } from './locale';
export { ek } from './turkish';

/**
 * Translation (CLAUDE.md §11). Two ways in:
 *
 * - `t(key, params)` renders now, in the current language. Use it for anything rebuilt
 *   every frame or never saved — panel markup, a member's status line.
 * - `msg(key, params)` *describes* a sentence without rendering it. Use it for anything that
 *   is stored — the log, the reason a run ended — and render it with `say()` at display
 *   time, so a save written in English reads in Turkish after switching.
 *
 * A parameter may itself be a `Message`, which is rendered first: that is how a sentence
 * carries a translated fragment ("the space", a machine's failure reason) inside it.
 */
export type MessageKey = keyof Messages;

export interface Message {
  key: string;
  params?: Record<string, Param>;
}
export type Param = string | number | Message;

/** Text that may be stored: a plain string (old saves, the dev console) or a message. */
export type Text = string | Message;

/** A message's parameters, where any string may instead be a nested message. */
type Raw<P> = { [K in keyof P]: P[K] extends string ? string | Message : P[K] };
type Args<K extends MessageKey> = Messages[K] extends (p: infer P) => string ? [params: Raw<P>] : [];

const DICTIONARIES: Record<Locale, Messages> = { en, tr, xx: en };

type Entry = string | ((params: Record<string, string | number>) => string);

/** Stored keys are plain strings, so look them up without the per-key parameter types. */
function lookup(dictionary: Messages, key: string): Entry | undefined {
  return (dictionary as unknown as Record<string, Entry | undefined>)[key];
}

function render(message: Message): string {
  const locale = getLocale();
  const entry = lookup(DICTIONARIES[locale], message.key) ?? lookup(en, message.key);
  // A key that has since been removed still says *something* rather than throwing inside a
  // render loop — an old save can carry keys a newer build no longer has.
  if (entry === undefined) return message.key;
  let out: string;
  if (typeof entry === 'function') {
    const resolved: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(message.params ?? {})) {
      resolved[name] = typeof value === 'object' ? render(value) : value;
    }
    out = entry(resolved);
  } else {
    out = entry;
  }
  return locale === 'xx' ? `⟦${out}⟧` : out;
}

export function t<K extends MessageKey>(key: K, ...args: Args<K>): string {
  return render({ key, params: args[0] as Record<string, Param> | undefined });
}

export function msg<K extends MessageKey>(key: K, ...args: Args<K>): Message {
  const params = args[0] as Record<string, Param> | undefined;
  return params ? { key, params } : { key };
}

/** Render stored text in the current language. */
export function say(text: Text | null | undefined): string {
  if (text == null) return '';
  return typeof text === 'string' ? text : render(text);
}

/** Two stored texts are the same sentence — what the log's `×N` collapsing compares. */
export function sameText(a: Text, b: Text): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.key === b.key && JSON.stringify(a.params ?? {}) === JSON.stringify(b.params ?? {});
}
