import type { Messages } from './en';
import { log } from './tr/log';
import { ui } from './tr/ui';

/** Türkçe. Each area file is typed against its English counterpart. */
export const tr: Messages = { ...log, ...ui };
