// Campanhas do Instagram (ig_campaigns): formulário, modelos, validação e links rastreados.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CampaignRow = Database["public"]["Tables"]["ig_campaigns"]["Row"];
export type CampaignInsert = Database["public"]["Tables"]["ig_campaigns"]["Insert"];
export type PostMode = "post" | "any" | "next_reel";

export const LIMITS = {
  name: 100,
  postLabel: 80,
  keywords: 10,
  keyword: 50,
  publicReplies: 10,
  publicReply: 1000,
  opening: 640,
  button: 20,
  dm: 1000,
  dmWithButtons: 640,
  follow: 640,
  followup: 1000,
  delayMax: 1440,
} as const;

export const DEFAULT_FOLLOW_BUTTON = "Já estou seguindo ✅";

export interface CampaignForm {
  name: string;
  active: boolean;
  post_mode: PostMode;
  post_id: string | null;
  post_url: string | null;
  post_label: string | null;
  next_reel_since: string | null;
  keywords: string[];
  match_any: boolean;
  whole_word: boolean;
  dm_trigger: boolean;
  public_reply_enabled: boolean;
  public_replies: string[];
  opening_enabled: boolean;
  opening_message: string;
  opening_button: string;
  dm_message: string;
  link1_label: string;
  link1_url: string;
  link2_label: string;
  link2_url: string;
  require_follow: boolean;
  follow_message: string;
  follow_button: string;
  followup_enabled: boolean;
  followup_message: string;
  followup_delay_min: number;
}

/** Tamanho em code points (igual ao char_length do Postgres). */
export const len = (s: string | null | undefined) => (s ? [...s].length : 0);
export const cut = (s: string, max: number) => [...s].slice(0, max).join("");

export const blankForm = (): CampaignForm => ({
  name: "",
  active: true,
  post_mode: "post",
  post_id: null,
  post_url: null,
  post_label: null,
  next_reel_since: null,
  keywords: [],
  match_any: false,
  whole_word: true,
  dm_trigger: false,
  public_reply_enabled: false,
  public_replies: [],
  opening_enabled: false,
  opening_message: "",
  opening_button: "",
  dm_message: "",
  link1_label: "",
  link1_url: "",
  link2_label: "",
  link2_url: "",
  require_follow: false,
  follow_message: "",
  follow_button: DEFAULT_FOLLOW_BUTTON,
  followup_enabled: false,
  followup_message: "",
  followup_delay_min: 60,
});

export interface CampaignTemplate {
  key: string;
  title: string;
  description: string;
  form: Partial<CampaignForm>;
}

export const TEMPLATES: CampaignTemplate[] = [
  {
    key: "blank",
    title: "Em branco",
    description: "Comece do zero.",
    form: {},
  },
  {
    key: "produto",
    title: "Link do produto",
    description: "Quem comentar a palavra recebe o link do produto no DM.",
    form: {
      name: "Link do produto",
      keywords: ["link", "quero"],
      public_reply_enabled: true,
      public_replies: ["Te mandei no direct, {username}! 📩", "Enviado no seu direct 😉", "Corre no direct, {username}! 🚀"],
      dm_message: "Oi {username}! Aqui está o link do produto que você pediu 👇",
      link1_label: "Ver produto",
    },
  },
  {
    key: "lead",
    title: "Lista de espera/lead",
    description: "Pede para seguir e entrega o link de inscrição.",
    form: {
      name: "Lista de espera",
      keywords: ["lista", "eu"],
      public_reply_enabled: true,
      public_replies: ["Te chamei no direct, {username}! 💌", "Olha seu direct 😉"],
      require_follow: true,
      follow_message: "Oi {username}! Para entrar na lista de espera, siga o perfil e toque no botão abaixo 👇",
      follow_button: DEFAULT_FOLLOW_BUTTON,
      dm_message: "Pronto, {username}! Garanta sua vaga na lista de espera pelo link abaixo:",
      link1_label: "Entrar na lista",
    },
  },
  {
    key: "aula",
    title: "Aula/webinar",
    description: "DM de abertura com botão e link da aula.",
    form: {
      name: "Aula ao vivo",
      keywords: ["aula"],
      public_reply_enabled: true,
      public_replies: ["Mandei os detalhes no seu direct, {username}! 🎓"],
      opening_enabled: true,
      opening_message: "Oi {username}! Que bom que você quer participar da aula 🎉 Toque no botão para receber o link.",
      opening_button: "Quero o link",
      dm_message: "Aqui está o link da aula, {username}! Salve na agenda e até lá 👇",
      link1_label: "Acessar aula",
      followup_enabled: true,
      followup_message: "Oi {username}! Passando para lembrar da aula. Te espero lá! 😉",
      followup_delay_min: 1440,
    },
  },
  {
    key: "cupom",
    title: "Cupom de desconto",
    description: "Envia um cupom e o link da loja.",
    form: {
      name: "Cupom de desconto",
      keywords: ["cupom", "desconto"],
      public_reply_enabled: true,
      public_replies: ["Seu cupom está no direct, {username}! 🎁", "Cupom enviado no direct 😉"],
      dm_message: "Oi {username}! Seu cupom é DESCONTO10 (10% off). Use na loja pelo link abaixo 🛍️",
      link1_label: "Ir para a loja",
    },
  },
];

