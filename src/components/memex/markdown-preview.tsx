"use client"

import ReactMarkdown from "react-markdown"
import { cn } from "@/lib/utils"

// Client-side Markdown renderer with Memex-styled elements.
// Used for note content preview and anywhere we want rich rendering
// of user-authored markdown (not chat answers — those use AnswerRenderer
// for inline citation pills).
export function MarkdownPreview({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed prose-memex",
        className
      )}
    >
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-lg font-semibold mt-4 mb-2 tracking-tight" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-base font-semibold mt-3 mb-1.5 tracking-tight border-b border-border pb-1" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-sm font-semibold mt-2.5 mb-1" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-sm font-medium mt-2 mb-1" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="my-2 leading-relaxed text-foreground/90" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-5 my-2 space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="text-foreground/90" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
              {...props}
            />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-foreground" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="italic" {...props} />
          ),
          code: ({ node, className, children, ...props }) => {
            const isInline = !className
            if (isInline) {
              return (
                <code
                  className="px-1 py-0.5 rounded bg-muted text-[0.85em] font-mono text-foreground"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code className={cn("font-mono text-[0.85em]", className)} {...props}>
                {children}
              </code>
            )
          },
          pre: ({ node, ...props }) => (
            <pre
              className="my-3 p-3 rounded-md bg-muted border border-border overflow-x-auto text-xs"
              {...props}
            />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-2 border-primary/40 pl-3 my-2 italic text-muted-foreground"
              {...props}
            />
          ),
          hr: () => <hr className="my-4 border-border" />,
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-3">
              <table
                className="w-full text-xs border-collapse border border-border"
                {...props}
              />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th
              className="border border-border bg-muted px-2 py-1 text-left font-semibold"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-border px-2 py-1" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
