import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Planlama belgelerinin (Claude'un yazdığı Markdown) okunur hali. Tailwind
// typography eklentisi yok; öğeler tek tek temanın token'larıyla stillendi.
// Ham HTML render edilmez (react-markdown varsayılanı) — belge içeriği
// Claude çıktısı olduğu için bu bilinçli.
const components: Components = {
  h1: ({ children }) => <h1 className="mt-2 mb-3 text-xl font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-6 mb-2 border-b pb-1 text-lg font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-1.5 font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children, className }) => (
    // GFM görev listeleri (- [ ]) kendi kutucuğunu getirir, madde işareti gerekmez.
    <ul className={className?.includes("contains-task-list") ? "my-2 space-y-1" : "my-2 list-disc space-y-1 pl-5"}>
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children, className }) => (
    <li className={className?.includes("task-list-item") ? "flex items-start gap-2 [&>input]:mt-1.5" : undefined}>
      {children}
    </li>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-4" />,
  code: ({ children, className }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{children}</pre>
  ),
  // Geniş tablolar sayfayı değil yalnızca kendilerini kaydırır.
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border px-2 py-1 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 text-sm break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
