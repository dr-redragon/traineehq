import { Fragment } from "react";
import { parseRichText, type RichNode } from "@/lib/richText";

function renderNodes(nodes: RichNode[]): React.ReactNode {
  return nodes.map((node, i) => {
    if (node.type === "text") return <Fragment key={i}>{node.text}</Fragment>;
    const children = renderNodes(node.children);
    switch (node.type) {
      case "bold": return <strong key={i} className="font-semibold">{children}</strong>;
      case "italic": return <em key={i}>{children}</em>;
      case "underline": return <u key={i}>{children}</u>;
      case "strike": return <s key={i}>{children}</s>;
    }
  });
}

/** Renders notice text with its inline formatting as real elements. */
export function RichText({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{renderNodes(parseRichText(text))}</span>;
}
