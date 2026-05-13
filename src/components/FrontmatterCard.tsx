import { formatFrontmatterValue, type Frontmatter } from "@/lib/frontmatter";

type Props = { data: Frontmatter };

export function FrontmatterCard({ data }: Props) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  // Try to pick out a title for the colophon header — most markdown specs have one.
  const title = pickString(data, ["title", "name", "Title", "Name"]);
  const rest = entries.filter(([k]) => k.toLowerCase() !== "title" && k.toLowerCase() !== "name");

  return (
    <aside
      className="not-prose mb-10 mt-2 max-w-[65ch]"
      aria-label="Frontmatter"
    >
      <div className="text-eyebrow mb-3 text-center text-[color:var(--color-foil)]">
        — Colophon —
      </div>

      {title && (
        <div className="mb-5 text-center font-display text-2xl italic text-foreground">
          {title}
        </div>
      )}

      <div className="grid grid-cols-[120px_1fr] gap-x-5 gap-y-2 border-y border-[color:var(--color-foil)] py-4">
        {rest.map(([key, value]) => (
          <div className="contents" key={key}>
            <dt className="text-eyebrow text-[color:var(--color-foil)]">{key}</dt>
            <dd className="break-words font-mono text-[13px] text-foreground">
              {formatFrontmatterValue(value)}
            </dd>
          </div>
        ))}
      </div>
    </aside>
  );
}

function pickString(data: Frontmatter, keys: string[]): string | null {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}
