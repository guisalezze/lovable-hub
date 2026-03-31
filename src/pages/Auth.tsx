import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function AuthPage() {
  const [login, setLogin] = useState("");
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

    const trimmed = login.trim().toLowerCase();

    try {
      if (trimmed.includes("@")) {
        // Direct email login
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (error) toast.error("Email ou senha incorretos.");
      } else {
        // Username login — resolved server-side (email never sent to browser)
        const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-username`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmed, password }),
        });
        const data = await res.json();
        if (!res.ok || !data.session) {
          toast.error("Usuário ou senha incorretos.");
          return;
        }
        const { error } = await supabase.auth.setSession(data.session);
        if (error) toast.error("Usuário ou senha incorretos.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 glow-primary">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h1 className="heading-display text-2xl text-primary">OpsCRM</h1>
          <p className="text-sm italic text-muted-foreground mt-1">
            Entre na sua conta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
          <Input
            type="text"
            placeholder="Email ou usuário"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
            autoCapitalize="none"
            autoCorrect="off"
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
