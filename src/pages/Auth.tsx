import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { toast } from "sonner";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate("/", { replace: true });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error("Email ou senha incorretos.");
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 glow-primary">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">OpsCRM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entre na sua conta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-secondary border-border"
          />
          <Input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-secondary border-border"
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Carregando..." : "Entrar"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Acesso restrito. Contate o administrador para obter uma conta.
        </p>
      </div>
    </div>
  );
}
