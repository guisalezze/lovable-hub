import { Instagram } from "lucide-react";
import AccountStatus from "@/components/instagram/AccountStatus";
import FlowsTable from "@/components/instagram/FlowsTable";
import ContactsSection from "@/components/instagram/ContactsSection";
import RepliesSection from "@/components/instagram/RepliesSection";

export default function InstagramAutomacoes() {
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
