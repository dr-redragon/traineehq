import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { RichNode } from "@/lib/richText";
import { parsePageText, type InlineNode } from "@/lib/pageText";

function renderMarks(nodes: RichNode[]): React.ReactNode {
  return nodes.map((node, i) => {
    if (node.type === "text") return <Fragment key={i}>{node.text}</Fragment>;
    const children = renderMarks(node.children);
    switch (node.type) {
      case "bold": return <strong key={i} className="font-semibold">{children}</strong>;
      case "italic": return <em key={i}>{children}</em>;
      case "underline": return <u key={i}>{children}</u>;
      case "strike": return <s key={i}>{children}</s>;
    }
  });
}

function renderInline(nodes: InlineNode[]): React.ReactNode {
  return nodes.map((node, i) =>
    node.type === "link" ? (
      <a
        key={i}
        href={node.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-accent-deep underline underline-offset-2 hover:text-foreground"
      >
        {renderMarks(node.children)}
      </a>
    ) : (
      <Fragment key={i}>{renderMarks([node])}</Fragment>
    ),
  );
}

function renderLines(lines: InlineNode[][]) {
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderInline(line)}
    </Fragment>
  ));
}

/**
 * A page's text, drawn from the page-text format (see lib/pageText.ts).
 *
 * Headings come out as h3/h4 because the page's own name is the h2 above.
 */
export function PageText({ text, className }: { text: string | null | undefined; className?: string }) {
  const blocks = parsePageText(text);
  if (!blocks.length) return null;
  return (
    <div className={cn("max-w-[72ch] space-y-3 text-[15px] leading-relaxed", className)}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h3 key={i} className="pt-3 font-display text-lg font-extrabold tracking-tight first:pt-0">
                {renderInline(block.text)}
              </h3>
            ) : (
              <h4 key={i} className="pt-2 font-display text-base font-bold first:pt-0">{renderInline(block.text)}</h4>
            );
          case "paragraph":
            return <p key={i}>{renderLines(block.lines)}</p>;
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List key={i} className={cn("space-y-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
                {block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
              </List>
            );
          }
          case "callout":
            return (
              <div key={i} className="border-t-[3px] border-foreground bg-card px-4 py-3 text-sm">
                {renderLines(block.lines)}
              </div>
            );
        }
      })}
    </div>
  );
}
