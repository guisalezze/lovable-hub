import { Settings } from "lucide-react";

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Configurações do sistema</p>
      </div>

      <div className="glass-card p-12 text-center">
        <Settings className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">Configurações em desenvolvimento</p>
        <p className="text-xs text-muted-foreground mt-1">
          Gerenciamento de usuários, perfis e preferências será implementado aqui.
        </p>
      </div>
    </div>
  );
}