export const templateForm = (key: string | null | undefined): CampaignForm => {
  const t = TEMPLATES.find((x) => x.key === key);
  return { ...blankForm(), ...(t?.form ?? {}) };
};

export function rowToForm(r: CampaignRow): CampaignForm {
  const mode = (["post", "any", "next_reel"].includes(r.post_mode) ? r.post_mode : "post") as PostMode;
  return {
    name: r.name,
    active: r.active,
    post_mode: mode,
    post_id: r.post_id,
    post_url: r.post_url,
    post_label: r.post_label,
    next_reel_since: r.next_reel_since,
    keywords: r.keywords ?? [],
    match_any: r.match_any,
    whole_word: r.whole_word,
    dm_trigger: r.dm_trigger,
    public_reply_enabled: r.public_reply_enabled,
    public_replies: r.public_replies ?? [],
    opening_enabled: r.opening_enabled,
    opening_message: r.opening_message ?? "",
    opening_button: r.opening_button ?? "",
    dm_message: r.dm_message ?? "",
    link1_label: r.link1_label ?? "",
    link1_url: r.link1_url ?? "",
    link2_label: r.link2_label ?? "",
    link2_url: r.link2_url ?? "",
    require_follow: r.require_follow,
    follow_message: r.follow_message ?? "",
    follow_button: r.follow_button ?? "",
    followup_enabled: r.followup_enabled,
    followup_message: r.followup_message ?? "",
    followup_delay_min: r.followup_delay_min,
  };
}

const opt = (s: string) => {
  const t = s.trim();
  return t ? t : null;
};

const hasLinks = (f: CampaignForm) => !!f.link1_url.trim() || !!f.link2_url.trim();

/**
 * Converte o formulário para a linha do banco (texto vazio vira null).
 * `includePost=false` omite os campos de post (modo próximo reel já salvo:
 * o worker pode ter preenchido o post depois que o editor abriu).
 */
export function formToRow(f: CampaignForm, includePost = true): CampaignInsert {
  const row: CampaignInsert = {
    name: f.name.trim(),
    active: f.active,
    post_mode: f.post_mode,
    keywords: f.keywords.map((k) => k.trim()).filter(Boolean),
    match_any: f.match_any,
    whole_word: f.whole_word,
    dm_trigger: f.dm_trigger,
    public_reply_enabled: f.public_reply_enabled,
    public_replies: f.public_replies.map((p) => p.trim()).filter(Boolean),
    opening_enabled: f.opening_enabled,
    opening_message: opt(f.opening_message),
    opening_button: opt(f.opening_button),
    dm_message: f.dm_message.trim(),
    link1_label: opt(f.link1_label),
    link1_url: opt(f.link1_url),
    link2_label: opt(f.link2_label),
    link2_url: opt(f.link2_url),
    require_follow: f.require_follow,
    follow_message: opt(f.follow_message),
    follow_button: opt(f.follow_button),
    followup_enabled: f.followup_enabled,
    followup_message: opt(f.followup_message),
    followup_delay_min: Math.round(f.followup_delay_min),
  };
  if (includePost) {
    row.post_id = f.post_id;
    row.post_url = f.post_url;
    row.post_label = f.post_label ? cut(f.post_label, LIMITS.postLabel) : null;
    row.next_reel_since = f.next_reel_since;
  }
  return row;
}

