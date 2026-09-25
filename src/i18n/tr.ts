import type { Messages } from './en';
import { log } from './tr/log';
import { ui } from './tr/ui';
import { build } from './tr/build';
import { dilemma } from './tr/dilemma';

/** Türkçe. Each area file is typed against its English counterpart. */
export const tr: Messages = { ...log, ...ui, ...build, ...dilemma };
