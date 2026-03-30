import { useRef, useEffect, useCallback } from "react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyBodyEditorProps {
  value: string; // HTML string
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

export function CopyBodyEditor({
  value,
  onChange,
  placeholder = "Escreva o corpo da copy aqui...",
  className,
  readOnly = false,
}: CopyBodyEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  const lastValue = useRef(value);

  // Sync value → DOM only when value changes externally (not while typing)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return; // user is typing — don't overwrite
    if (value !== lastValue.current) {
      el.innerHTML = DOMPurify.sanitize(value);
      lastValue.current = value;
    }
  }, [value]);

  // Initial render
  useEffect(() => {
    const el = editorRef.current;
    if (el && value) {
      el.innerHTML = DOMPurify.sanitize(value);
      lastValue.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = useCallback(() => {
    if (isComposing.current) return;
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastValue.current = html;
    onChange(html === "<br>" ? "" : html);
  }, [onChange]);

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    // Trigger onChange after command
    setTimeout(() => {
      const el = editorRef.current;
      if (!el) return;
      const html = el.innerHTML;
      lastValue.current = html;
      onChange(html === "<br>" ? "" : html);
    }, 0);
  };

  const ToolbarBtn = ({
    onClick,
    title,
    children,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault(); // prevent editor blur
        onClick();
      }}
    >
      {children}
    </Button>
  );

  return (
    <div className={cn("border rounded-md overflow-hidden", className)}>
      {!readOnly && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/30">
          <ToolbarBtn onClick={() => exec("bold")} title="Negrito (Ctrl+B)">
            <Bold className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => exec("italic")} title="Itálico (Ctrl+I)">
            <Italic className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarBtn onClick={() => exec("insertUnorderedList")} title="Lista">
            <List className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => exec("insertOrderedList")} title="Lista numerada">
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarBtn>
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onCompositionStart={() => { isComposing.current = true; }}
        onCompositionEnd={() => {
          isComposing.current = false;
          handleInput();
        }}
        data-placeholder={placeholder}
        className={cn(
          "min-h-[120px] px-3 py-2 text-sm outline-none",
          "prose prose-sm dark:prose-invert max-w-none",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none",
          readOnly && "cursor-default select-text"
        )}
      />
    </div>
  );
}
