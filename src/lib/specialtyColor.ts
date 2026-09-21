/**
 * A specialty's own colour, split so CSS can adjust it per theme.
 *
 * Each specialty stores a colour as an HSL triplet — "8 85% 50%" — chosen in
 * the admin panel against a light page. Several were picked very dark, which
 * is fine on paper and invisible on the dark ground: T&O's "20 5% 12%" is the
 * ink the dark theme uses for its own background, so the icon was drawn in
 * exactly the colour behind it, at a contrast of 1.00:1.
 *
 * A tinted tile behind the icon used to hide most of that. With the icon drawn
 * plain there is nothing left to hide it, so the floor has to be real.
 *
 * Splitting the triplet into three custom properties lets the stylesheet raise
 * the lightness only under `.dark`, with `max()`, and leave the light theme
 * exactly as it was. Doing it in CSS rather than in JavaScript means no theme
 * has to be read during render and nothing repaints when the theme changes.
 */

export const DEFAULT_SPECIALTY_COLOR = "174 60% 40%";

export interface SpecialtyColorParts {
  h: string;
  s: string;
  l: string;
}

/**
 * Split "H S% L%" into its parts.
 *
 * Anything that is not three whitespace-separated components falls back to the
 * default rather than producing a broken `hsl()` that renders as black — a
 * stored value is only as good as whatever was typed into the admin panel.
 */
export function parseSpecialtyColor(stored: string | null | undefined): SpecialtyColorParts {
  const parts = (stored ?? "").trim().split(/\s+/);
  if (parts.length !== 3 || !parts.every(Boolean)) {
    const [h, s, l] = DEFAULT_SPECIALTY_COLOR.split(" ");
    return { h, s, l };
  }
  const [h, s, l] = parts;
  return { h, s, l };
}

/**
 * The inline custom properties for one specialty's icon.
 *
 * Pair with the `ds-spec-icon` class, which reads them and applies the dark
 * theme's lightness floor.
 */
export function specialtyColorVars(stored: string | null | undefined): React.CSSProperties {
  const { h, s, l } = parseSpecialtyColor(stored);
  return { "--spec-h": h, "--spec-s": s, "--spec-l": l } as React.CSSProperties;
}
