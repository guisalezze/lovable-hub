// Chamadas à edge function instagram-admin (Zernio). Todas as formas de
// requisição/resposta ficam aqui, para ajustar num lugar só.
import { supabase } from "@/integrations/supabase/client";

export interface IgAdminStatus {
  key_set: boolean;
  profile_id: string | null;
  account: { username: string | null; ig_user_id: string | null; followers_count: number | null } | null;
  webhook_ok: boolean;
  last_worker_at: string | null;
}
export interface IgProfile {
  id: string;
  name: string;
}
export interface IgAccount {
  id: string;
  username: string | null;
  ig_user_id: string | null;
  picture: string | null;
}
export interface IgPost {
  id: string;
  caption: string | null;
  permalink: string | null;
  is_reel: boolean;
  thumbnail: string | null;
  created_at: string | null;
}
export interface IgConversation {
  id: string;
  participant_id: string | null;
  username: string | null;
  updated_at: string | null;
  last_message: string | null;
}
export interface IgMessage {
  id: string;
  text: string | null;
  from_me: boolean;
  created_at: string | null;
}

// Erros não-2xx trazem {error} em português no corpo.
async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("instagram-admin", { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* mantém a mensagem padrão */
    }
    throw new Error(msg);
  }
  if (data && typeof data === "object" && "error" in data && data.error) throw new Error(String(data.error));
  return data as T;
}

// Aceita {key:[...]} ou um array puro.
function list<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const v = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const igAdmin = {
  status: () => invokeAdmin<IgAdminStatus>({ action: "status" }),
  profiles: async () => list<IgProfile>(await invokeAdmin<unknown>({ action: "profiles" }), "profiles"),
  setProfile: (profile_id: string) =>
    invokeAdmin<{ ok: true; profile_id: string; webhook_ok: boolean }>({ action: "set_profile", profile_id }),
  accounts: async () => list<IgAccount>(await invokeAdmin<unknown>({ action: "accounts" }), "accounts"),
  connect: (redirect_url: string) => invokeAdmin<{ auth_url: string }>({ action: "connect", redirect_url }),
  selectAccount: (account_id: string) =>
    invokeAdmin<{ ok: true; account: { username: string | null; ig_user_id: string | null } }>({
      action: "select_account",
      account_id,
    }),
  posts: async () => list<IgPost>(await invokeAdmin<unknown>({ action: "posts" }), "posts"),
  conversations: async () =>
    list<IgConversation>(await invokeAdmin<unknown>({ action: "conversations" }), "conversations"),
  /** Ordem antiga → nova. */
  messages: async (conversation_id: string) =>
    list<IgMessage>(await invokeAdmin<unknown>({ action: "messages", conversation_id }), "messages"),
  reply: (conversation_id: string, text: string) =>
    invokeAdmin<{ ok: true; message_id?: string }>({ action: "reply", conversation_id, text }),
  disconnect: () => invokeAdmin<{ ok: true }>({ action: "disconnect" }),
};
