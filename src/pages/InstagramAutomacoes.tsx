import { Instagram } from "lucide-react";
import ConnectionCard from "@/components/instagram/ConnectionCard";
import CampaignsSection from "@/components/instagram/CampaignsSection";
import InboxSection from "@/components/instagram/InboxSection";
import LogsSection from "@/components/instagram/LogsSection";
import ContactsSection from "@/components/instagram/ContactsSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function InstagramAutomacoes() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Instagram className="h-6 w-6 text-pink-500" />
        <h1 className="text-xl font-bold">Instagram</h1>
      </div>
      <ConnectionCard />
      <Tabs defaultValue="campanhas">
        <TabsList>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
          <TabsTrigger value="registros">Registros</TabsTrigger>
        </TabsList>
        <TabsContent value="campanhas" className="mt-6">
          <CampaignsSection />
        </TabsContent>
        <TabsContent value="conversas" className="mt-6">
          <InboxSection />
        </TabsContent>
        <TabsContent value="registros" className="space-y-8 mt-6">
          <LogsSection />
          <ContactsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
