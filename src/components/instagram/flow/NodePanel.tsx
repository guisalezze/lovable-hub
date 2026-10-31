import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IGN, getOut, outs, type Flow, type FlowNode, type NodeType } from "@/lib/instagramFlow";
import { nodeSummary } from "./convert";
import { BlockFields } from "./BlockFields";
import { StartFields, type RuleMeta } from "./StartFields";

export const NEW_TYPES: Exclude<NodeType, "start">[] = ["message", "delay", "tag", "condition", "webhook"];
const END = "__end";

interface Props {
  node: FlowNode;
  flow: Flow;
  meta: RuleMeta;
  warnings: string[];
  onMeta: (patch: Partial<RuleMeta>) => void;
  onPatch: (id: string, fn: (n: FlowNode) => void) => void;
  /** value: id do destino, null (fim) ou "new:<tipo>" (criar bloco novo). */
  onSetOut: (id: string, key: string, value: string | null) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function NodePanel({ node, flow, meta, warnings, onMeta, onPatch, onSetOut, onDelete, onClose }: Props) {
  const info = IGN[node.type];
  const others = Object.values(flow.nodes).filter((n) => n.type !== "start" && n.id !== node.id);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2.5 border-b px-4 py-3">
        <div
          className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-base text-white"
          style={{ background: info.cor }}
        >
          {info.ico}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: info.cor }}>
            {info.label}
          </div>
          <div className="truncate text-sm font-medium">{nodeSummary(node)}</div>
        </div>
        {node.type !== "start" && (
          <Button type="button" variant="ghost" size="icon" title="Excluir bloco" onClick={() => onDelete(node.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" title="Fechar (Esc)" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
            {warnings.map((w) => (
              <div key={w}>⚠ {w}</div>
            ))}
          </div>
        )}

        {node.type === "start" ? (
          <StartFields key={node.id} meta={meta} onMeta={onMeta} />
        ) : (
          <BlockFields n={node} patch={(fn) => onPatch(node.id, fn)} ruleName={meta.name} />
        )}

        <div className="space-y-2 border-t pt-4">
          <Label className="text-sm font-semibold">Próximo passo</Label>
          {outs(node).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <Select
                value={getOut(node, key) && flow.nodes[getOut(node, key)!] ? getOut(node, key)! : END}
                onValueChange={(v) => onSetOut(node.id, key, v === END ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={END}>— fim do fluxo —</SelectItem>
                  {others.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Blocos existentes</SelectLabel>
                      {others.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {IGN[o.type].ico} {IGN[o.type].label} · {nodeSummary(o)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    <SelectLabel>Criar bloco novo</SelectLabel>
                    {NEW_TYPES.map((t) => (
                      <SelectItem key={t} value={`new:${t}`}>
                        ＋ {IGN[t].ico} {IGN[t].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
