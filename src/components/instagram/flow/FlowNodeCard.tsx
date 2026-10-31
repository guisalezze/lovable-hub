import { createContext, memo, useContext, useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { IGN, TRIGGER_LABEL, getOut, outs } from "@/lib/instagramFlow";
import { cn } from "@/lib/utils";
import { nodeSummary, type IgRFNode } from "./convert";

export interface FlowCtxValue {
  warnings: Record<string, string[]>;
  trigger: string;
  keywords: string[];
  mediaLabel: string | null;
  postId: string | null;
  hasReplies: boolean;
}

export const FlowCtx = createContext<FlowCtxValue>({
  warnings: {},
  trigger: "comment",
  keywords: [],
  mediaLabel: null,
  postId: null,
  hasReplies: false,
});

function FlowNodeCardImpl({ id, data, selected }: NodeProps<IgRFNode>) {
  const n = data.n;
  const ctx = useContext(FlowCtx);
  const meta = IGN[n.type];
  const warn = ctx.warnings[id]?.length > 0;
  const rows = outs(n);
  const update = useUpdateNodeInternals();
  const sig = rows.map(([k]) => k).join(",");
  useEffect(() => {
    update(id);
  }, [id, sig, update]);

  return (
    <div
      className={cn(
        "w-[290px] rounded-2xl border-2 bg-white text-slate-900 shadow-md text-xs",
        warn ? "border-orange-400" : "border-slate-200",
        selected && "border-blue-500 ring-4 ring-blue-500/20",
      )}
    >
      {n.type !== "start" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-white !border-2 !border-slate-400"
        />
      )}
      <div className="ig-drag flex items-center gap-2.5 px-3 py-2.5 cursor-grab active:cursor-grabbing">
        <div
          className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-base text-white"
          style={{ background: meta.cor }}
        >
          {meta.ico}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.cor }}>
            {meta.label}
          </div>
          <div className="text-xs text-slate-600 truncate">{nodeSummary(n)}</div>
        </div>
      </div>

      <Body n={n} />

      <div className="border-t border-slate-100 py-1">
        {rows.map(([key, label]) => {
          const linked = !!getOut(n, key);
          return (
            <div key={key} className="relative flex items-center justify-end px-3 py-1.5 text-[11px] text-slate-500">
              <span className="truncate max-w-[220px]">{label}</span>
              <Handle
                id={key}
                type="source"
                position={Position.Right}
                className={cn(
                  "!w-3.5 !h-3.5 !border-2 !border-blue-500",
                  linked ? "!bg-blue-500" : "!bg-white",
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Body({ n }: { n: IgRFNode["data"]["n"] }) {
  const ctx = useContext(FlowCtx);
  if (n.type === "start") {
    return (
      <div className="px-3 pb-2 flex flex-wrap gap-1">
        <Chip>
          {TRIGGER_LABEL[ctx.trigger] ?? ctx.trigger}
          {ctx.trigger === "comment" && (ctx.postId ? ` · ${ctx.mediaLabel || "post"}` : " · qualquer post")}
        </Chip>
        {ctx.keywords.length > 0 && <Chip>🔑 {ctx.keywords.slice(0, 3).join(", ")}{ctx.keywords.length > 3 ? "…" : ""}</Chip>}
        {ctx.hasReplies && <Chip>💬 responde no comentário</Chip>}
      </div>
    );
  }
  if (n.type === "message") {
    const links = (n.buttons || []).filter((b) => b.type === "url" && b.label?.trim());
    return (
      <div className="px-3 pb-2 space-y-1.5">
        {n.text?.trim() && (
          <div className="rounded-xl bg-slate-100 px-2.5 py-1.5 text-slate-700 whitespace-pre-wrap line-clamp-6 break-words">
            {n.text}
          </div>
        )}
        {n.image?.trim() && <div className="text-slate-500">🖼 imagem</div>}
        {links.map((b, i) => (
          <div key={i} className="rounded-lg border border-slate-200 px-2 py-1 text-center text-blue-600 truncate">
            🔗 {b.label}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{children}</span>;
}

export const FlowNodeCard = memo(FlowNodeCardImpl);
