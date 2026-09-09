import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Award, ImageOff, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  certificateFilename, renderCertificatePdf,
} from "@/lib/register/certificate";
import {
  LOGO_MIME_TYPES, REGISTER_LOGO_BUCKET, registerLogoPath, registerLogoUrl, rejectLogo,
} from "@/lib/register/logo";
import type { RegisterDirectoryEntry } from "@/lib/register/types";

/**
 * The register's certificate badge.
 *
 * The original register had one logo for one programme, taken from an
 * environment variable. With many registers that belongs to the register and to
 * the people who run it — an editor records attendance, an owner decides what
 * the register puts its name to, so this is owners only. Storage enforces the
 * same rule; this only decides what to show.
 *
 * Going without is a real choice rather than an unfinished state, so it is
 * offered plainly and the certificate closes the space up rather than leaving
 * a hole where a badge would have been.
 */
export function CertificateLogoPanel({ register }: { register: RegisterDirectoryEntry }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState(false);

  const logoUrl = registerLogoUrl(register.certificate_logo_path);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const refusal = rejectLogo(file);
      if (refusal) throw new Error(refusal);

      const previous = register.certificate_logo_path;
      const path = registerLogoPath(register.id, file.name);

      const { error: uploadError } = await supabase.storage
        .from(REGISTER_LOGO_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      // Point the register at the new badge before removing the old one, so a
      // failure here leaves the register showing something rather than nothing.
      const { error: updateError } = await supabase
        .from("registers")
        .update({ certificate_logo_path: path })
        .eq("id", register.id);
      if (updateError) {
        await supabase.storage.from(REGISTER_LOGO_BUCKET).remove([path]);
        throw new Error(updateError.message);
      }

      if (previous) {
        // Tidying up: a failure here costs an orphaned file, not the upload.
        await supabase.storage.from(REGISTER_LOGO_BUCKET).remove([previous]);
      }
    },
    onSuccess: () => {
      toast.success("Logo updated. It appears on certificates from now on.");
      queryClient.invalidateQueries({ queryKey: ["register-directory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () => {
      const previous = register.certificate_logo_path;
      const { error } = await supabase
        .from("registers")
        .update({ certificate_logo_path: null })
        .eq("id", register.id);
      if (error) throw new Error(error.message);
      if (previous) {
        await supabase.storage.from(REGISTER_LOGO_BUCKET).remove([previous]);
      }
    },
    onSuccess: () => {
      toast.success("Logo removed. Certificates close the space up.");
      queryClient.invalidateQueries({ queryKey: ["register-directory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** A certificate with today's settings, so the choice can be seen not guessed. */
  const preview = async () => {
    setPreviewing(true);
    try {
      const details = {
        traineeName: "A. Trainee",
        registerName: register.name,
        deaneryName: register.deanery_name,
        sessionTitle: "Example teaching session",
        sessionDate: new Date().toISOString().slice(0, 10),
        location: null,
        logoUrl,
      };
      const bytes = await renderCertificatePdf(details);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = certificateFilename(details);
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not make the preview");
    } finally {
      setPreviewing(false);
    }
  };

  const busy = upload.isPending || clear.isPending;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Certificate logo</h2>
      <Card>
        <CardContent className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Printed at the top of every certificate this register issues. Without one,
            the certificate closes the space up rather than leaving a gap — both are
            finished designs, so use a logo only if you have one worth printing.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-md border bg-muted/30 p-2">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${register.name} certificate logo`}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                  <ImageOff className="h-5 w-5" />
                  No logo
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept={LOGO_MIME_TYPES.join(",")}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Cleared straight away so choosing the same file twice, after
                  // a failure, still fires a change event.
                  e.target.value = "";
                  if (file) upload.mutate(file);
                }}
              />
              <Button
                size="sm" variant="outline" className="gap-1.5"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {upload.isPending ? "Uploading…" : logoUrl ? "Replace" : "Upload a logo"}
              </Button>

              {logoUrl && (
                <Button
                  size="sm" variant="ghost" className="gap-1.5 text-muted-foreground"
                  disabled={busy}
                  onClick={() => clear.mutate()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {clear.isPending ? "Removing…" : "Go without"}
                </Button>
              )}

              <Button
                size="sm" variant="ghost" className="gap-1.5"
                disabled={previewing}
                onClick={preview}
              >
                <Award className="h-3.5 w-3.5" />
                {previewing ? "Making…" : "Preview a certificate"}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            PNG or JPEG, up to 2 MB — those are the two formats a PDF certificate can
            embed. It is scaled to fit 170×78 points, so a wide badge works better than
            a tall one.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
