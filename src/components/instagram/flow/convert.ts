// Conversão flow.nodes <-> nós/arestas do React Flow, auto-layout e criação de blocos.
// Módulo puro (só tipos do @xyflow/react): o estado do editor guarda o FlowNode em data.n.
import type { Edge, Node } from "@xyflow/react";
import {
  IG_NEW,
  getOut,
  newNodeId,
  outs,
  setOut,
  type Flow,
  type FlowNode,
  type NodeType,
} from "@/lib/instagramFlow";

export type IgNodeData = { n: FlowNode } & Record<string, unknown>;
export type IgRFNode = Node<IgNodeData, "ig">;

export const NODE_W = 290;
export const COL_W = 360;
export const ROW_H = 260;

/** flow.nodes -> nós do React Flow (posição = x/y; o FlowNode inteiro vai em data.n). */
export function flowToRf(flow: Flow): IgRFNode[] {
  return Object.values(flow.nodes).map((n) => ({
    id: n.id,
    type: "ig",
    position: { x: n.x, y: n.y },
    dragHandle: ".ig-drag",
    deletable: false,
    data: { n: structuredClone(n) },
  }));
}

/** Nós do React Flow -> flow.nodes (x/y = posição, arredondada). */
export function rfToFlow(nodes: IgRFNode[]): Flow {
  const out: Record<string, FlowNode> = {};
  for (const r of nodes) {
    out[r.id] = { ...r.data.n, id: r.id, x: Math.round(r.position.x), y: Math.round(r.position.y) };
  }
  return { nodes: out };
}

/** Arestas derivadas de next / yes / no / buttons[i].next (sourceHandle = chave da saída). */
export function flowToEdges(flow: Flow, selectedEdge?: string | null): Edge[] {
  const edges: Edge[] = [];
  for (const n of Object.values(flow.nodes)) {
    for (const [key] of outs(n)) {
      const t = getOut(n, key);
      if (t && flow.nodes[t]) {
        const id = `${n.id}:${key}`;
        edges.push({ id, source: n.id, sourceHandle: key, target: t, type: "default", selected: id === selectedEdge });
      }
    }
  }
  return edges;
}

/** Remove o bloco e desliga tudo que apontava para ele. */
export function removeNode(flow: Flow, id: string): Flow {
  const nodes: Record<string, FlowNode> = {};
  for (const [k, n] of Object.entries(flow.nodes)) {
    if (k === id) continue;
    const c = structuredClone(n);
    for (const key of ["next", "yes", "no"] as const) if (c[key] === id) c[key] = null;
    c.buttons?.forEach((b) => {
      if (b.next === id) b.next = null;
    });
    nodes[k] = c;
  }
  return { nodes };
}

/** Id novo (1ª letra do tipo + timestamp base36), garantindo unicidade. */
export function uniqueNodeId(type: NodeType, nodes: Record<string, unknown>): string {
  let id = newNodeId(type);
  let i = 0;
  while (nodes[id]) id = newNodeId(type) + (++i).toString(36);
  return id;
}

export function makeNode(type: Exclude<NodeType, "start">, id: string, x: number, y: number): FlowNode {
  return { id, type, x: Math.round(x), y: Math.round(y), next: null, ...IG_NEW[type]() } as FlowNode;
}

/** Cria o bloco e (se `from` informado) liga a saída `key` do bloco de origem a ele. */
export function addNodeLinked(
  flow: Flow,
  type: Exclude<NodeType, "start">,
  x: number,
  y: number,
  from?: { id: string; key: string } | null,
): { flow: Flow; id: string } {
  const id = uniqueNodeId(type, flow.nodes);
  const nodes = { ...flow.nodes, [id]: makeNode(type, id, x, y) };
  if (type === "condition") {
    nodes[id].yes = null;
    nodes[id].no = null;
    delete nodes[id].next;
  }
  if (from && nodes[from.id]) {
    nodes[from.id] = structuredClone(nodes[from.id]);
    setOut(nodes[from.id], from.key, id);
  }
  return { flow: { nodes }, id };
}

/** Posição livre à direita de `ref` (desce enquanto houver outro bloco em cima). */
export function freeSpotRightOf(flow: Flow, ref: FlowNode): { x: number; y: number } {
  const x = ref.x + COL_W;
  let y = ref.y;
  const taken = (yy: number) =>
    Object.values(flow.nodes).some((n) => Math.abs(n.x - x) < NODE_W + 20 && Math.abs(n.y - yy) < 200);
  while (taken(y)) y += 220;
  return { x, y };
}

/** Auto-layout: coluna = distância do gatilho (BFS), 360 × 260; soltos na última coluna. */
export function autoLayout(flow: Flow): Flow {
  const nodes = structuredClone(flow.nodes);
  const depth: Record<string, number> = {};
  const order: string[] = [];
  if (nodes.start) {
    depth.start = 0;
    const q = ["start"];
    while (q.length) {
      const k = q.shift()!;
      order.push(k);
      for (const [o] of outs(nodes[k])) {
        const t = getOut(nodes[k], o);
        if (t && nodes[t] && depth[t] === undefined) {
          depth[t] = depth[k] + 1;
          q.push(t);
        }
      }
    }
  }
  const maxD = order.length ? Math.max(...order.map((k) => depth[k])) : -1;
  const lost = Object.keys(nodes).filter((k) => depth[k] === undefined);
  for (const k of lost) depth[k] = maxD + 1;
  const rows: Record<number, number> = {};
  for (const k of [...order, ...lost]) {
    const d = depth[k];
    const r = rows[d] ?? 0;
    rows[d] = r + 1;
    nodes[k].x = d * COL_W;
    nodes[k].y = r * ROW_H;
  }
  return { nodes };
}

/** Resumo de uma linha mostrado no cabeçalho do bloco. */
export function nodeSummary(n: FlowNode): string {
  const cut = (s: string, m = 34) => (s.length > m ? s.slice(0, m - 1) + "…" : s);
  switch (n.type) {
    case "start":
      return "Início do fluxo";
    case "message":
      return n.text?.trim() ? cut(n.text.trim().replace(/\s+/g, " ")) : n.image ? "Imagem" : "(vazia)";
    case "delay":
      return `${n.amount ?? 0} ${n.unit === "d" ? "dia(s)" : n.unit === "min" ? "minuto(s)" : "hora(s)"}`;
    case "tag":
      return `${n.action === "remove" ? "−" : "+"} ${n.tag || "(sem tag)"}`;
    case "condition":
      return n.tag ? `tem "${n.tag}"?` : "(sem tag)";
    case "webhook":
      return n.url ? cut(n.url.replace(/^https?:\/\//, "")) : "(sem URL)";
  }
}
