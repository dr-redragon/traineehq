import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "./ThemeToggle";

function renderToggle(defaultTheme = "system") {
  return render(
    <ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem>
      <ThemeToggle />
    </ThemeProvider>
  );
}

/** The trigger names the current choice, so it doubles as a readout. */
const trigger = () => screen.getByRole("button", { name: /change theme/i });

/*
 * Opening the menu itself is not tested here, deliberately.
 *
 * It can be: pointer-press events plus the pointer-capture stubs now in
 * src/test/setup.ts do open it, and the three items render. But mounting a
 * Radix portal under jsdom takes fifteen to twenty seconds in CI, so the two
 * tests that did it cost about forty seconds on a suite that otherwise runs in
 * three and a half — to assert that a dropdown shows the items handed to it,
 * which is Radix's behaviour rather than this component's.
 *
 * What is this component's is below: reading the stored choice, putting the
 * class Tailwind reads onto the document, and keeping "chosen" and "resolved"
 * apart under system. Clicking through the menu is covered by the manual check
 * in the runbook's Phase 4.
 */

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("starts on the stored choice rather than guessing", async () => {
    localStorage.setItem("theme", "dark");
    renderToggle();
    await waitFor(() => expect(trigger()).toHaveAccessibleName(/currently dark/i));
  });

  it("puts the class Tailwind reads onto the document", async () => {
    localStorage.setItem("theme", "dark");
    renderToggle();
    // darkMode: ["class"] in tailwind.config.ts keys off exactly this.
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  });

  it("treats system as a choice of its own, not just a starting value", async () => {
    localStorage.setItem("theme", "system");
    renderToggle();
    await waitFor(() => expect(trigger()).toHaveAccessibleName(/currently system/i));
    // matchMedia is stubbed to `matches: false` in src/test/setup.ts, so the
    // resolved theme under "system" is light — the choice and the result differ,
    // which is the case the component has to keep straight.
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
