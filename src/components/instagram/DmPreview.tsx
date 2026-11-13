import type { ReactNode } from "react";
import { ExternalLink, Instagram } from "lucide-react";
import type { CampaignForm } from "@/lib/instagramCampaign";

const SAMPLE_USER = "maria.silva";

// {link} some do texto: com links vira botão; sem links fica vazio.
const fill = (text: string) =>
  text
    .replace(/\{username\}/g, SAMPLE_USER)
    .replace(/\{link\}/g, "")
    .trim();

function Step({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-center text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Bubble({ text, buttons }: { text: string; buttons?: { title: string; url?: boolean }[] }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] overflow-hidden rounded-2xl rounded-br-md bg-[#3797f0] text-white">
        <p className="px-3 py-2 text-sm whitespace-pre-wrap break-words">
          {text || <span className="italic opacity-70">(mensagem vazia)</span>}
        </p>
        {buttons && buttons.length > 0 && (
          <div className="divide-y divide-white/20 border-t border-white/20 bg-white/10">
            {buttons.map((b, i) => (
              <div key={i} className="flex items-center justify-center gap-1 px-3 py-2 text-sm font-semibold">
                {b.title || "Botão"}
                {b.url && <ExternalLink className="h-3 w-3" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Incoming({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm">{text}</div>
    </div>
  );
}

/** Prévia do DM no estilo do Instagram (balões). */
export default function DmPreview({ form }: { form: CampaignForm }) {
  const links = [
    { url: form.link1_url.trim(), label: form.link1_label.trim() },
    { url: form.link2_url.trim(), label: form.link2_label.trim() },
  ].filter((l) => l.url);
  const firstKw = form.match_any ? "Amei!" : form.keywords[0] || "palavra";
  const publicReply = form.public_replies.find((p) => p.trim());

  return (
    <div className="rounded-2xl border border-border bg-background shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
          <div className="h-full w-full rounded-full bg-background flex items-center justify-center">
            <Instagram className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{SAMPLE_USER}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Prévia do direct</p>
        </div>
      </div>

      <div className="space-y-4 p-3 max-h-[70vh] overflow-y-auto">
        <Step label={form.dm_trigger ? "Comentário, DM ou story" : "Comentário no post"}>
          <Incoming text={firstKw} />
          {form.public_reply_enabled && publicReply && (
            <p className="rounded-lg bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Resposta pública:</span> {fill(publicReply)}
            </p>
          )}
        </Step>

        {form.opening_enabled && (
          <Step label="DM de abertura">
            <Bubble text={fill(form.opening_message)} buttons={[{ title: form.opening_button }]} />
          </Step>
        )}

        {form.require_follow && (
          <Step label="Se ainda não segue">
            <Bubble text={fill(form.follow_message)} buttons={[{ title: form.follow_button }]} />
          </Step>
        )}

        <Step label="Mensagem final">
          <Bubble
            text={fill(form.dm_message)}
            buttons={links.map((l) => ({ title: l.label || "Abrir link", url: true }))}
          />
        </Step>

        {form.followup_enabled && (
          <Step
            label={`Follow-up após ${form.followup_delay_min >= 60 && form.followup_delay_min % 60 === 0 ? `${form.followup_delay_min / 60} h` : `${form.followup_delay_min} min`}`}
          >
            <Bubble text={fill(form.followup_message)} />
          </Step>
        )}
      </div>
    </div>
  );
}
