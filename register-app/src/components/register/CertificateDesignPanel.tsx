import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  CERTIFICATE_TEMPLATES, certificateFilename, designToStore, DESIGN_TEXT_MAX, normaliseDesign,
  renderCertificatePdf, type CertificateDesign,
} from "@/lib/register/certificate";
import { registerLogoUrl } from "@/lib/register/logo";
import { saveFile } from "@/lib/saveFile";
import { cn } from "@/lib/utils";
import type { RegisterDirectoryEntry } from "@/lib/register/types";

const rgbCss = (c: readonly [number, number, number]) =>
  `rgb(${c.map((v) => Math.round(v * 255)).join(" ")})`;

/** A thumbnail of a template: its paper, frame and colours, not its wording. */
function TemplateSwatch({ id, accent }: { id: CertificateDesign["template"]; accent: string | null }) {
  const t = CERTIFICATE_TEMPLATES.find((x) => x.id === id)!;
  const primary = accent && id !== "mono" ? accent : rgbCss(t.primary);
  const rule = t.rule ? rgbCss(t.rule) : primary;
  return (
    <div className="relative aspect-[842/595] w-full border border-border" style={{ background: rgbCss(t.paper) }}>
      {t.frame === "band" ? (
        <div className="absolute inset-x-0 top-0 h-[9%]" style={{ background: primary }} />
      ) : (
        <div className="absolute inset-[6%]"
          style={{ border: `${t.frame === "double" ? 2 : 1}px solid ${t.frame === "double" ? primary : rule}` }} />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[7%]">
        <div className="h-[9%] w-[46%]" style={{ background: primary }} />
        <div className="h-px w-[22%]" style={{ background: rule }} />
        <div className="h-[7%] w-[34%]" style={{ background: rgbCss(t.ink) }} />
        <div className="h-[4%] w-[40%]" style={{ background: rgbCss(t.muted), opacity: 0.6 }} />
      </div>
    </div>
  );
}

const FIELDS: { key: keyof CertificateDesign & string; label: string; placeholder: string }[] = [
  { key: "heading", label: "Title", placeholder: "Certificate of Attendance" },
  { key: "lead", label: "Line above the name", placeholder: "This is to certify that" },
  { key: "statement", label: "Line below the name", placeholder: "attended the teaching session" },
  { key: "issuedBy", label: "Footer", placeholder: "Issued by (the register's name)" },
  { key: "signatoryName", label: "Signed off by", placeholder: "Dr A. Example" },
  { key: "signatoryTitle", label: "Their role", placeholder: "Training Programme Director" },
];

/**
 * The look and wording of this register's certificates: pick a template, then
 * change its colour and any of its words. Owners only — it is what the
 * register signs its name with.
 *
 * Nothing here is drawn as typed. `normaliseDesign` checks the template and
 * colour and folds the wording to what the PDF font can print, both before it
 * is stored and again every time a certificate is drawn from it.
 */
export function CertificateDesignPanel({ register }: { register: RegisterDirectoryEntry }) {
  const queryClient = useQueryClient();
  const stored = JSON.stringify(designToStore(normaliseDesign(register.certificate_design)));
  const [design, setDesign] = useState<CertificateDesign>(() => normaliseDesign(register.certificate_design));
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => setDesign(normaliseDesign(JSON.parse(stored))), [stored]);

  const dirty = JSON.stringify(designToStore(design)) !== stored;
  const set = <K extends keyof CertificateDesign>(key: K, value: CertificateDesign[K]) =>
    setDesign((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("registers")
        .update({ certificate_design: designToStore(design) }).eq("id", register.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Certificate design saved. It applies to certificates issued from now on.");
      queryClient.invalidateQueries({ queryKey: ["register-directory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** A certificate in the design on screen, saved or not. */
  const preview = async () => {
    setPreviewing(true);
    try {
      const details = {
        traineeName: "A. Attendee",
        registerName: register.name,
        deaneryName: register.organisation ?? "",
        sessionTitle: "Example session",
        sessionDate: new Date().toISOString().slice(0, 10),
        location: null,
        logoUrl: registerLogoUrl(register.certificate_logo_path),
        design,
      };
      await saveFile(await renderCertificatePdf(details), certificateFilename(details), "application/pdf");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not make the preview");
    } finally {
      setPreviewing(false);
    }
  };

  const mono = design.template === "mono";

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Certificate design</h2>
      <Card>
        <CardContent className="space-y-6 p-4">
          <div role="radiogroup" aria-label="Certificate template" className="grid gap-3 sm:grid-cols-3">
            {CERTIFICATE_TEMPLATES.map((t) => {
              const selected = design.template === t.id;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={selected}
                  onClick={() => set("template", t.id)}
                  className={cn(
                    "space-y-2 border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-foreground bg-accent" : "border-border hover:border-foreground/50",
                  )}>
                  <TemplateSwatch id={t.id} accent={design.accent} />
                  <p className="font-display text-sm font-extrabold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cert-accent">Colour</Label>
              <input id="cert-accent" type="color" disabled={mono}
                className="block h-10 w-16 cursor-pointer border border-input bg-background p-1 disabled:cursor-not-allowed disabled:opacity-40"
                value={design.accent ?? "#2c4d39"}
                onChange={(e) => set("accent", e.target.value)} />
            </div>
            <Button type="button" variant="outline" size="sm" disabled={!design.accent}
              onClick={() => set("accent", null)}>
              Use the template's colour
            </Button>
            {mono && <p className="text-xs text-muted-foreground">Black and white has no colour to change.</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`cert-${f.key}`} className="text-xs">{f.label}</Label>
                <Input id={`cert-${f.key}`} maxLength={DESIGN_TEXT_MAX} placeholder={f.placeholder}
                  value={(design[f.key] as string) ?? ""}
                  onChange={(e) => set(f.key as "heading", e.target.value)} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Leave a box empty to keep the template's own wording. The attendee's name, the
            session and its date are filled in for each certificate.
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={preview} disabled={previewing}>
              <Award className="mr-1.5 h-3.5 w-3.5" /> {previewing ? "Drawing…" : "Preview"}
            </Button>
            <Button type="button" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? "Saving…" : "Save design"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
