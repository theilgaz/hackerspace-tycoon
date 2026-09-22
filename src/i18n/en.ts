import { log } from './en/log';
import { ui } from './en/ui';

/**
 * English is the source of truth; every other language is typed against it, area by area,
 * so a missing or misspelt key fails `npm run typecheck` rather than showing up on screen.
 *
 * - `en/log.ts` — the log, status lines and anything else the Simulation says.
 * - `en/ui.ts`  — panel chrome: headings, buttons, labels, tooltips.
 */
export const en = { ...log, ...ui };

export type Messages = typeof en;
