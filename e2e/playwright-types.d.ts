// Ambient declarations so spec files and fixtures can reach into the
// browser-side mock surface without `as any` casts.

declare global {
  type PwHandler = (
    args: Record<string, unknown>,
  ) => unknown | Promise<unknown>;

  type PwWatcherEvent = { type: unknown; paths?: string[] };

  interface Window {
    __pw: {
      handlers: Record<string, PwHandler>;
      watcher: ((event: PwWatcherEvent) => void) | null;
      emitWatcherEvent: (event: PwWatcherEvent) => void;
      reset: () => void;
    };
  }
}

export {};
