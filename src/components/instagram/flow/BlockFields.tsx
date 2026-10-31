import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FlowNode } from "@/lib/instagramFlow";

type Patch = (fn: (n: FlowNode) => void) => void;

export function TagInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const { data: counts = {} } = useQuery({
    queryKey: ["ig_contact_tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ig_contacts").select("tags").limit(5000);
      if (error) throw error;
      const c: Record<string, number> = {};
      for (const r of data ?? []) for (const t of r.tags ?? []) c[t] = (c[t] ?? 0) + 1;
      return c;
    },
  });
  const list = `ig-tags-${id}`;
  return (
    <>
      <Input
        list={list}
        value={value}
        placeholder="ex.: quer-triade"
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        onBlur={(e) => onChange(e.target.value.trim().toLowerCase())}
      />
      <datalist id={list}>
        {Object.keys(counts)
          .sort()
          .map((t) => (
            <option key={t} value={t} />
          ))}
      </datalist>
    </>
  );
}

function WebhookTest({ url, ruleName }: { url: string; ruleName: string }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-admin", {
        body: { action: "webhook_test", url: url.trim(), rule_name: ruleName },
      });
      if (error) throw error;
      if (data?.error) toast.error(data.error);
      else if (data?.ok) toast.success(`Webhook respondeu ${data.status}`);
      else toast.error(`Falhou${data?.status ? ` (HTTP ${data.status})` : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" disabled={busy || !/^https?:\/\//i.test(url.trim())} onClick={run}>
      {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
      Enviar teste
    </Button>
  );
}

export function BlockFields({ n, patch, ruleName }: { n: FlowNode; patch: Patch; ruleName: string }) {
  if (n.type === "message") {
    const text = n.text ?? "";
    const buttons = n.buttons ?? [];
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Texto</Label>
          <Textarea rows={6} maxLength={640} value={text} onChange={(e) => patch((x) => void (x.text = e.target.value))} />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              Use {"{nome}"} (1º nome) e {"{usuario}"} (@ da pessoa).
            </span>
            <span>{text.length}/640</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Imagem (URL, opcional)</Label>
          <Input value={n.image ?? ""} placeholder="https://..." onChange={(e) => patch((x) => void (x.image = e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Botões (até 3)</Label>
          {buttons.map((b, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-2.5">
              <div className="flex gap-2">
                <Input
                  value={b.label}
                  maxLength={20}
                  placeholder="Texto do botão"
                  onChange={(e) => patch((x) => void (x.buttons![i].label = e.target.value))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => patch((x) => void x.buttons!.splice(i, 1))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Select
                value={b.type}
                onValueChange={(v) =>
                  patch((x) => {
                    const bt = x.buttons![i];
                    bt.type = v as "flow" | "url";
                    if (v === "url") delete bt.next;
                    else delete bt.url;
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flow">Continua o fluxo</SelectItem>
                  <SelectItem value="url">Abre um link</SelectItem>
                </SelectContent>
              </Select>
              {b.type === "url" && (
                <Input
                  value={b.url ?? ""}
                  placeholder="https://..."
                  onChange={(e) => patch((x) => void (x.buttons![i].url = e.target.value))}
                />
              )}
            </div>
          ))}
          {buttons.length < 3 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch((x) => void (x.buttons = [...(x.buttons ?? []), { label: "", type: "flow", next: null }]))}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Botão
            </Button>
          )}
        </div>
      </div>
    );
  }
  if (n.type === "delay") {
    return (
      <div className="space-y-1.5">
        <Label>Esperar</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            value={n.amount ?? 1}
            onChange={(e) => patch((x) => void (x.amount = Math.max(0, Number(e.target.value) || 0)))}
          />
          <Select value={n.unit ?? "h"} onValueChange={(v) => patch((x) => void (x.unit = v as "min" | "h" | "d"))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="min">minuto(s)</SelectItem>
              <SelectItem value="h">hora(s)</SelectItem>
              <SelectItem value="d">dia(s)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A Meta só deixa mandar direct até 24h depois da última mensagem da pessoa. Prefira esperas de até 23h.
        </p>
      </div>
    );
  }
  if (n.type === "tag") {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Ação</Label>
          <Select value={n.action ?? "add"} onValueChange={(v) => patch((x) => void (x.action = v as "add" | "remove"))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="add">Adicionar tag</SelectItem>
              <SelectItem value="remove">Remover tag</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tag</Label>
          <TagInput id={n.id} value={n.tag ?? ""} onChange={(v) => patch((x) => void (x.tag = v))} />
        </div>
      </div>
    );
  }
  if (n.type === "condition") {
    return (
      <div className="space-y-1.5">
        <Label>A pessoa tem a tag…</Label>
        <TagInput id={n.id} value={n.tag ?? ""} onChange={(v) => patch((x) => void (x.tag = v))} />
      </div>
    );
  }
  if (n.type === "webhook") {
    return (
      <div className="space-y-2">
        <Label>URL do webhook</Label>
        <Input value={n.url ?? ""} placeholder="https://..." onChange={(e) => patch((x) => void (x.url = e.target.value))} />
        <WebhookTest url={n.url ?? ""} ruleName={ruleName} />
      </div>
    );
  }
  return null;
}
