import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function MetaCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setStatus("error");
      setMessage("Código de autorização não encontrado");
      return;
    }

    const exchange = async () => {
      try {
        const res = await supabase.functions.invoke("meta-oauth", {
          body: { code, redirect_uri: `${window.location.origin}/nutra/meta-callback` },
        });
        if (res.error) throw res.error;
        setStatus("success");
        setMessage("Conta Meta Ads conectada com sucesso!");
        setTimeout(() => navigate("/nutra/meta-ads"), 2000);
      } catch (err) {
        setStatus("error");
        setMessage(String(err));
      }
    };
    exchange();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="glass-card p-8 text-center max-w-md space-y-4">
        {status === "loading" && <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />}
        {status === "success" && <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto" />}
        {status === "error" && <XCircle className="h-10 w-10 text-destructive mx-auto" />}
        <h2 className="text-lg font-semibold text-foreground">
          {status === "loading" ? "Conectando..." : status === "success" ? "Conectado!" : "Erro"}
        </h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
