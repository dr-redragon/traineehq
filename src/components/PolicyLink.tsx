import { PRIVACY_POLICY_URL, TERMS_URL, COOKIE_POLICY_URL } from "@/lib/legal";

/**
 * A policy link, or the words on their own.
 *
 * The policies are not published yet (see src/lib/legal.ts). An anchor with
 * href="#" looks live, scrolls the page to the top when clicked, and tells the
 * reader a document exists. Until a URL is set these render as plain text —
 * honest, and unmistakably not a link.
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
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {label}
    </a>
  );
}
