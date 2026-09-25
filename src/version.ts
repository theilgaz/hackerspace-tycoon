/** Injected by Vite from package.json (`vite.config.ts`). */
declare const __APP_VERSION__: string;

/**
 * The version on the start screen. **Bump it in package.json for every itch.io upload**
 * (CLAUDE.md §15): a player who reports a bug from a build needs to be able to say which.
 */
export const VERSION: string = __APP_VERSION__;
