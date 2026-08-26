import { useState } from "react";
import { Mail, Send, User, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ContactFormProps {
  compact?: boolean;
}

const ContactForm = ({ compact = false }: ContactFormProps) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("contact-form-email", {
        body: { name, email, message },
      });

      if (error) throw error;

      toast.success("Message sent! Check your inbox for a confirmation.");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  if (compact) {
    return (
      <div className="w-full max-w-sm mx-auto text-center">
        <p className="text-xs text-muted-foreground mb-3">Have a question? Get in touch.</p>
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-xs"
              required
            />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-8 text-xs"
              required
            />
          </div>
          <Textarea
            placeholder="Your message…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[60px] text-xs resize-none"
            required
          />
          <Button type="submit" size="sm" variant="outline" className="w-full h-8 text-xs" disabled={isSending}>
            {isSending ? "Sending…" : "Send"}
            {!isSending && <Send className="h-3 w-3 ml-1" />}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <section className="border-t bg-secondary/30">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="max-w-sm mx-auto text-center">
          <h2 className="text-lg font-display font-bold mb-1">Get in Touch</h2>
          <p className="text-xs text-muted-foreground mb-6">
            Have a question or suggestion? Send us a message.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-8 h-9 text-sm"
                  required
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-8 h-9 text-sm"
                  required
                />
              </div>
            </div>
            <div className="relative">
              <MessageSquare className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Textarea
                placeholder="How can we help?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="pl-8 min-h-[80px] text-sm resize-none"
                required
              />
            </div>
            <Button type="submit" size="sm" className="w-full" disabled={isSending}>
              {isSending ? "Sending…" : "Send Message"}
              {!isSending && <Send className="h-3.5 w-3.5" />}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default ContactForm;