export type FormErrors = Partial<Record<string, string>>;

const isHttpUrl = (s: string) => {
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
};

/** Valida os limites da tabela ig_campaigns. Chaves = campos do formulário. */
export function validateForm(f: CampaignForm): FormErrors {
  const e: FormErrors = {};
  const name = f.name.trim();
  if (!name) e.name = "Dê um nome para a campanha.";
  else if (len(name) > LIMITS.name) e.name = `O nome pode ter no máximo ${LIMITS.name} caracteres.`;

  if (f.post_mode === "post" && !f.post_id) e.post_id = "Escolha um post ou mude para “Qualquer post”.";

  const kws = f.keywords.map((k) => k.trim()).filter(Boolean);
  if (!f.match_any && kws.length === 0)
    e.keywords = "Adicione pelo menos uma palavra-chave ou marque “Qualquer comentário”.";
  else if (kws.length > LIMITS.keywords) e.keywords = `No máximo ${LIMITS.keywords} palavras-chave.`;
  else if (kws.some((k) => len(k) > LIMITS.keyword))
    e.keywords = `Cada palavra-chave pode ter no máximo ${LIMITS.keyword} caracteres.`;

  const replies = f.public_replies.map((p) => p.trim()).filter(Boolean);
  if (f.public_reply_enabled && replies.length === 0) e.public_replies = "Escreva pelo menos uma resposta pública.";
  else if (replies.length > LIMITS.publicReplies) e.public_replies = `No máximo ${LIMITS.publicReplies} variações.`;
  else if (replies.some((r) => len(r) > LIMITS.publicReply))
    e.public_replies = `Cada resposta pública pode ter no máximo ${LIMITS.publicReply} caracteres.`;

  if (f.opening_enabled && !f.opening_message.trim()) e.opening_message = "Escreva a mensagem de abertura.";
  else if (len(f.opening_message.trim()) > LIMITS.opening)
    e.opening_message = `A mensagem de abertura pode ter no máximo ${LIMITS.opening} caracteres.`;
  if (f.opening_enabled && !f.opening_button.trim()) e.opening_button = "Informe o texto do botão.";
  else if (len(f.opening_button.trim()) > LIMITS.button)
    e.opening_button = `O botão pode ter no máximo ${LIMITS.button} caracteres.`;

  const dm = f.dm_message.trim();
  const dmMax = hasLinks(f) ? LIMITS.dmWithButtons : LIMITS.dm;
  if (!dm) e.dm_message = "Escreva a mensagem final.";
  else if (len(dm) > dmMax)
    e.dm_message = hasLinks(f)
      ? `Com links, a mensagem final pode ter no máximo ${LIMITS.dmWithButtons} caracteres.`
      : `A mensagem final pode ter no máximo ${LIMITS.dm} caracteres.`;

  for (const i of [1, 2] as const) {
    const url = (i === 1 ? f.link1_url : f.link2_url).trim();
    const label = (i === 1 ? f.link1_label : f.link2_label).trim();
    if (url && !isHttpUrl(url)) e[`link${i}_url`] = "Use um endereço completo começando com http:// ou https://.";
    if (!url && label) e[`link${i}_url`] = `Informe a URL do link ${i} ou apague o rótulo.`;
    if (len(label) > LIMITS.button) e[`link${i}_label`] = `O rótulo pode ter no máximo ${LIMITS.button} caracteres.`;
  }

  if (f.require_follow && !f.follow_message.trim()) e.follow_message = "Escreva a mensagem do pedido para seguir.";
  else if (len(f.follow_message.trim()) > LIMITS.follow)
    e.follow_message = `O pedido para seguir pode ter no máximo ${LIMITS.follow} caracteres.`;
  if (f.require_follow && !f.follow_button.trim()) e.follow_button = "Informe o texto do botão.";
  else if (len(f.follow_button.trim()) > LIMITS.button)
    e.follow_button = `O botão pode ter no máximo ${LIMITS.button} caracteres.`;

  if (f.followup_enabled && !f.followup_message.trim()) e.followup_message = "Escreva a mensagem de follow-up.";
  else if (len(f.followup_message.trim()) > LIMITS.followup)
    e.followup_message = `O follow-up pode ter no máximo ${LIMITS.followup} caracteres.`;
  if (
    !Number.isFinite(f.followup_delay_min) ||
    !Number.isInteger(f.followup_delay_min) ||
    f.followup_delay_min < 0 ||
    f.followup_delay_min > LIMITS.delayMax
  )
    e.followup_delay_min = `O atraso precisa ser um número inteiro de 0 a ${LIMITS.delayMax} minutos.`;

  return e;
}

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** Slug aleatório base62 (10 caracteres por padrão). */
export function randomSlug(size = 10): string {
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < size) {
    crypto.getRandomValues(buf);
    if (buf[0] < 248) out.push(B62[buf[0] % 62]); // 248 = 4*62, sem viés
  }
  return out.join("");
}

