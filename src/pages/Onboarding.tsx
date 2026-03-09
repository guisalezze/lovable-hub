import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function OnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [niche, setNiche] = useState("");
  const [currentRevenue, setCurrentRevenue] = useState("");
  const [mainGoal, setMainGoal] = useState("");
  const [expectations, setExpectations] = useState("");
  const [availability, setAvailability] = useState("");
  const [howFound, setHowFound] = useState("");

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    supabase.from("onboarding_responses" as any).select("*").eq("token", token).single()
      .then(({ data, error }: any) => {
        if (error || !data) { setNotFound(true); }
        else if (data.status === "completed") { setDone(true); }
        else { setRecord(data); }
        setLoading(false);
      });
  }, [token]);

  async function handleSubmit() {
    if (!fullName || !phone || !niche || !mainGoal) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("onboarding_responses" as any)
      .update({
        full_name: fullName, phone, niche,
        current_revenue: currentRevenue, main_goal: mainGoal,
        expectations, availability, how_found: howFound,
        status: "completed", completed_at: new Date().toISOString(),
      } as any)
      .eq("token", token);

    if (error) { toast.error("Erro ao enviar. Tente novamente."); setSubmitting(false); return; }

    if (record?.lead_id && fullName) {
      try { await supabase.from("leads").update({ full_name: fullName, phone_formatted: phone }).eq("id", record.lead_id); } catch {}
    }

    setDone(true);
    setSubmitting(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Link inválido</h1>
        <p className="text-muted-foreground">Este link de onboarding não existe ou expirou.</p>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-md">
        <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Tudo certo!</h1>
        <p className="text-muted-foreground">Suas informações foram recebidas. Em breve entraremos em contato para dar início à mentoria.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-4 pt-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto text-2xl">🎯</div>
          <h1 className="text-2xl font-bold text-foreground">Questionário de Onboarding</h1>
          <p className="text-sm text-muted-foreground">Preencha com calma — essas informações são essenciais para personalizarmos sua mentoria.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Nome completo *</label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Como você se chama?" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">WhatsApp *</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Nicho / área de atuação *</label>
            <Input value={niche} onChange={e => setNiche(e.target.value)} placeholder="Ex: marketing digital, ecommerce, saúde..." />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Faturamento atual (aproximado)</label>
            <Select value={currentRevenue} onValueChange={setCurrentRevenue}>
              <SelectTrigger><SelectValue placeholder="Selecionar faixa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="zero">Ainda não faturei</SelectItem>
                <SelectItem value="ate5k">Até R$ 5.000/mês</SelectItem>
                <SelectItem value="5k-20k">R$ 5.000 – R$ 20.000/mês</SelectItem>
                <SelectItem value="20k-50k">R$ 20.000 – R$ 50.000/mês</SelectItem>
                <SelectItem value="50k-100k">R$ 50.000 – R$ 100.000/mês</SelectItem>
                <SelectItem value="100k+">Acima de R$ 100.000/mês</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Principal dor ou objetivo *</label>
            <Textarea value={mainGoal} onChange={e => setMainGoal(e.target.value)} placeholder="O que te trouxe até aqui? Qual é o maior desafio que você quer resolver?" className="resize-none" rows={3} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Expectativas da mentoria</label>
            <Textarea value={expectations} onChange={e => setExpectations(e.target.value)} placeholder="O que você espera conquistar ao final do processo?" className="resize-none" rows={3} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Disponibilidade de horário</label>
            <Select value={availability} onValueChange={setAvailability}>
              <SelectTrigger><SelectValue placeholder="Selecionar período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manha">Manhã (8h – 12h)</SelectItem>
                <SelectItem value="tarde">Tarde (12h – 18h)</SelectItem>
                <SelectItem value="noite">Noite (18h – 22h)</SelectItem>
                <SelectItem value="flexivel">Flexível</SelectItem>
                <SelectItem value="fds">Apenas fins de semana</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Como você me conheceu?</label>
            <Select value={howFound} onValueChange={setHowFound}>
              <SelectTrigger><SelectValue placeholder="Selecionar origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="indicacao">Indicação de amigo</SelectItem>
                <SelectItem value="anuncio">Anúncio (Meta Ads)</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="evento">Evento / live</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full h-11 text-sm font-semibold" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando...</> : "Enviar questionário"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">Campos com <span className="text-destructive">*</span> são obrigatórios</p>
        </div>
      </div>
    </div>
  );
}
