import { useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
  Panel,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Zap, MessageSquare, Clock, GitBranch, ShieldCheck, ArrowRight, Upload, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WButton { id: string; text: string; }

export interface WMessage {
  type: "text" | "image" | "buttons";
  content: string;
  delay_ms: number;
  media_url?: string;
  buttons?: WButton[];
}

export type FNodeType = "trigger" | "message" | "delay" | "purchase_check";

export interface FNodeData extends Record<string, unknown> {
  label: string;
  // trigger
  event_type?: string;
  // message
  messages?: WMessage[];
  // delay
  delay_ms?: number;
  // purchase_check
  product_name?: string;
}

// ─── Shared node shell ────────────────────────────────────────────────────────

function NodeShell({
  selected, color, icon: Icon, title, children, hasInput = true, outputs = ["next"],
}: {
  selected: boolean; color: string; icon: any; title: string;
  children?: React.ReactNode; hasInput?: boolean; outputs?: string[];
}) {
  return (
    <div className={cn(
      "rounded-xl border-2 bg-background shadow-md min-w-[200px] max-w-[240px] text-xs",
      selected ? "border-primary shadow-primary/20 shadow-lg" : "border-border"
    )}>
      {hasInput && <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-2.5 !h-2.5 !border-2 !border-background" />}
      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-xl", color)}>
        <Icon className="h-3.5 w-3.5 text-white shrink-0" />
        <span className="text-xs font-semibold text-white truncate">{title}</span>
      </div>
      {children && <div className="px-3 py-2 space-y-1">{children}</div>}
      {outputs.length === 1 ? (
        <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-background" />
      ) : outputs.map((label, i) => (
        <Handle
          key={label}
          id={label}
          type="source"
          position={Position.Bottom}
          style={{ left: `${(i + 1) * 100 / (outputs.length + 1)}%` }}
          className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-background"
        >
          <span className="absolute top-3 text-[9px] text-muted-foreground whitespace-nowrap -translate-x-1/2 left-1/2 font-medium">
            {label}
          </span>
        </Handle>
      ))}
    </div>
  );
}

// ─── Trigger node ─────────────────────────────────────────────────────────────

const EVENTS: Record<string, string> = {
  all: "Todos os eventos", purchase_approved: "Compra Aprovada",
  purchase_refused: "Cartão Recusado", purchase_generated: "Pix / Boleto Gerado",
  purchase_canceled: "Compra Cancelada", purchase_refunded: "Reembolso",
  purchase_chargeback: "Chargeback", abandoned_cart: "Carrinho Abandonado",
  subscription_activated: "Assinatura Ativada", subscription_canceled: "Assinatura Cancelada",
};

function TriggerNode({ data, selected }: { data: FNodeData; selected: boolean }) {
  return (
    <NodeShell selected={selected} color="bg-emerald-500" icon={Zap} title="Gatilho" hasInput={false}>
      <p className="text-[10px] text-muted-foreground truncate">
        {EVENTS[data.event_type || "all"] || data.event_type || "Todos os eventos"}
      </p>
    </NodeShell>
  );
}

// ─── Message node ─────────────────────────────────────────────────────────────

function MessageNode({ data, selected }: { data: FNodeData; selected: boolean }) {
  const msgs = data.messages || [];
  return (
    <NodeShell selected={selected} color="bg-blue-500" icon={MessageSquare} title={data.label || "Mensagem"}>
      <p className="text-[10px] text-muted-foreground">{msgs.length} mensagem{msgs.length !== 1 ? "s" : ""}</p>
      {msgs[0]?.content && (
        <p className="text-[10px] truncate text-foreground/70">{msgs[0].content.slice(0, 40)}</p>
      )}
    </NodeShell>
  );
}

// ─── Delay node ───────────────────────────────────────────────────────────────

function msLabel(ms: number) {
  if (!ms) return "0s";
  if (ms < 60_000) return `${ms / 1000}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function DelayNode({ data, selected }: { data: FNodeData; selected: boolean }) {
  return (
    <NodeShell selected={selected} color="bg-amber-500" icon={Clock} title="Delay">
      <p className="text-[10px] text-muted-foreground">Aguardar {msLabel(data.delay_ms || 0)}</p>
    </NodeShell>
  );
}

// ─── Purchase check node ──────────────────────────────────────────────────────

function PurchaseCheckNode({ data, selected }: { data: FNodeData; selected: boolean }) {
  return (
    <NodeShell selected={selected} color="bg-violet-500" icon={ShieldCheck} title="Verificação de Compra" outputs={["Não comprou", "Já comprou"]}>
      <p className="text-[10px] text-muted-foreground truncate">
        Produto: <span className="text-foreground font-medium">{data.product_name || "—"}</span>
      </p>
    </NodeShell>
  );
}

// ─── Node types map ───────────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  delay: DelayNode,
  purchase_check: PurchaseCheckNode,
};

// ─── Node editor sidebar ──────────────────────────────────────────────────────

function genBtnId() { return "btn_" + Math.random().toString(36).slice(2, 10); }

function NodeEditor({
  node, onUpdate, onDelete,
}: {
  node: Node<FNodeData>; onUpdate: (id: string, data: Partial<FNodeData>) => void; onDelete: (id: string) => void;
}) {
  const d = node.data;
  const type = node.type as FNodeType;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editMsgIdx, setEditMsgIdx] = useState<number | null>(null);

  async function handleUpload(file: File, msgIdx: number) {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = (e) => res((e.target?.result as string).split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const result = await apiPost<{ url: string }>("/upload/automation-media", {
        filename: file.name, data: base64, contentType: file.type,
      });
      const msgs = [...(d.messages || [])];
      msgs[msgIdx] = { ...msgs[msgIdx], media_url: result.url };
      onUpdate(node.id, { messages: msgs });
      toast.success("Imagem enviada!");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  }

  function updateMsg(idx: number, patch: Partial<WMessage>) {
    const msgs = [...(d.messages || [])];
    msgs[idx] = { ...msgs[idx], ...patch } as WMessage;
    onUpdate(node.id, { messages: msgs });
  }

  function addMsg() {
    const msgs = [...(d.messages || []), { type: "text" as const, content: "", delay_ms: 1000 }];
    onUpdate(node.id, { messages: msgs });
    setEditMsgIdx(msgs.length - 1);
  }

  function delMsg(idx: number) {
    onUpdate(node.id, { messages: (d.messages || []).filter((_, i) => i !== idx) });
    if (editMsgIdx === idx) setEditMsgIdx(null);
  }

  const [delayVal, setDelayVal] = useState(() => {
    const ms = d.delay_ms || 0;
    if (ms >= 86_400_000) return ms / 86_400_000;
    if (ms >= 3_600_000) return ms / 3_600_000;
    if (ms >= 60_000) return ms / 60_000;
    return ms / 1000;
  });
  const [delayUnit, setDelayUnit] = useState<"s" | "min" | "h" | "dias">(() => {
    const ms = d.delay_ms || 0;
    if (ms >= 86_400_000) return "dias";
    if (ms >= 3_600_000) return "h";
    if (ms >= 60_000) return "min";
    return "s";
  });

  function applyDelay(val: number, unit: typeof delayUnit) {
    setDelayVal(val); setDelayUnit(unit);
    const mult = unit === "s" ? 1000 : unit === "min" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
    onUpdate(node.id, { delay_ms: Math.max(0, val) * mult });
  }

  return (
    <div className="w-72 border-l border-border bg-background flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold">Editar nó</span>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onDelete(node.id)}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">

        {/* Label (all nodes) */}
        <div className="space-y-1">
          <Label className="text-xs">Nome do nó</Label>
          <Input value={d.label} onChange={(e) => onUpdate(node.id, { label: e.target.value })} className="h-7 text-xs" />
        </div>

        {/* Trigger fields */}
        {type === "trigger" && (
          <div className="space-y-1">
            <Label className="text-xs">Evento</Label>
            <Select value={d.event_type || "all"} onValueChange={(v) => onUpdate(node.id, { event_type: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EVENTS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Delay fields */}
        {type === "delay" && (
          <div className="space-y-1">
            <Label className="text-xs">Duração</Label>
            <div className="flex gap-1.5">
              <Input type="number" min={0} value={delayVal}
                onChange={(e) => applyDelay(Number(e.target.value), delayUnit)}
                className="h-7 text-xs flex-1" />
              <Select value={delayUnit} onValueChange={(v) => applyDelay(delayVal, v as typeof delayUnit)}>
                <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="s">segundos</SelectItem>
                  <SelectItem value="min">minutos</SelectItem>
                  <SelectItem value="h">horas</SelectItem>
                  <SelectItem value="dias">dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Purchase check fields */}
        {type === "purchase_check" && (
          <div className="space-y-1">
            <Label className="text-xs">Nome do produto</Label>
            <Input
              value={d.product_name || ""}
              onChange={(e) => onUpdate(node.id, { product_name: e.target.value })}
              placeholder="Ex: Upsell VSL Premium"
              className="h-7 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              O sistema verifica se este contato já comprou este produto antes de continuar.
            </p>
          </div>
        )}

        {/* Message fields */}
        {type === "message" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Mensagens</Label>
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1 px-2" onClick={addMsg}>
                <Plus className="h-2.5 w-2.5" /> Adicionar
              </Button>
            </div>
            {(d.messages || []).map((msg, mi) => (
              <div key={mi} className="border border-border rounded p-2 space-y-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground w-4 shrink-0">{mi + 1}.</span>
                  <Select value={msg.type} onValueChange={(v) => {
                    const t = v as WMessage["type"];
                    updateMsg(mi, { type: t, buttons: t === "buttons" ? [{ id: genBtnId(), text: "" }] : undefined });
                  }}>
                    <SelectTrigger className="h-6 text-xs w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="image">Imagem</SelectItem>
                      <SelectItem value="buttons">Botões</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-[10px] text-muted-foreground">Delay:</span>
                    <Input type="number" min={0} value={msg.delay_ms / 1000}
                      onChange={(e) => updateMsg(mi, { delay_ms: Math.max(0, Number(e.target.value)) * 1000 })}
                      className="h-6 w-11 text-xs" />
                    <span className="text-[10px] text-muted-foreground">s</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => delMsg(mi)}>
                    <Trash2 className="h-2.5 w-2.5 text-destructive" />
                  </Button>
                </div>

                {msg.type === "image" && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <Input placeholder="URL ou upload →" value={msg.media_url || ""}
                        onChange={(e) => updateMsg(mi, { media_url: e.target.value })}
                        className="h-6 text-xs flex-1 font-mono" />
                      <Button size="sm" variant="outline" className="h-6 px-1.5"
                        disabled={uploading} onClick={() => { setEditMsgIdx(mi); fileRef.current?.click(); }}>
                        {uploading && editMsgIdx === mi ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Upload className="h-2.5 w-2.5" />}
                      </Button>
                    </div>
                    {msg.media_url && (
                      <img src={msg.media_url} alt="preview" className="h-14 rounded border object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    )}
                  </div>
                )}

                <Textarea
                  placeholder={msg.type === "buttons" ? "Texto do menu…" : "Conteúdo… {{nome}}, {{produto}}"}
                  value={msg.content}
                  onChange={(e) => updateMsg(mi, { content: e.target.value })}
                  className="text-xs min-h-[52px] resize-none"
                />

                {msg.type === "buttons" && (
                  <div className="space-y-1 pt-0.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Botões (máx. 3)</p>
                    {(msg.buttons || []).map((btn, bi) => (
                      <div key={btn.id} className="flex gap-1 items-center">
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                        <Input placeholder={`Botão ${bi + 1}`} value={btn.text}
                          onChange={(e) => {
                            const nb = [...(msg.buttons || [])]; nb[bi] = { ...btn, text: e.target.value };
                            updateMsg(mi, { buttons: nb });
                          }} className="h-6 text-xs flex-1" />
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                          disabled={(msg.buttons || []).length <= 1}
                          onClick={() => updateMsg(mi, { buttons: (msg.buttons || []).filter((_, i) => i !== bi) })}>
                          <X className="h-2.5 w-2.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                    {(msg.buttons || []).length < 3 && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground gap-1"
                        onClick={() => updateMsg(mi, { buttons: [...(msg.buttons || []), { id: genBtnId(), text: "" }] })}>
                        <Plus className="h-2.5 w-2.5" /> Botão
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(d.messages || []).length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">Nenhuma mensagem. Clique em Adicionar.</p>
            )}
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && editMsgIdx !== null) handleUpload(f, editMsgIdx); e.target.value = ""; }} />
    </div>
  );
}

// ─── FunilCanvas ──────────────────────────────────────────────────────────────

export interface FunilGraph {
  nodes: Node<FNodeData>[];
  edges: Edge[];
}

const DEFAULT_EDGE = { markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } };

let _nodeId = 1;
function newId() { return `n${Date.now()}_${_nodeId++}`; }

function makeNode(type: FNodeType, position: { x: number; y: number }): Node<FNodeData> {
  const base = { id: newId(), type, position, data: { label: "" } };
  switch (type) {
    case "trigger":      return { ...base, data: { label: "Gatilho", event_type: "purchase_approved" } };
    case "message":      return { ...base, data: { label: "Mensagem", messages: [{ type: "text", content: "", delay_ms: 1000 }] } };
    case "delay":        return { ...base, data: { label: "Delay", delay_ms: 3_600_000 } };
    case "purchase_check": return { ...base, data: { label: "Verificação de Compra", product_name: "" } };
  }
}

export function FunilCanvas({
  initialGraph, onChange,
}: {
  initialGraph: FunilGraph;
  onChange: (g: FunilGraph) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FNodeData>(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const [selectedNode, setSelectedNode] = useState<Node<FNodeData> | null>(null);

  const notify = useCallback((ns: Node<FNodeData>[], es: Edge[]) => {
    onChange({ nodes: ns, edges: es });
  }, [onChange]);

  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => {
      const next = addEdge({ ...conn, ...DEFAULT_EDGE }, eds);
      notify(nodes, next);
      return next;
    });
  }, [nodes, notify]);

  function addNode(type: FNodeType) {
    const n = makeNode(type, { x: 200 + Math.random() * 100, y: 100 + nodes.length * 120 });
    const next = [...nodes, n];
    setNodes(next);
    notify(next, edges);
    setSelectedNode(n);
  }

  function updateNodeData(id: string, patch: Partial<FNodeData>) {
    setNodes((ns) => {
      const next = ns.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n);
      notify(next, edges);
      return next;
    });
    setSelectedNode((prev) => prev?.id === id ? { ...prev, data: { ...prev.data, ...patch } } : prev);
  }

  function deleteNode(id: string) {
    const nextNodes = nodes.filter((n) => n.id !== id);
    const nextEdges = edges.filter((e) => e.source !== id && e.target !== id);
    setNodes(nextNodes); setEdges(nextEdges);
    notify(nextNodes, nextEdges);
    setSelectedNode(null);
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-1 h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges.map((e) => ({ ...e, ...DEFAULT_EDGE }))}
          onNodesChange={(changes) => {
            onNodesChange(changes);
            setTimeout(() => notify(nodes, edges), 0);
          }}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedNode(node as Node<FNodeData>)}
          onPaneClick={() => setSelectedNode(null)}
          fitView
          deleteKeyCode="Delete"
          className="bg-muted/30"
        >
          <Background gap={16} size={1} color="hsl(var(--border))" />
          <Controls />
          <MiniMap nodeColor={() => "hsl(var(--primary))"} className="!bg-background !border !border-border !rounded-lg" />
          <Panel position="top-left">
            <div className="flex flex-col gap-1.5 p-2 bg-background border border-border rounded-xl shadow-sm">
              <p className="text-[10px] font-semibold text-muted-foreground px-1">Adicionar nó</p>
              {([
                { type: "trigger" as FNodeType, label: "Gatilho", icon: Zap, color: "bg-emerald-500 hover:bg-emerald-600" },
                { type: "message" as FNodeType, label: "Mensagem", icon: MessageSquare, color: "bg-blue-500 hover:bg-blue-600" },
                { type: "delay" as FNodeType, label: "Delay", icon: Clock, color: "bg-amber-500 hover:bg-amber-600" },
                { type: "purchase_check" as FNodeType, label: "Verificar Compra", icon: ShieldCheck, color: "bg-violet-500 hover:bg-violet-600" },
              ] as const).map(({ type, label, icon: Icon, color }) => (
                <button
                  key={type}
                  onClick={() => addNode(type)}
                  className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-white text-xs font-medium transition-colors", color)}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {selectedNode && (
        <NodeEditor
          node={selectedNode}
          onUpdate={updateNodeData}
          onDelete={deleteNode}
        />
      )}
    </div>
  );
}
