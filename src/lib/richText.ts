/**
 * Minimal inline formatting for notice text.
 *
 * Notices are stored as plain text with lightweight markers, so anything
 * written before this existed keeps rendering exactly as it did:
 *
 *   **bold**   *italic*   __underline__   ~~strikethrough~~
 *
 * The parser produces a node tree that the renderer turns into real React
 * elements — nothing is ever fed to dangerouslySetInnerHTML, so a notice
 * cannot inject markup.
 */

export type RichMark = "bold" | "italic" | "underline" | "strike";

export type RichNode =
  | { type: "text"; text: string }
  | { type: RichMark; children: RichNode[] };

export const MARKERS: Record<RichMark, string> = {
  bold: "**",
  underline: "__",
  strike: "~~",
  italic: "*",
};

// Longest markers first so `**` wins over `*`.
const ORDERED: Array<{ mark: RichMark; marker: string }> = [
  { mark: "bold", marker: MARKERS.bold },
  { mark: "underline", marker: MARKERS.underline },
  { mark: "strike", marker: MARKERS.strike },
  { mark: "italic", marker: MARKERS.italic },
];

/** Parse marker syntax into a node tree. Unmatched markers stay literal text. */
export function parseRichText(input: string): RichNode[] {
  const out: RichNode[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) { out.push({ type: "text", text: buf }); buf = ""; }
  };

  while (i < input.length) {
    const hit = ORDERED.find(({ marker }) => input.startsWith(marker, i));
    if (hit) {
      const from = i + hit.marker.length;
      const close = input.indexOf(hit.marker, from);
      if (close > from) {
        flush();
        out.push({ type: hit.mark, children: parseRichText(input.slice(from, close)) });
        i = close + hit.marker.length;
        continue;
      }
    }
    buf += input[i];
    i += 1;
  }

  flush();
  return out;
}

/** True when the text contains no formatting markers at all. */
export function isPlainText(input: string): boolean {
  return parseRichText(input).every((n) => n.type === "text");
}

export interface MarkerEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Toggle a marker around the current textarea selection.
 *
 * With no selection it inserts an empty pair and parks the caret between the
 * markers, so the next keystroke is formatted. With a selection it wraps, or
 * unwraps when the selection is already marked (inside or just outside it).
 */
export function toggleMarker(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  mark: RichMark,
): MarkerEdit {
  const marker = MARKERS[mark];
  const len = marker.length;
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const selected = value.slice(start, end);

  if (!selected) {
    return {
      value: value.slice(0, start) + marker + marker + value.slice(start),
      selectionStart: start + len,
      selectionEnd: start + len,
    };
  }

  // Markers sit inside the selection: **like this**
  if (selected.length > 2 * len && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(len, selected.length - len);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  // Markers sit just outside the selection: **|like this|**
  if (value.slice(start - len, start) === marker && value.slice(end, end + len) === marker) {
    return {
      value: value.slice(0, start - len) + selected + value.slice(end + len),
      selectionStart: start - len,
      selectionEnd: start - len + selected.length,
    };
  }

  return {
    value: value.slice(0, start) + marker + selected + marker + value.slice(end),
    selectionStart: start + len,
    selectionEnd: end + len,
  };
}
