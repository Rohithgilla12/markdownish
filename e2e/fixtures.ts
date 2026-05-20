import { test as base, expect, type Page } from "@playwright/test";
// Ambient types live in playwright-types.d.ts (picked up via tsconfig
// include). No runtime import needed.

type Handler = (
  args: Record<string, unknown>,
) => unknown | Promise<unknown>;

export type PwApi = {
  /** Register a single handler for a Tauri `invoke` command. */
  setHandler(command: string, fn: Handler): Promise<void>;
  /** Register multiple handlers at once. */
  setHandlers(map: Record<string, Handler>): Promise<void>;
  /** Trigger a watcher event from the test side. */
  emitWatcher(event: { type: unknown; paths?: string[] }): Promise<void>;
  /** Reset all handlers and the watcher callback. */
  reset(): Promise<void>;
};

export const test = base.extend<{ pw: PwApi }>({
  pw: async ({ page }, use) => {
    const api: PwApi = {
      async setHandler(command, fn) {
        await page.evaluate(
          ([c, fnSource]) => {
            const built = new Function("return " + fnSource)() as PwHandler;
            window.__pw.handlers[c] = built;
          },
          [command, fn.toString()] as const,
        );
      },
      async setHandlers(map) {
        for (const [k, v] of Object.entries(map)) {
          await api.setHandler(k, v);
        }
      },
      async emitWatcher(event) {
        await page.evaluate((e) => window.__pw.emitWatcherEvent(e), event);
      },
      async reset() {
        await page.evaluate(() => window.__pw.reset());
      },
    };
    await use(api);
  },
});

export { expect };

/**
 * Navigates to the app with a fresh mock-handler bag installed *before*
 * page scripts run — so `App.tsx`'s mount-time invokes (e.g.
 * `take_launch_folder`) never throw "no handler" errors.
 *
 * Handler functions are serialised to source and reconstructed via
 * `Function(source)()` in the page context, so they must be pure: they
 * cannot close over anything from the test process.
 */
export async function gotoApp(
  page: Page,
  handlers: Record<string, Handler> = {},
): Promise<void> {
  const defaults: Record<string, Handler> = {
    take_launch_folder: () => null,
  };
  const merged: Record<string, Handler> = { ...defaults, ...handlers };
  const bag = Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [k, v.toString()]),
  );
  await page.addInitScript((handlerSources: Record<string, string>) => {
    if (!window.__pw) {
      window.__pw = {
        handlers: {},
        watcher: null,
        emitWatcherEvent: (event) => {
          if (window.__pw.watcher) window.__pw.watcher(event);
        },
        reset: () => {
          window.__pw.handlers = {};
          window.__pw.watcher = null;
        },
      };
    }
    for (const [k, src] of Object.entries(handlerSources)) {
      window.__pw.handlers[k] = new Function("return " + src)() as PwHandler;
    }
  }, bag);
  await page.goto("/");
}
