type Props = { folder: string; onChangeFolder: () => void };

/**
 * Phase-1 placeholder. The sidebar / editor / preview live here from Phase 2 onward.
 */
export function Workspace({ folder, onChangeFolder }: Props) {
  return (
    <main className="relative grid h-full grid-cols-[260px_1fr] overflow-hidden">
      <aside className="border-r border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)]/40 p-6">
        <div className="text-eyebrow mb-4">Folder</div>
        <div className="text-marginalia mb-6 break-all">{folder}</div>
        <button
          onClick={onChangeFolder}
          className="no-drag w-full rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 py-2 text-left text-sm transition-colors hover:border-[color:var(--color-foil)]/50 hover:text-[color:var(--color-foil)]"
        >
          Change folder…
        </button>
      </aside>

      <section className="grid place-items-center">
        <div className="text-center">
          <div className="text-eyebrow mb-3 text-[color:var(--color-foil)]">Phase 2</div>
          <p className="text-display text-3xl text-foreground">File tree comes next.</p>
        </div>
      </section>
    </main>
  );
}
