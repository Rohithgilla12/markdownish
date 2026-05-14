import { FolderOpen, X } from "lucide-react";

type Props = {
  onOpen: () => void;
  recent: string[];
  onOpenRecent: (path: string) => void;
  onForget: (path: string) => void;
};

function shorten(path: string): { name: string; parent: string } {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const name = parts[parts.length - 1] ?? path;
  const parent = parts.slice(0, -1).join("/");
  // Tilde-ify home if present
  const home = parent.match(/Users\/[^/]+/);
  const parentShort = home ? parent.replace(/^.*Users\/[^/]+/, "~") : "/" + parent;
  return { name, parent: parentShort };
}

export function EmptyState({ onOpen, recent, onOpenRecent, onForget }: Props) {
  return (
    <main className="relative grid h-full place-items-center overflow-hidden px-8">
      {/* Ghost outline numeral floating behind the title */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[58%] select-none font-display text-[clamp(28rem,48vw,48rem)] font-light italic leading-none tracking-tighter text-transparent"
        style={{ WebkitTextStroke: "1px var(--color-rule-soft)" }}
      >
        md
      </span>

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <div className="text-eyebrow mb-6 text-[color:var(--color-foil)]">
          ── A Markdown Editor ──
        </div>

        <h1 className="text-display text-[clamp(3.5rem,8vw,6.5rem)] text-foreground">
          Markdownish<span className="text-[color:var(--color-foil)]">.</span>
        </h1>

        <p className="mt-4 max-w-md text-balance text-[color:var(--color-fg-2)] [font-family:var(--font-display)] text-lg italic">
          For the wretched business of editing markdown at strange hours.
        </p>

        <div className="mt-12 flex flex-col items-center gap-4">
          <button
            onClick={onOpen}
            className="no-drag group inline-flex items-center gap-3 rounded-full border border-[color:var(--color-foil)]/40 bg-[color:var(--color-foil)]/[0.06] px-7 py-3 font-mono text-sm tracking-[0.18em] uppercase text-[color:var(--color-foil)] transition-[background,border-color,transform] duration-200 ease-[var(--ease-out-quart)] hover:bg-[color:var(--color-foil)]/[0.14] hover:border-[color:var(--color-foil)]/70 active:scale-[0.98]"
          >
            <FolderOpen className="h-4 w-4" strokeWidth={1.5} />
            <span>Open a folder</span>
          </button>
          <div className="text-marginalia">
            or drop a folder anywhere on this window
          </div>
        </div>

        {/* Recent folders */}
        {recent.length > 0 && (
          <section className="mt-14 w-full">
            <div className="text-eyebrow mb-3 text-center">Recent</div>
            <ul className="mx-auto w-full max-w-md divide-y divide-[color:var(--color-rule-soft)] border-y border-[color:var(--color-rule-soft)]">
              {recent.map((path) => {
                const { name, parent } = shorten(path);
                return (
                  <li key={path} className="group flex items-center gap-3 py-2">
                    <button
                      onClick={() => onOpenRecent(path)}
                      className="flex flex-1 items-center gap-3 text-left transition-colors"
                    >
                      <span className="font-display text-base text-foreground transition-colors group-hover:text-[color:var(--color-foil)]">
                        {name}
                      </span>
                      <span className="text-marginalia truncate">{parent}</span>
                    </button>
                    <button
                      onClick={() => onForget(path)}
                      aria-label="Forget"
                      className="text-[color:var(--color-fg-faint)] opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Colophon stamp */}
        <div className="mt-20 flex w-full max-w-xl items-center justify-between border-t border-[color:var(--color-rule-soft)] pt-5">
          <span className="text-marginalia">
            SET IN <b className="text-foreground font-normal">SPECTRAL</b> &amp; <b className="text-foreground font-normal">GEIST</b>
          </span>
          <span className="text-marginalia">
            <b className="text-[color:var(--color-foil)] font-normal">v{__APP_VERSION__}</b> · WALNUT &amp; FOIL
          </span>
        </div>
      </div>
    </main>
  );
}
