import { Instagram } from "lucide-react";
import AccountStatus from "@/components/instagram/AccountStatus";
import FlowsTable from "@/components/instagram/FlowsTable";
import ContactsSection from "@/components/instagram/ContactsSection";
import RepliesSection from "@/components/instagram/RepliesSection";
import InboxSection from "@/components/instagram/InboxSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function InstagramAutomacoes() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-2">
        <Instagram className="h-6 w-6 text-pink-500" />
        <h1 className="text-xl font-bold">Instagram</h1>
      </div>
      <AccountStatus />
      <Tabs defaultValue="automacoes">
        <TabsList>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
        </TabsList>
        <TabsContent value="automacoes" className="space-y-8 mt-6">
          <FlowsTable />
          <ContactsSection />
          <RepliesSection />
        </TabsContent>
        <TabsContent value="conversas" className="mt-6">
          <InboxSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