type PgError = { code?: string; message?: string; details?: string } | null;
const isUniqueViolation = (err: PgError) => err?.code === "23505";
/** Conflito na unicidade (campaign_id, position): a linha já existe (o motor pode ter criado). */
const isPositionConflict = (err: PgError) =>
  `${err?.message ?? ""} ${err?.details ?? ""}`.includes("ig_tracked_links_campaign_position_key") ||
  /\(campaign_id, ?position\)/.test(err?.details ?? "");

async function updateUrlAt(campaignId: string, pos: 1 | 2, url: string) {
  const { data: row, error } = await supabase
    .from("ig_tracked_links")
    .select("id, url")
    .eq("campaign_id", campaignId)
    .eq("position", pos)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`Link ${pos} em conflito, mas não encontrado.`);
  if (row.url !== url) {
    const { error: upErr } = await supabase.from("ig_tracked_links").update({ url }).eq("id", row.id);
    if (upErr) throw upErr;
  }
}

/**
 * Sincroniza ig_tracked_links (posições 1 e 2) com as URLs da campanha:
 * cria (slug novo) ou atualiza a URL quando mudou. Link removido NÃO apaga a
 * linha: apagar levaria o histórico de cliques junto e quebraria botões já
 * enviados; o motor só monta botões para as URLs atuais da campanha.
 */
export async function syncTrackedLinks(campaignId: string, url1: string | null, url2: string | null) {
  const { data: rows, error } = await supabase
    .from("ig_tracked_links")
    .select("id, position, url")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  const wanted: Record<1 | 2, string | null> = { 1: url1?.trim() || null, 2: url2?.trim() || null };

  for (const pos of [1, 2] as const) {
    const row = (rows ?? []).find((r) => r.position === pos);
    const url = wanted[pos];
    if (!url) continue;
    if (row) {
      if (row.url !== url) {
        const { error: upErr } = await supabase.from("ig_tracked_links").update({ url }).eq("id", row.id);
        if (upErr) throw upErr;
      }
      continue;
    }
    let attempt = 0;
    for (;;) {
      const { error: insErr } = await supabase
        .from("ig_tracked_links")
        .insert({ campaign_id: campaignId, position: pos, slug: randomSlug(10), url });
      if (!insErr) break;
      if (isUniqueViolation(insErr) && isPositionConflict(insErr)) {
        await updateUrlAt(campaignId, pos, url);
        break;
      }
      // Conflito no slug: tenta outro slug.
      if (isUniqueViolation(insErr) && attempt++ < 3) continue;
      throw insErr;
    }
  }
}

export const POST_MODE_LABEL: Record<PostMode, string> = {
  post: "Post escolhido",
  any: "Qualquer post",
  next_reel: "Próximo reel",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviada",
  failed: "Falhou",
  skipped_dedup: "Ignorada (já respondida)",
  skipped_rate_limit: "Ignorada (limite por hora)",
  unconfirmed: "Não confirmada",
};

export const STATUS_CLASS: Record<string, string> = {
  pending: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  skipped_dedup: "bg-muted text-muted-foreground border-border",
  skipped_rate_limit: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  unconfirmed: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
};

export const PUBLIC_STATUS_LABEL: Record<string, string> = {
  sent: "Respondido",
  failed: "Falhou",
  unconfirmed: "Não confirmada",
};

export const SOURCE_LABEL: Record<string, string> = {
  webhook: "Comentário",
  polling: "Comentário (varredura)",
  dm: "DM / story",
  button: "Toque no botão",
  read: "Leitura",
  followup: "Follow-up",
};
