import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PolicyLink } from "@/components/PolicyLink";
import { PortalShell, portalField, portalKicker, portalLabel } from "@/components/PortalShell";

/**
 * Getting in touch, in the same register as the door it is reached from.
 *
 * The redesigned sign-in page has no contact form on it — the design closes
 * its column with the access note and the policy links — so the footer's
 * "Contact us" leads here rather than the page carrying a second form.
 */
const Contact = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    try {
      const { error } = await supabase.functions.invoke("contact-form-email", {
        body: { name, email, message },
      });
      if (error) throw error;
      setSent(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send message. Please try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PortalShell
      footerLinks={
        <>
          <PolicyLink kind="privacy" className="text-accent-deep underline underline-offset-4" />
          <PolicyLink kind="terms" className="text-accent-deep underline underline-offset-4" />
          <Link to="/" className="text-accent-deep underline underline-offset-4">
            Back to sign in
          </Link>
        </>
      }
    >
      <div className="space-y-1.5">
        <span className={portalKicker}>Contact</span>
        <h2 className="font-display text-[clamp(26px,6.5vw,34px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
          Get in touch
        </h2>
        <p className="pt-1 text-pretty text-[14.5px] text-muted-foreground">
          A question about the hub, your account or a resource — this reaches the programme admin
          team.
        </p>
      </div>

      {sent ? (
        <div className="space-y-4 border-2 border-foreground p-6">
          <h3 className="font-display text-2xl font-extrabold tracking-tight">Message sent</h3>
          <p className="text-pretty text-sm text-muted-foreground">
            Check your inbox for a confirmation. We&apos;ll reply to the address you gave.
          </p>
          <Button variant="outline" onClick={() => setSent(false)} className="h-11 w-full">
            Send another
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-[18px]">
          <div className="space-y-2">
            <Label htmlFor="contact-name" className={portalLabel}>Your name</Label>
            <Input
              id="contact-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={portalField}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-email" className={portalLabel}>Email address</Label>
            <Input
              id="contact-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={portalField}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-message" className={portalLabel}>Message</Label>
            <Textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="resize-none px-3.5 py-2.5 text-base"
              required
            />
          </div>

          <Button
            type="submit"
            className="h-12 w-full justify-between text-[15px]"
            disabled={isSending}
          >
            {isSending ? "Sending…" : "Send message"}
            {!isSending && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>
      )}
    </PortalShell>
  );
};

export default Contact;
