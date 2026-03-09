import { Badge } from "@/components/ui/badge";
import { useClientLtvByEmail } from "@/hooks/useClientLtv";

const SEGMENT_CONFIG = {
  vip: { label: "VIP", className: "bg-amber-500/20 text-amber-700 border-amber-500/30" },
  premium: { label: "Premium", className: "bg-primary/20 text-primary border-primary/30" },
  regular: { label: "Regular", className: "bg-secondary text-muted-foreground border-border" },
  new: { label: "Novo", className: "bg-emerald-500/20 text-emerald-700 border-emerald-500/30" },
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface LtvBadgeProps {
  email?: string | null;
  segment?: "vip" | "premium" | "regular" | "new";
  ltv?: number;
  showLtv?: boolean;
  size?: "sm" | "md";
}

export function LtvBadge({ email, segment: propSegment, ltv: propLtv, showLtv = true, size = "sm" }: LtvBadgeProps) {
  const { data } = useClientLtvByEmail(!propSegment ? email : undefined);

  const segment = propSegment || data?.segment || "new";
  const ltv = propLtv ?? data?.ltv ?? 0;
  const config = SEGMENT_CONFIG[segment];

  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className={`${config.className} ${textSize} px-1.5 py-0`}>
        {config.label}
      </Badge>
      {showLtv && ltv > 0 && (
        <span className={`${textSize} font-medium text-muted-foreground`}>
          {fmtBRL(ltv)}
        </span>
      )}
    </div>
  );
}
