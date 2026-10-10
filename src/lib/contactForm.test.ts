import { describe, expect, it } from "vitest";

import { contactFormErrors, emptyContactValues } from "./contactForm";

const valid = {
  ...emptyContactValues,
  name: "Dr Priya Raghavan",
  role: "Training Programme Director",
  email: "priya.raghavan@nhs.net",
};

describe("contactFormErrors", () => {
  it("accepts a contact with a name, role and email", () => {
    expect(contactFormErrors(valid)).toEqual({});
  });

  it("does not ask for the optional fields", () => {
    expect(contactFormErrors({ ...valid, organisation: "", phone: "" })).toEqual({});
  });

  it("names each missing required field", () => {
    const errors = contactFormErrors(emptyContactValues);
    expect(Object.keys(errors).sort()).toEqual(["email", "name", "role"]);
  });

  it("treats whitespace as empty", () => {
    expect(contactFormErrors({ ...valid, name: "   " }).name).toBeDefined();
  });

  it("catches an email with no domain", () => {
    expect(contactFormErrors({ ...valid, email: "priya@" }).email).toMatch(/doesn't look like/);
    expect(contactFormErrors({ ...valid, email: " priya@nhs.net " }).email).toBeUndefined();
  });
});
