import { Link } from "react-router-dom";
import { PRIVACY_POLICY_URL, TERMS_URL, COOKIE_POLICY_URL } from "@/lib/legal";

/**
 * A policy link, or the words on their own.
 *
 * The policies are pages of this app (see src/lib/legal.ts), so this is a
 * router link rather than an anchor that opens a new tab. Should a URL ever be
 * blanked out again it renders as plain text: an anchor with href="#" looks
 * live and tells the reader a document exists.
 */
export function PolicyLink({
  kind, className,
}: {
  kind: "privacy" | "terms" | "cookies";
  className?: string;
}) {
  const href =
    kind === "privacy" ? PRIVACY_POLICY_URL
    : kind === "terms" ? TERMS_URL
    : COOKIE_POLICY_URL;

  const label =
    kind === "privacy" ? "Privacy Policy"
    : kind === "terms" ? "Terms of Use"
    : "Cookie Policy";

  if (!href) return <span className="opacity-70">{label}</span>;

  return (
    <Link to={href} className={className}>
      {label}
    </Link>
  );
}
