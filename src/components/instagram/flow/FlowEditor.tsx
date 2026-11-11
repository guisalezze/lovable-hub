import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Loader2, Save, Workflow } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  IGN,
  MAX_NAME,
  getOut,
  newFlow,
  nodeWarnings,
  outs,
  setOut,
  validateRule,
  type Flow,
  type FlowNode,
  type IgRule,
  type NodeType,
} from "@/lib/instagramFlow";
import {
  addNodeLinked,
  autoLayout,
  flowToEdges,
  flowToRf,
  freeSpotRightOf,
  removeNode,
  rfToFlow,
  type IgRFNode,
} from "./convert";
import { FlowCtx, FlowNodeCard, type FlowCtxValue } from "./FlowNodeCard";
import { NEW_TYPES, NodePanel } from "./NodePanel";
import type { RuleMeta } from "./StartFields";

const nodeTypes = { ig: FlowNodeCard };
type NewType = Exclude<NodeType, "start">;

const payloadOf = (meta: RuleMeta, flow: Flow) =>
  JSON.stringify({
    name: meta.name,
    active: meta.active,
    trigger: meta.trigger,
    keywords: meta.keywords,
    match_type: meta.match_type,
    post_id: meta.post_id,
    media_label: meta.media_label,
    public_replies: meta.public_replies,
    pending_next_reel: meta.pending_next_reel,
    next_reel_since: meta.next_reel_since,
    flow,
  });

/** Quando uma mensagem passa de saída única (next) para saídas de botão, move o next antigo para o 1º botão livre. */
function fixOuts(before: FlowNode, after: FlowNode) {
  const was = outs(before).map(([k]) => k);
  const now = outs(after).map(([k]) => k);
  if (after.type !== "message" || was.join() !== "next" || now.join() === "next") return;
  const first = after.buttons?.[+now[0][1]];
  if (first && !first.next && before.next) first.next = before.next;
  after.next = null;
}

/** Aplica um flow novo sobre os nós atuais, preservando medidas/seleção dos que continuam. */
function rebuild(ns: IgRFNode[], flow: Flow, selectId?: string): IgRFNode[] {
  const old = new Map(ns.map((r) => [r.id, r]));
  const fresh = new Map(flowToRf(flow).map((r) => [r.id, r]));
  return Object.keys(flow.nodes).map((id) => {
    const f = fresh.get(id)!;
    const e = old.get(id);
    const selected = selectId ? id === selectId : e?.selected;
    return e ? { ...e, position: f.position, data: f.data, selected } : { ...f, selected };
  });
}

