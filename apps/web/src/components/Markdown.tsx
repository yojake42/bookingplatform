import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Styled markdown for legal pages. react-markdown never renders raw HTML, so admin content can't inject markup. */
const components: Components = {
  h1: ({ children }) => <h2 className="mt-10 mb-3 text-2xl font-bold tracking-tight first:mt-0">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-10 mb-3 text-xl font-semibold tracking-tight first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-8 mb-2 text-lg font-semibold">{children}</h3>,
  p: ({ children }) => <p className="my-4 text-[15px] leading-7 text-ink-700">{children}</p>,
  ul: ({ children }) => <ul className="my-4 list-disc space-y-1.5 pl-6 text-[15px] leading-7 text-ink-700 marker:text-ink-400">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-1.5 pl-6 text-[15px] leading-7 text-ink-700 marker:text-ink-400">{children}</ol>,
  a: ({ children, href }) => (
    <a href={href} className="font-medium text-ink-900 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900" target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ink-900">{children}</strong>,
  em: ({ children }) => <em className="text-ink-600">{children}</em>,
  blockquote: ({ children }) => <blockquote className="my-6 border-l-4 border-ink-200 pl-4 text-ink-600 italic">{children}</blockquote>,
  hr: () => <hr className="my-10 border-ink-200" />,
  code: ({ children }) => <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[13px]">{children}</code>,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-xl ring-1 ring-ink-200">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-ink-50 text-xs font-semibold tracking-wide text-ink-500 uppercase">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-3">{children}</th>,
  td: ({ children }) => <td className="border-t border-ink-100 px-4 py-3 align-top text-ink-700">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
