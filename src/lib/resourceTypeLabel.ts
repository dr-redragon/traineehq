/**
 * A resource type, abbreviated for a space too narrow for the full word.
 *
 * The dashboard's Recently Added widget shows the type as a small label
 * beside the file name. Most of the words already fit — "PDF", "LINK",
 * "VIDEO" — but "DOCUMENT" and "PRESENTATION" are long enough to force the
 * name they sit beside into a sliver on a phone. Only those get shortened;
 * everything else keeps its own word so the label still says what it means.
 */
const ABBREVIATIONS: Record<string, string> = {
  document: "Doc",
  presentation: "Slides",
  checklist: "List",
};

export function abbreviatedResourceType(resourceType: string): string {
  return (ABBREVIATIONS[resourceType] ?? resourceType).toUpperCase();
}
