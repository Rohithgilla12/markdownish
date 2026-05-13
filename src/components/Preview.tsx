import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { remarkPlugins, rehypePlugins } from "@/lib/markdown";
import { parseFrontmatter } from "@/lib/frontmatter";
import { FrontmatterCard } from "@/components/FrontmatterCard";

type Props = { source: string };

export function Preview({ source }: Props) {
  // Re-parse only when source changes. gray-matter is fast but we render on every keystroke.
  const parsed = useMemo(() => parseFrontmatter(source), [source]);

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[color:var(--color-bg)]">
      <article className="prose mx-auto px-10 py-10">
        {parsed.hasFrontmatter && <FrontmatterCard data={parsed.data} />}
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
          {parsed.content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
