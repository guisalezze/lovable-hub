import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import {
  useIsAdmin,
  useMyPerformance,
  useTeamMembers,
  useMemberPerformance,
} from "@/hooks/useTeamPerformance";
import { PerformanceDashboard } from "@/components/equipe/PerformanceDashboard";
import { TeamMemberCard } from "@/components/equipe/TeamMemberCard";

export default function Equipe() {
  const { data: isAdmin, isLoading: loadingAdmin } = useIsAdmin();
  const { data: myKpis, isLoading: loadingKpis } = useMyPerformance();
  const { data: members } = useTeamMembers();
  const [selectedMember, setSelectedMember] = useState<{
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
  } | null>(null);
  const { data: memberKpis } = useMemberPerformance(selectedMember?.id ?? null);

  if (loadingAdmin || loadingKpis) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Equipe</h1>

      <Tabs defaultValue="minha-performance">
        <TabsList>
          <TabsTrigger value="minha-performance">Minha Performance</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="minha-equipe">Minha Equipe</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="minha-performance">
          {myKpis && <PerformanceDashboard kpis={myKpis} />}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="minha-equipe">
            {selectedMember ? (
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMember(null)}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </Button>
                {memberKpis && (
                  <PerformanceDashboard
                    kpis={memberKpis}
                    userName={selectedMember.full_name || selectedMember.email}
                  />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {members?.map((m) => (
                  <TeamMemberCard
                    key={m.id}
                    member={m}
                    onClick={() => setSelectedMember(m)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
