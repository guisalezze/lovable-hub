import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Instagram } from "lucide-react";
import AccountStatus from "@/components/instagram/AccountStatus";
import FlowsTable from "@/components/instagram/FlowsTable";
import ContactsSection from "@/components/instagram/ContactsSection";
import RepliesSection from "@/components/instagram/RepliesSection";

export default function InstagramAutomacoes() {
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();

  useEffect(() => {
    if (searchParams.get("connected") === "1") {
      toast.success("Instagram conectado com sucesso!");
      qc.invalidateQueries({ queryKey: ["ig_config"] });
      qc.invalidateQueries({ queryKey: ["ig_status"] });
    }
    if (searchParams.get("error")) {
      toast.error(`Erro ao conectar: ${searchParams.get("error")}`);
    }
  }, [searchParams, qc]);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-2">
        <Instagram className="h-6 w-6 text-pink-500" />
        <h1 className="text-xl font-bold">Instagram</h1>
      </div>
      <AccountStatus />
      <FlowsTable />
      <ContactsSection />
      <RepliesSection />
    </div>
  );
}
