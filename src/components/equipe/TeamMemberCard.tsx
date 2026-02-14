import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useMemberPerformance } from "@/hooks/useTeamPerformance";
import { User } from "lucide-react";

interface Props {
  member: { id: string; full_name: string; email: string; avatar_url: string | null };
  onClick: () => void;
}

export function TeamMemberCard({ member, onClick }: Props) {
  const { data: kpis } = useMemberPerformance(member.id);

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4 flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          {member.avatar_url ? (
            <img
              src={member.avatar_url}
              alt={member.full_name}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <User className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {member.full_name || member.email}
          </p>
          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
          {kpis && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Conclusão</span>
                <span>{kpis.completionRate.toFixed(0)}%</span>
              </div>
              <Progress value={kpis.completionRate} className="h-1.5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
