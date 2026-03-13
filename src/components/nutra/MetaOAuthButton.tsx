import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export function MetaOAuthButton() {
  const appId = import.meta.env.VITE_META_APP_ID;
  const redirectUri = `${window.location.origin}/nutra/meta-callback`;
  const scopes = "ads_management,ads_read,business_management";

  const handleConnect = () => {
    if (!appId) {
      alert("VITE_META_APP_ID não configurado. Configure no .env");
      return;
    }
    const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code`;
    window.location.href = url;
  };

  return (
    <Button onClick={handleConnect} className="gap-2">
      <ExternalLink className="h-4 w-4" />
      Conectar Meta Ads
    </Button>
  );
}
