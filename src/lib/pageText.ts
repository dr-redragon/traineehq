/**
 * The text on a specialty page or folder.
 *
 * Stored as plain text in a small, forgiving subset of Markdown, so it reads
 * sensibly in the database and in the editor, and so text pasted from a
 * deanery page needs little more than a `## ` in front of each heading:
 *
 *   ## Heading           ### Smaller heading
 *   - bullet             1. numbered
 *   > Please note …      (a callout; consecutive `>` lines are one callout)
 *   **bold**  *italic*  __underline__  ~~strike~~   (as notices, see richText.ts)
 *   [link text](https://…)   and bare https:// addresses
 *
 * A blank line starts a new paragraph; a single line break inside one is kept.
 *
 * Like richText.ts this produces a tree that is rendered as React elements —
 * nothing reaches dangerouslySetInnerHTML — and links are only ever http(s)
 * or mailto, so a page cannot carry a `javascript:` address.
 */
import { parseRichText, type RichNode } from "@/lib/richText";

export type InlineNode = RichNode | { type: "link"; href: string; children: RichNode[] };

export type PageBlock =
  | { type: "heading"; level: 2 | 3; text: InlineNode[] }
  | { type: "paragraph"; lines: InlineNode[][] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "callout"; lines: InlineNode[][] };

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

/** Only addresses that go somewhere ordinary. Anything else stays as text. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^mailto:[^\s]+@[^\s]+$/i.test(href)) return href;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function parseInline(input: string): InlineNode[] {
  const out: InlineNode[] = [];
  let last = 0;
  for (const match of input.matchAll(LINK)) {
    const [whole, label, target, bare] = match;
    const href = safeHref(target ?? bare);
    if (!href) continue;
    const at = match.index ?? 0;
    if (at > last) out.push(...parseRichText(input.slice(last, at)));
    out.push({ type: "link", href, children: parseRichText(label ?? bare) });
    last = at + whole.length;
  }
  if (last < input.length) out.push(...parseRichText(input.slice(last)));
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const CALLOUT = /^\s*>\s?(.*)$/;

export function parsePageText(input: string | null | undefined): PageBlock[] {
  if (!input?.trim()) return [];
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const blocks: PageBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const heading = HEADING.exec(line);
    if (heading) {
      // `#` is the page's own title, which the page already shows, so it is
      // drawn at the larger in-page level rather than competing with it.
      blocks.push({ type: "heading", level: heading[1].length === 3 ? 3 : 2, text: parseInline(heading[2].trim()) });
      i += 1;
      continue;
    }

    if (CALLOUT.test(line)) {
      const out: InlineNode[][] = [];
      while (i < lines.length && CALLOUT.test(lines[i])) {
        out.push(parseInline(CALLOUT.exec(lines[i])![1]));
        i += 1;
      }
      blocks.push({ type: "callout", lines: out });
      continue;
    }

    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? NUMBERED : BULLET;
      const items: InlineNode[][] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(parseInline(pattern.exec(lines[i])![1]));
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const out: InlineNode[][] = [];
    while (
      i < lines.length && lines[i].trim() &&
      !HEADING.test(lines[i]) && !CALLOUT.test(lines[i]) &&
      !BULLET.test(lines[i]) && !NUMBERED.test(lines[i])
    ) {
      out.push(parseInline(lines[i].trim()));
      i += 1;
    }
    blocks.push({ type: "paragraph", lines: out });
  }

  return blocks;
}

/** Plain words of the text, for a one-line preview under a subpage's name. */
export function pageTextSummary(input: string | null | undefined, max = 140): string {
  const plain = (input ?? "")
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    .replace(/^\s*(#{1,3}|>|[-*•]|\d+[.)])\s+/gm, "")
    .replace(/\*\*|__|~~|\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/**
 * Put a line prefix (`## `, `- `, `> `) on every line the selection touches,
 * or take it off if they all have it already — the toolbar's heading, list
 * and callout buttons.
 */
export function toggleLinePrefix(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
): { value: string; selectionStart: number; selectionEnd: number } {
  const from = value.lastIndexOf("\n", Math.min(selectionStart, selectionEnd) - 1) + 1;
  const nextBreak = value.indexOf("\n", Math.max(selectionStart, selectionEnd));
  const to = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(from, to).split("\n");
  // Any other heading or list marker on the line is replaced rather than
  // stacked, so "## " on a bullet makes a heading, not "## - text".
  const strip = (line: string) => line.replace(/^(#{1,3}\s+|[-*•]\s+|\d+[.)]\s+|>\s?)/, "");
  const allHave = lines.every((line) => !line.trim() || line.startsWith(prefix));
  const next = lines
    .map((line) => (!line.trim() ? line : allHave ? line.slice(prefix.length) : prefix + strip(line)))
    .join("\n");
  return { value: value.slice(0, from) + next + value.slice(to), selectionStart: from, selectionEnd: from + next.length };
}
