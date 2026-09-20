/**
 * The accent schemes a person can choose between, in Settings.
 *
 * Modernist is a mono system: one ground, one ink, one accent. So a scheme
 * varies the accent role and nothing else — the paper, the rules, the zero
 * radius and the type are the same in every one of them. What changes is the
 * colour a tag is tinted with, what a hovered row goes, and what the primary
 * button and the rail's selected row are filled with.
 *
 * The values themselves live in index.css as `.scheme-<id>` blocks. They were
 * generated against WCAG AA rather than chosen by eye; see the comment there.
 * This file is only the list the picker renders, and the swatches are pulled
 * from the same generated values so the two cannot drift apart silently.
 */
export interface ColorScheme {
  id: string;
  name: string;
  note: string;
  /** Tint, strong tint, rule, primary fill — shown as the picker's swatch. */
  swatches: [string, string, string, string];
}

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: "ink",
    name: "Ink Rail",
    note: "The design's own red",
    swatches: ["#ffedeb", "#ffd7d1", "#fc4a2f", "#e02b10"],
  },
  {
    id: "blush",
    name: "Blush",
    note: "A soft rose",
    swatches: ["#feebf0", "#fdd3de", "#e45b7f", "#d13d64"],
  },
  {
    id: "apricot",
    name: "Apricot",
    note: "Warm peach",
    swatches: ["#fef3eb", "#fde4d3", "#e16716", "#b65b1e"],
  },
  {
    id: "sage",
    name: "Sage",
    note: "Muted green",
    swatches: ["#f0faf5", "#ddf3e9", "#319b6a", "#35825e"],
  },
  {
    id: "sky",
    name: "Sky",
    note: "Cool blue",
    swatches: ["#ecf6fd", "#d5ecfb", "#2390d9", "#297ab0"],
  },
  {
    id: "lilac",
    name: "Lilac",
    note: "Pale violet",
    swatches: ["#f3edfc", "#e5d7f9", "#9e76db", "#885fc7"],
  },
];

export const DEFAULT_SCHEME = "ink";

/** Where the choice is kept. Also read by the inline script in index.html. */
export const SCHEME_STORAGE_KEY = "traineehq-color-scheme";

export const SCHEME_CLASSES = COLOR_SCHEMES.map((s) => `scheme-${s.id}`);

/** A stored value is only honoured if it still names a scheme that exists. */
export function isKnownScheme(id: string | null | undefined): id is string {
  return !!id && COLOR_SCHEMES.some((s) => s.id === id);
}
