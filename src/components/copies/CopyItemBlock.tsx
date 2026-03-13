import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronDown, ChevronUp, Clock, History, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CopyItem } from "@/hooks/useCopyItems";

interface CopyItemBlockProps {
  item: CopyItem;
  onContentSave: (id: string, content: string) => void;
  onUpdate: (id: string, values: { title?: string; tags?: string[]; is_validated?: boolean }) => void;
  onDelete: (id: string) => void;
  onShowVersions: (id: string) => void;
}

export function CopyItemBlock({ item, onContentSave, onUpdate, onDelete, onShowVersions }: CopyItemBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [content, setContent] = useState(item.content);
  const [title, setTitle] = useState(item.title);
  const [newTag, setNewTag] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentChanged = useRef(false);

  useEffect(() => {
    setContent(item.content);
    setTitle(item.title);
  }, [item.content, item.title]);

  const debounceSave = useCallback(
    (value: string) => {
      contentChanged.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onContentSave(item.id, value);
        setLastSaved(new Date());
        contentChanged.current = false;
      }, 3000);
    },
    [item.id, onContentSave]
  );

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    debounceSave(val);
  };

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

  return (
    <Card className={cn("transition-all", item.is_validated && "border-green-500/50 bg-green-500/5")}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)}>
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
            {lastSaved && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {lastSaved.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onUpdate(item.id, { is_validated: !item.is_validated })}
              title={item.is_validated ? "Desvalidar" : "Validar"}
            >
              <CheckCircle2 className={cn("h-3.5 w-3.5", item.is_validated ? "text-green-500" : "text-muted-foreground")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onShowVersions(item.id)}>
              <History className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(item.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <Textarea
            value={content}
            onChange={handleContentChange}
            placeholder="Escreva sua copy aqui..."
            className="min-h-[120px] resize-y text-sm"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {(item.tags || []).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => handleRemoveTag(tag)}>
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
        </CardContent>
      )}
    </Card>
  );
}
