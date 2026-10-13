import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PasswordChecklist } from "./PasswordChecklist";
import { passwordMeetsRules } from "@/lib/passwordRules";

const item = (text: string | RegExp) => screen.getByText(text).closest("li")!;

describe("passwordMeetsRules", () => {
  it.each([
    ["abc12345", true],
    ["abcdefgh", false],   // no number
    ["12345678", false],   // no letter
    ["abc1234", false],    // too short
  ])("%s → %s", (pw, ok) => expect(passwordMeetsRules(pw)).toBe(ok));
});

describe("PasswordChecklist", () => {
  it("is neutral before anything is typed", () => {
    render(<PasswordChecklist password="" confirm="" />);
    expect(item("At least 8 characters")).toHaveClass("text-muted-foreground");
    expect(item("Confirm your password")).toHaveClass("text-muted-foreground");
  });

  it("ticks what is met and crosses what is not", () => {
    render(<PasswordChecklist password="abcdefgh" confirm="abcdefgx" />);
    expect(item("At least 8 characters")).toHaveClass("text-success");
    expect(item("Contains letters and numbers")).toHaveClass("text-red-700");
    expect(item("Passwords do not match")).toHaveClass("text-red-700");
  });

  it("says when the passwords match", () => {
    render(<PasswordChecklist password="abc12345" confirm="abc12345" />);
    expect(item("Passwords match")).toHaveClass("text-success");
  });
});