export default function FlowEditor({ rule }: { rule: IgRule }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [meta, setMeta] = useState<RuleMeta>(() => ({
    name: rule.name ?? "",
    active: !!rule.active,
    trigger: rule.trigger || "comment",
    keywords: rule.keywords ?? [],
    match_type: rule.match_type === "exact" ? "exact" : "contains",
    post_id: rule.post_id ?? null,
    media_label: rule.media_label ?? null,
    public_replies: rule.public_replies ?? [],
    pending_next_reel: !!rule.pending_next_reel,
    next_reel_since: rule.next_reel_since ?? null,
  }));
  const [nodes, setNodes] = useState<IgRFNode[]>(() => {
    const flow = rule.flow?.nodes?.start ? rule.flow : newFlow();
    return flowToRf(flow).map((r) => ({ ...r, selected: r.id === "start" }));
  });
  const [savedSnap, setSavedSnap] = useState(() => payloadOf(meta, rfToFlow(nodes)));
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; from: { id: string; key: string } } | null>(null);
  const menuPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const flow = useMemo(() => rfToFlow(nodes), [nodes]);
  const edges = useMemo(() => flowToEdges(flow, selEdge), [flow, selEdge]);
  const dirty = useMemo(() => payloadOf(meta, flow) !== savedSnap, [meta, flow, savedSnap]);
  const warnings = useMemo(() => nodeWarnings(flow, meta), [flow, meta]);
  const selectedId = nodes.find((r) => r.selected)?.id ?? "start";
  const selectedNode = flow.nodes[selectedId] ?? flow.nodes.start;

  const ctx = useMemo<FlowCtxValue>(
    () => ({
      warnings,
      trigger: meta.trigger,
      keywords: meta.trigger === "mention" ? [] : meta.keywords,
      mediaLabel: meta.media_label,
      postId: meta.post_id,
      hasReplies: meta.trigger === "comment" && meta.public_replies.some((r) => r.trim()),
      pendingNextReel: meta.trigger === "comment" && meta.pending_next_reel,
    }),
    [warnings, meta],
  );

  // ----- edição do flow -----
  const commit = useCallback((fn: (f: Flow) => Flow, selectId?: string) => {
    setNodes((ns) => rebuild(ns, fn(rfToFlow(ns)), selectId));
  }, []);

  const select = useCallback((id: string) => {
    setNodes((ns) => ns.map((r) => (r.selected === (r.id === id) ? r : { ...r, selected: r.id === id })));
  }, []);

  const patchNode = useCallback(
    (id: string, fn: (n: FlowNode) => void) =>
      commit((f) => {
        const nodesCopy = { ...f.nodes };
        const c = structuredClone(nodesCopy[id]);
        fn(c);
        fixOuts(nodesCopy[id], c);
        nodesCopy[id] = c;
        return { nodes: nodesCopy };
      }),
    [commit],
  );

  const setLink = useCallback(
    (from: string, key: string, to: string | null) => patchNode(from, (n) => setOut(n, key, to)),
    [patchNode],
  );

  const createNode = useCallback(
    (type: NewType, x: number, y: number, from?: { id: string; key: string } | null) => {
      commit((f) => {
        const r = addNodeLinked(f, type, x, y, from);
        return r.flow;
      });
      setNodes((ns) => {
        // seleciona o bloco recém-criado (o último incluído)
        const last = ns[ns.length - 1];
        return ns.map((r) => ({ ...r, selected: r.id === last.id }));
      });
      if (isMobile) setPanelOpen(true);
    },
    [commit, isMobile],
  );

  const addFromToolbar = (type: NewType) => {
    const ref = flow.nodes[selectedId] ?? flow.nodes.start;
    const pos = freeSpotRightOf(flow, ref);
    const free = outs(ref).find(([k]) => !getOut(ref, k));
    createNode(type, pos.x, pos.y, free ? { id: ref.id, key: free[0] } : null);
  };

  const setNext = (id: string, key: string, value: string | null) => {
    if (value && value.startsWith("new:")) {
      const ref = flow.nodes[id];
      const pos = freeSpotRightOf(flow, ref);
      createNode(value.slice(4) as NewType, pos.x, pos.y, { id, key });
    } else setLink(id, key, value);
  };

  const deleteNode = (id: string) => {
    if (id === "start") return;
    commit((f) => removeNode(f, id), "start");
  };

  const closePanel = useCallback(() => {
    select("start");
    setPanelOpen(false);
  }, [select]);

  const organize = () => {
    commit(autoLayout);
    setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 60);
  };

  // ----- eventos do React Flow -----
  const onNodesChange = useCallback((changes: NodeChange<IgRFNode>[]) => {
    const ok = changes.filter((c) => c.type !== "remove");
    if (ok.some((c) => c.type === "select" && c.selected)) setSelEdge(null);
    setNodes((ns) => applyNodeChanges(ok, ns));
  }, []);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) {
        if (c.type === "select") setSelEdge((cur) => (c.selected ? c.id : cur === c.id ? null : cur));
        if (c.type === "remove") {
          const i = c.id.lastIndexOf(":");
          setLink(c.id.slice(0, i), c.id.slice(i + 1), null);
        }
      }
    },
    [setLink],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.sourceHandle && c.target && c.source !== c.target) setLink(c.source, c.sourceHandle, c.target);
    },
    [setLink],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, st: FinalConnectionState) => {
      if (st.isValid || !st.fromNode || !st.fromHandle?.id) return;
      const pt = "changedTouches" in event ? event.changedTouches[0] : event;
      const from = { id: st.fromNode.id, key: st.fromHandle.id };
      // soltou em cima de um bloco (fora da bolinha) = liga nele
      const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest(".react-flow__node");
      const target = el?.getAttribute("data-id");
      if (target && target !== from.id && target !== "start") {
        setLink(from.id, from.key, target);
        return;
      }
      if (target) return;
      menuPos.current = screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
      setMenu({ x: pt.clientX, y: pt.clientY, from });
    },
    [screenToFlowPosition, setLink],
  );

  // ----- salvar -----
  const save = useMutation({
    mutationFn: async (vars: { meta: RuleMeta; flow: Flow }) => {
      const { meta, flow } = vars;
      const { rule: v, errors } = validateRule({ ...meta, flow });
      if (errors.length) throw new Error(errors.join("\n"));
      const { error } = await supabase
        .from("ig_automations")
        .update({
          name: v.name,
          active: meta.active,
          trigger: v.trigger,
          keywords: v.keywords,
          match_type: v.match_type,
          post_id: v.post_id,
          media_label: v.media_label,
          public_replies: v.public_replies,
          pending_next_reel: v.pending_next_reel,
          next_reel_since: v.next_reel_since,
          flow: v.flow as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rule.id);
      if (error) throw error;
      return v;
    },
    onSuccess: (v, vars) => {
      const m: RuleMeta = {
        name: v.name,
        active: vars.meta.active,
        trigger: v.trigger,
        keywords: v.keywords,
        match_type: v.match_type,
        post_id: v.post_id,
        media_label: v.media_label,
        public_replies: v.public_replies,
        pending_next_reel: v.pending_next_reel,
        next_reel_since: v.next_reel_since,
      };
      setMeta((cur) => (JSON.stringify(cur) === JSON.stringify(vars.meta) ? m : cur));
      setSavedSnap(payloadOf(m, vars.flow));
      qc.invalidateQueries({ queryKey: ["ig_automations"] });
      qc.invalidateQueries({ queryKey: ["ig_automation", rule.id] });
      toast.success("Fluxo salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doSave = () => save.mutate({ meta, flow });
  const saveRef = useRef(doSave);
  saveRef.current = doSave;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
        return;
      }
      if (e.key === "Escape") {
        if (menu) return setMenu(null);
        if (document.querySelector('[role="dialog"],[role="listbox"]')) return;
        if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
        closePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, closePanel]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const goBack = () => {
    // BrowserRouter não oferece useBlocker: confirma aqui para a saída pelo link do topo
    if (dirty && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) return;
    navigate("/instagram-automacoes");
  };

  const panel = (
    <NodePanel
      node={selectedNode}
      flow={flow}
      meta={meta}
      ruleId={rule.id}
      warnings={warnings[selectedNode.id] ?? []}
      onMeta={(p) => setMeta((m) => ({ ...m, ...p }))}
      onPatch={patchNode}
      onSetOut={setNext}
      onDelete={deleteNode}
      onClose={closePanel}
    />
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <style>{`.react-flow__edge.selected .react-flow__edge-path{stroke:#2563eb !important}`}</style>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4">
        <Button type="button" variant="ghost" size="sm" onClick={goBack} className="shrink-0">
          <ArrowLeft className="mr-1 h-4 w-4" /> <span className="hidden sm:inline">Instagram</span>
        </Button>
        <Workflow className="hidden h-4 w-4 shrink-0 text-pink-500 sm:block" />
        <Input
          value={meta.name}
          maxLength={MAX_NAME}
          placeholder="Nome do fluxo"
          onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          className="h-9 min-w-0 max-w-sm flex-1 border-transparent bg-transparent font-semibold shadow-none hover:border-input focus-visible:border-input"
        />
        {dirty && <span className="shrink-0 text-xs font-medium text-orange-500">● não salvo</span>}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch checked={meta.active} onCheckedChange={(v) => setMeta((m) => ({ ...m, active: v }))} />
            <span className="hidden sm:inline">Ativo</span>
          </label>
          <Button type="button" size="sm" onClick={doSave} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <FlowCtx.Provider value={ctx}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              onNodeClick={() => isMobile && setPanelOpen(true)}
              onPaneClick={() => setMenu(null)}
              onBeforeDelete={async ({ edges }) => ({ nodes: [], edges })}
              isValidConnection={(c) => c.source !== c.target && c.target !== "start"}
              defaultEdgeOptions={{ style: { stroke: "#94a3b8", strokeWidth: 2.2 } }}
              connectionLineStyle={{ stroke: "#3b82f6", strokeWidth: 2.2, strokeDasharray: "6 5" }}
              minZoom={0.25}
              maxZoom={2}
              panOnScroll
              zoomOnScroll={false}
              fitView
              fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
              proOptions={{ hideAttribution: true }}
              style={{ background: "#f1f5f9" }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="#cbd5e1" />
              <Controls position="bottom-left" showInteractive={false} />
              <Panel position="top-left" className="flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
                {NEW_TYPES.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 bg-white text-slate-800 shadow-sm"
                    onClick={() => addFromToolbar(t)}
                  >
                    ＋ {IGN[t].label}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="secondary" className="h-8 shadow-sm" onClick={organize}>
                  ⇶ Organizar
                </Button>
              </Panel>
              <Panel position="bottom-center" className="hidden text-[11px] text-slate-500 md:block">
                puxe a bolinha da direita até outro bloco para ligar · arraste o título para mover
              </Panel>
            </ReactFlow>
          </FlowCtx.Provider>

          {menu && (
            <div
              className="fixed z-50 w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
              style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 250) }}
            >
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">Novo bloco</div>
              {NEW_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    createNode(t, menuPos.current.x, menuPos.current.y - 24, menu.from);
                    setMenu(null);
                  }}
                >
                  <span>{IGN[t].ico}</span> {IGN[t].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {!isMobile && <aside className="w-[400px] shrink-0 border-l">{panel}</aside>}
      </div>

      {isMobile && (
        <Sheet open={panelOpen} onOpenChange={(o) => !o && closePanel()} modal={false}>
          <SheetContent side="bottom" className="h-[55vh] p-0 [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()}>
            <SheetTitle className="sr-only">Bloco selecionado</SheetTitle>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
