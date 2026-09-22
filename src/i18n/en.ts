import { log } from './en/log';
import { ui } from './en/ui';
import { build } from './en/build';

/**
 * English is the source of truth; every other language is typed against it, area by area,
 * so a missing or misspelt key fails `npm run typecheck` rather than showing up on screen.
 *
 * - `en/log.ts` — the log, status lines and anything else the Simulation says.
 * - `en/ui.ts`  — panel chrome: headings, buttons, labels, tooltips.
 * - `en/build.ts` — + New Project, Build and the kickoff (§4c, §4d).
 */
export const en = { ...log, ...ui, ...build };

export type Messages = typeof en;
