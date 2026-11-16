import { newId } from "./blob";
import type { RegisterSession } from "./types";

export interface TeachingDayDraft {
  title: string;
  date: string;
  location: string;
}

/** A teaching day from what was typed. The month always follows the date. */
export function sessionFromDraft(draft: TeachingDayDraft, existing?: RegisterSession): RegisterSession {
  return {
    ...(existing ?? {}),
    id: existing?.id ?? newId(),
    title: draft.title.trim(),
    date: draft.date,
    month: draft.date.slice(0, 7),
    location: draft.location.trim(),
  };
}
