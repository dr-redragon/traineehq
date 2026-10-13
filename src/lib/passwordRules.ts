/**
 * What a new password has to be, in one place: the reset page, the profile
 * page and the admin "Set password" box all check against this list, so the
 * three can never disagree.
 */
export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "mix", label: "Contains letters and numbers", test: (p) => /[A-Za-z]/.test(p) && /\d/.test(p) },
];

export const passwordMeetsRules = (password: string) =>
  PASSWORD_RULES.every((rule) => rule.test(password));
