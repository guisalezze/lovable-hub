import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCopyItems } from "@/hooks/useCopyItems";
import { useCopyFiles } from "@/hooks/useCopyFiles";
import { useCopyProjects } from "@/hooks/useCopyProjects";
import { useProject } from "@/contexts/ProjectContext";
import { CopyItemBlock } from "@/components/copies/CopyItemBlock";
import { CopyFileUpload } from "@/components/copies/CopyFileUpload";
import { CopyVersionsDrawer } from "@/components/copies/CopyVersionsDrawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Upload, FileImage, FileText, Film, Trash2 } from "lucide-react";
import type { StructuredContent } from "@/hooks/useCopyItems";

const fileIcon = (type: string | null) => {
  if (!type) return <FileText className="h-8 w-8 text-muted-foreground" />;
  if (type.startsWith("image/")) return <FileImage className="h-8 w-8 text-blue-500" />;
  if (type.startsWith("video/")) return <Film className="h-8 w-8 text-purple-500" />;
  return <FileText className="h-8 w-8 text-muted-foreground" />;
};

export default function CopyProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentProject } = useProject();
  const isNutra = currentProject?.slug === "nutra";

  const { data: projects } = useCopyProjects();
  const project = projects?.find((p) => p.id === id);

  const {
    data: items,
    isLoading: itemsLoading,
    create,
    updateStructured,
    updateItem,
    remove: removeItem,
  } = useCopyItems(id);

  const { data: files, isLoading: filesLoading, upload, remove: removeFile } = useCopyFiles(id);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [versionsItemId, setVersionsItemId] = useState<string | undefined>();

  const criativos = items?.filter((i) => i.type === "criativo") || [];
  const ofertas = items?.filter((i) => i.type === "oferta") || [];

  const handleStructuredSave = (
    itemId: string,
    structured: StructuredContent,
    translated?: StructuredContent | null
  ) => {
    updateStructured.mutate({ id: itemId, structured_content: structured, translated_content: translated });
  };

  const renderItems = (type: string, list: typeof criativos) => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => create.mutate({ type, title: "" })}
        >
          <Plus className="h-3.5 w-3.5" /> Novo Bloco
        </Button>
      </div>
      {itemsLoading ? (
        Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40" />)
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum bloco criado ainda
        </p>
      ) : (
        list.map((item) => (
          <CopyItemBlock
            key={item.id}
            item={item}
            isNutra={isNutra}
            onStructuredSave={handleStructuredSave}
            onUpdate={(itemId, values) => updateItem.mutate({ id: itemId, ...values })}
            onDelete={(itemId) => removeItem.mutate(itemId)}
            onShowVersions={setVersionsItemId}
            isSaving={updateStructured.isPending}
          />
        ))
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/copies")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{project?.name || "Carregando..."}</h1>
          {project?.description && (
            <p className="text-sm text-muted-foreground">{project.description}</p>
          )}
        </div>
        {isNutra && (
          <span className="ml-auto text-xs text-muted-foreground border rounded px-2 py-0.5">
            🌐 Modo bilíngue (PT-BR / EN)
          </span>
        )}
      </div>

      <Tabs defaultValue="criativos">
        <TabsList>
          <TabsTrigger value="criativos">Criativos ({criativos.length})</TabsTrigger>
          <TabsTrigger value="oferta">Oferta ({ofertas.length})</TabsTrigger>
          <TabsTrigger value="referencias">Referências ({files?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="criativos" className="mt-4">
          {renderItems("criativo", criativos)}
        </TabsContent>

        <TabsContent value="oferta" className="mt-4">
          {renderItems("oferta", ofertas)}
        </TabsContent>

        <TabsContent value="referencias" className="mt-4">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setUploadOpen(true)}
              >
                <Upload className="h-3.5 w-3.5" /> Upload
              </Button>
            </div>
            {filesLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : !files?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma referência adicionada
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {files.map((f) => (
                  <div key={f.id} className="border rounded-lg p-3 space-y-2 group relative">
                    {f.file_type?.startsWith("image/") ? (
                      <img
                        src={f.file_url}
                        alt={f.file_name}
                        className="w-full h-24 object-cover rounded"
                      />
                    ) : (
                      <div className="h-24 flex items-center justify-center">
                        {fileIcon(f.file_type)}
                      </div>
                    )}
                    <p className="text-xs truncate">{f.file_name}</p>
                    <span className="text-[10px] text-muted-foreground">{f.file_size_kb} KB</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => removeFile.mutate({ id: f.id, fileUrl: f.file_url })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <CopyFileUpload
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={(uploadedFiles) =>
          uploadedFiles.forEach((file) => upload.mutate({ file, folder: "referencias" }))
        }
        isLoading={upload.isPending}
      />

      <CopyVersionsDrawer
        open={!!versionsItemId}
        onOpenChange={(o) => !o && setVersionsItemId(undefined)}
        copyItemId={versionsItemId}
        onRestore={(content) => {
          if (!versionsItemId) return;
          // Try to parse as structured content (JSON), fall back to plain text restore
          try {
            const parsed = JSON.parse(content) as StructuredContent;
            handleStructuredSave(versionsItemId, parsed);
          } catch {
            // Legacy plain-text version — nothing to do
          }
          setVersionsItemId(undefined);
        }}
      />
    </div>
  );
}
