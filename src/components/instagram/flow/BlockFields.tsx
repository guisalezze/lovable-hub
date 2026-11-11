import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FOLLOW_DEFAULT_BUTTON,
  MAX_FOLLOW_BUTTON,
  MAX_FOLLOW_TEXT,
  type FlowNode,
} from "@/lib/instagramFlow";

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

/** Cliques por botão de link deste fluxo: chave `${node_id}:${button_index}`. */
function useClickTotals(ruleId: string) {
  return useQuery({
    queryKey: ["ig_link_click_totals", ruleId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ig_link_click_totals")
        .select("node_id,button_index,clicks")
        .eq("rule_id", ruleId);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of data ?? []) m[`${r.node_id}:${r.button_index}`] = (m[`${r.node_id}:${r.button_index}`] ?? 0) + (r.clicks ?? 0);
      return m;
    },
  }).data ?? {};
}

function MinutesInput({ value, onCommit }: { value: number; onCommit: (m: number) => void }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  return (
    <Input
      type="number"
      min={1}
      max={60}
      className="h-8 w-20"
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const m = txt.trim() === "" ? 5 : Math.min(60, Math.max(1, Math.round(Number(txt)) || 1));
        setTxt(String(m));
        onCommit(m);
      }}
    />
  );
}

export function BlockFields({
  n,
  patch,
  ruleName,
  ruleId,
}: {
  n: FlowNode;
  patch: Patch;
  ruleName: string;
  ruleId: string;
}) {
  const clicks = useClickTotals(ruleId);
  if (n.type === "follow") {
    const text = n.text ?? "";
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Pedido para seguir</Label>
          <Textarea
            rows={5}
            maxLength={MAX_FOLLOW_TEXT}
            value={text}
            onChange={(e) => patch((x) => void (x.text = e.target.value))}
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              Use {"{nome}"} (1º nome) e {"{usuario}"} (@ da pessoa).
            </span>
            <span>
              {text.length}/{MAX_FOLLOW_TEXT}
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Texto do botão</Label>
          <Input
            value={n.button ?? ""}
            maxLength={MAX_FOLLOW_BUTTON}
            placeholder={FOLLOW_DEFAULT_BUTTON}
            onChange={(e) => patch((x) => void (x.button = e.target.value))}
          />
        </div>
        <p className="rounded-lg border bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
          A Meta só informa se a pessoa segue depois que ela toca no botão.
        </p>
      </div>
    );
  }
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
                  onClick={() =>
                    patch((x) => {
                      x.buttons!.splice(i, 1);
                      const rf = x.read_fallback;
                      if (rf) {
                        if (rf.button === i) delete x.read_fallback;
                        else if (rf.button > i) rf.button -= 1;
                      }
                    })
                  }
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
                    if (v === "url") {
                      delete bt.next;
                      bt.track ??= true;
                      if (x.read_fallback?.button === i) delete x.read_fallback;
                    } else {
                      delete bt.url;
                      delete bt.track;
                    }
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
              {b.type === "url" && (
                <div className="flex items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <Switch
                      checked={b.track !== false}
                      onCheckedChange={(v) => patch((x) => void (x.buttons![i].track = v))}
                    />
                    Rastrear cliques
                  </label>
                  {b.track !== false && (
                    <span className="text-[11px] text-muted-foreground">
                      {clicks[`${n.id}:${i}`] ?? 0} cliques
                    </span>
                  )}
                </div>
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
        {(!!n.read_fallback || buttons.some((b) => b.type !== "url" && b.label?.trim())) && (
          <div className="space-y-2 rounded-lg border p-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch
                checked={!!n.read_fallback}
                onCheckedChange={(v) =>
                  patch((x) => {
                    if (!v) return void delete x.read_fallback;
                    const first = (x.buttons ?? []).findIndex((b) => b.type !== "url" && b.label?.trim());
                    x.read_fallback = { minutes: 5, button: Math.max(first, 0) };
                  })
                }
              />
              Se a pessoa ler e não tocar…
            </label>
            {n.read_fallback && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span>em</span>
                  <MinutesInput
                    value={n.read_fallback.minutes}
                    onCommit={(m) => patch((x) => void (x.read_fallback && (x.read_fallback.minutes = m)))}
                  />
                  <span>min, seguir pelo botão</span>
                </div>
                <Select
                  value={String(n.read_fallback.button)}
                  onValueChange={(v) => patch((x) => void (x.read_fallback && (x.read_fallback.button = Number(v))))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {buttons.map((b, i) =>
                      b.type !== "url" && b.label?.trim() ? (
                        <SelectItem key={i} value={String(i)}>
                          🔘 {b.label}
                        </SelectItem>
                      ) : null,
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
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
            onChange={(e) => patch((x) => void (x.amount = Math.max(1, Number(e.target.value) || 0)))}
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
