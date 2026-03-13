import { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyFileUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (files: File[]) => void;
  isLoading?: boolean;
}

export function CopyFileUpload({ open, onOpenChange, onUpload, isLoading }: CopyFileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
  };

  const handleSubmit = () => {
    if (files.length) {
      onUpload(files);
      setFiles([]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload de Referências</DialogTitle>
        </DialogHeader>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          )}
          onClick={() => document.getElementById("copy-file-input")?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Arraste arquivos aqui ou clique para selecionar</p>
          <input id="copy-file-input" type="file" multiple className="hidden" onChange={handleFileSelect} />
        </div>
        {files.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-sm px-2 py-1 bg-muted rounded">
                <span className="truncate flex-1">{f.name}</span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button onClick={handleSubmit} disabled={!files.length || isLoading} className="w-full">
          Enviar {files.length > 0 && `(${files.length})`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
