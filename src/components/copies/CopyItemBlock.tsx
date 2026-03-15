import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Languages,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyBodyEditor } from "./CopyBodyEditor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CopyItem, StructuredContent, CopyHook } from "@/hooks/useCopyItems";
import { defaultStructuredContent } from "@/hooks/useCopyItems";

interface CopyItemBlockProps {
  item: CopyItem;
  isNutra: boolean;
  onStructuredSave: (
    id: string,
    structured: StructuredContent,
    translated?: StructuredContent | null
  ) => void;
  onUpdate: (id: string, values: { title?: string; tags?: string[]; is_validated?: boolean }) => void;
  onDelete: (id: string) => void;
  onShowVersions: (id: string) => void;
  isSaving?: boolean;
}

export function CopyItemBlock({
  item,
  isNutra,
  onStructuredSave,
  onUpdate,
  onDelete,
  onShowVersions,
  isSaving,
}: CopyItemBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [title, setTitle] = useState(item.title);
  const [newTag, setNewTag] = useState("");
  const [translating, setTranslating] = useState(false);

  // PT-BR structured content
  const [ptContent, setPtContent] = useState<StructuredContent>(
    item.structured_content ?? defaultStructuredContent()
  );

  // EN translated content (only used when isNutra)
  const [enContent, setEnContent] = useState<StructuredContent>(
    item.translated_content ?? defaultStructuredContent()
  );

  // Sync when item changes externally (e.g. after save)
  useEffect(() => {
    setPtContent(item.structured_content ?? defaultStructuredContent());
    setEnContent(item.translated_content ?? defaultStructuredContent());
    setTitle(item.title);
  }, [item.id]); // only on id change to avoid overwriting while editing

  // ───────── Hooks helpers ─────────
  const updatePtHook = (index: number, field: keyof CopyHook, value: string) => {
    setPtContent((prev) => {
      const hooks = [...prev.hooks];
      hooks[index] = { ...hooks[index], [field]: value };
      return { ...prev, hooks };
    });
  };

  const addPtHook = () => {
    setPtContent((prev) => ({
      ...prev,
      hooks: [...prev.hooks, { headline: "", hook: "" }],
    }));
  };

  const removePtHook = (index: number) => {
    setPtContent((prev) => ({
      ...prev,
      hooks: prev.hooks.filter((_, i) => i !== index),
    }));
  };

  const updateEnHook = (index: number, field: keyof CopyHook, value: string) => {
    setEnContent((prev) => {
      const hooks = [...prev.hooks];
      hooks[index] = { ...hooks[index], [field]: value };
      return { ...prev, hooks };
    });
  };

  const addEnHook = () => {
    setEnContent((prev) => ({
      ...prev,
      hooks: [...prev.hooks, { headline: "", hook: "" }],
    }));
  };

  const removeEnHook = (index: number) => {
    setEnContent((prev) => ({
      ...prev,
      hooks: prev.hooks.filter((_, i) => i !== index),
    }));
  };

  // ───────── Auto-translate ─────────
  const handleTranslate = useCallback(async () => {
    // Collect all PT-BR texts to translate
    const hookHeadlines = ptContent.hooks.map((h) => h.headline);
    const hookTexts = ptContent.hooks.map((h) => h.hook);
    const texts = [...hookHeadlines, ...hookTexts, ptContent.body, ptContent.cta];

    setTranslating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-copy`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ texts, targetLang: "en" }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        if (err.error?.includes("GOOGLE_TRANSLATE_API_KEY")) {
          toast.error("Chave da API do Google Translate não configurada. Adicione GOOGLE_TRANSLATE_API_KEY nos secrets do Supabase.");
        } else {
          toast.error(err.error || "Erro ao traduzir");
        }
        return;
      }

      const { translations } = await res.json();
      const n = ptContent.hooks.length;

      const translated: StructuredContent = {
        hooks: ptContent.hooks.map((_, i) => ({
          headline: translations[i] ?? "",
          hook: translations[n + i] ?? "",
        })),
        body: translations[2 * n] ?? "",
        cta: translations[2 * n + 1] ?? "",
      };

      setEnContent(translated);
      toast.success("Tradução concluída!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao traduzir");
    } finally {
      setTranslating(false);
    }
  }, [ptContent]);

  // ───────── Save ─────────
  const handleSave = () => {
    onStructuredSave(item.id, ptContent, isNutra ? enContent : null);
  };

  // ───────── Title / Tags ─────────
  const handleTitleBlur = () => {
    if (title !== item.title) onUpdate(item.id, { title });
  };

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    const updated = [...(item.tags || []), newTag.trim()];
    onUpdate(item.id, { tags: updated });
    setNewTag("");
  };

  const handleRemoveTag = (tag: string) => {
    onUpdate(item.id, { tags: (item.tags || []).filter((t) => t !== tag) });
  };

  // ───────── Columns renderer ─────────
  const renderColumn = (
    lang: "pt" | "en",
    content: StructuredContent,
    setContent: React.Dispatch<React.SetStateAction<StructuredContent>>,
    hookFns: {
      updateHook: (i: number, f: keyof CopyHook, v: string) => void;
      addHook: () => void;
      removeHook: (i: number) => void;
    }
  ) => (
    <div className="flex-1 min-w-0 space-y-4">
      {/* Label */}
      {isNutra && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-base">{lang === "pt" ? "🇧🇷" : "🇺🇸"}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {lang === "pt" ? "Português" : "English"}
          </span>
        </div>
      )}

      {/* Hooks */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Hooks
        </p>
        <div className="space-y-3">
          {content.hooks.map((h, i) => (
            <div key={i} className="space-y-1.5 relative group/hook">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-muted-foreground w-5 shrink-0">
                  #{i + 1}
                </span>
                <Input
                  value={h.headline}
                  onChange={(e) => hookFns.updateHook(i, "headline", e.target.value)}
                  placeholder={lang === "pt" ? "Headline..." : "Headline 1..."}
                  className="h-8 text-sm font-medium"
                />
                {content.hooks.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover/hook:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={() => hookFns.removeHook(i)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="pl-6">
                <Input
                  value={h.hook}
                  onChange={(e) => hookFns.updateHook(i, "hook", e.target.value)}
                  placeholder={lang === "pt" ? "Texto do hook..." : `Hook ${i + 1}...`}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={hookFns.addHook}
          className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Adicionar hook
        </button>
      </div>

      {/* Body */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Body
        </p>
        <CopyBodyEditor
          value={content.body}
          onChange={(html) => setContent((prev) => ({ ...prev, body: html }))}
          placeholder={
            lang === "pt" ? "Escreva o corpo da copy aqui..." : "Write the body here..."
          }
        />
      </div>

      {/* CTA */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          CTA
        </p>
        <Input
          value={content.cta}
          onChange={(e) => setContent((prev) => ({ ...prev, cta: e.target.value }))}
          placeholder={lang === "pt" ? "Chamada para ação..." : "Call to action..."}
          className="text-sm"
        />
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "border rounded-lg bg-card transition-all",
        item.is_validated && "border-green-500/50 bg-green-500/5"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          className="border-none bg-transparent p-0 h-auto text-sm font-semibold focus-visible:ring-0 flex-1"
          placeholder="Título do bloco..."
        />
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onUpdate(item.id, { is_validated: !item.is_validated })}
            title={item.is_validated ? "Desvalidar" : "Validar bloco"}
          >
            <CheckCircle2
              className={cn("h-3.5 w-3.5", item.is_validated ? "text-green-500" : "text-muted-foreground")}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onShowVersions(item.id)}
            title="Histórico de versões"
          >
            <History className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => onDelete(item.id)}
            title="Excluir bloco"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 py-4 space-y-4">
          {/* Columns: PT-BR + EN (Nutra) or just PT-BR */}
          <div className={cn("flex gap-6", isNutra && "divide-x divide-border")}>
            {/* PT-BR Column */}
            <div className={cn("flex-1 min-w-0", isNutra && "pr-6")}>
              {renderColumn("pt", ptContent, setPtContent, {
                updateHook: updatePtHook,
                addHook: addPtHook,
                removeHook: removePtHook,
              })}
            </div>

            {/* EN Column (Nutra only) */}
            {isNutra && (
              <div className="flex-1 min-w-0 pl-6">
                {renderColumn("en", enContent, setEnContent, {
                  updateHook: updateEnHook,
                  addHook: addEnHook,
                  removeHook: removeEnHook,
                })}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t">
            {(item.tags || []).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs gap-1 cursor-pointer"
                onClick={() => handleRemoveTag(tag)}
              >
                {tag} <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
            <div className="flex items-center gap-1">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                className="h-6 w-24 text-xs"
                placeholder="Tag..."
              />
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAddTag}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            {isNutra && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTranslate}
                disabled={translating}
                className="gap-1.5 text-xs"
              >
                {translating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Languages className="h-3.5 w-3.5" />
                )}
                {translating ? "Traduzindo..." : "Traduzir automaticamente"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="gap-1.5 text-xs"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Salvar Copy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
