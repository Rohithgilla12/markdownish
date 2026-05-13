import ReactMarkdown from "react-markdown";
import { remarkPlugins, rehypePlugins } from "@/lib/markdown";

type Props = { source: string };

export function Preview({ source }: Props) {
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[color:var(--color-bg)]">
      <article className="prose mx-auto px-10 py-10">
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
          {source}
        </ReactMarkdown>
      </article>
    </div>
  );
}
