import { useEffect } from "react";

/** The class `.register-theme` in index.css hangs off. */
const CLASS = "register-theme";

/**
 * Dress the document in the teaching register's palette for as long as a
 * register page is on screen.
 *
 * It goes on <html> rather than on a wrapper element because Radix renders
 * dialogs, dropdowns, selects and toasts through a portal at the end of
 * <body>. Scoped to a wrapper, every menu and every toast would have stayed
 * TraineeHQ blue while the page behind it was green.
 *
 * next-themes puts `dark` on that same element, so the two compose: light and
 * dark register palettes are `.register-theme` and `.register-theme.dark`.
 */
export function useRegisterTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(CLASS);
    return () => root.classList.remove(CLASS);
  }, []);
}
