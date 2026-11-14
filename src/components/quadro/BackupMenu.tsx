import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eraser, FolderDown, HardDriveDownload, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteFiles, scanUnusedFiles } from "@/lib/whiteboard/supabaseMedia";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllBoards, insertBoards } from "@/lib/whiteboard/api";
import { downloadBackup, folderPicker, readBackupFile, saveBackupToFolder } from "@/lib/whiteboard/backupIo";

/** Backup de todos os quadros: num arquivo, numa pasta do computador, e o caminho de volta (importar). */
export function BackupMenu() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const canPickFolder = !!folderPicker();
  const [cleanup, setCleanup] = useState<string[] | null>(null);

  const startCleanup = async () => {
    const scan = await scanUnusedFiles();
    if (!("unused" in scan)) {
      toast.error(
        scan.reason === "unreadable"
          ? "Algum quadro não pôde ser lido, então não limpei nada para não apagar arquivo em uso."
          : "Não consegui conferir os arquivos. Tente de novo em instantes.",
      );
      return;
    }
    if (scan.unused.length === 0) {
      toast.info("Nenhum arquivo sem uso. Está tudo limpo.");
      return;
    }
    setCleanup(scan.unused);
  };

  const confirmCleanup = async () => {
    const names = cleanup;
    setCleanup(null);
    if (!names) return;
    if (await deleteFiles(names)) toast.success(`${names.length} ${names.length === 1 ? "arquivo apagado" : "arquivos apagados"}.`);
    else toast.error("Não consegui apagar os arquivos.");
  };

  /** Lê todos os quadros; avisa dos que não deu para ler. Devolve null se não há o que guardar. */
  const loadBoards = async () => {
    const r = await fetchAllBoards();
    if (!("boards" in r)) {
      toast.error("Não consegui ler os quadros. Tente de novo em instantes.");
      return null;
    }
    if (r.boards.length === 0) {
      toast.info("Você ainda não tem quadros para guardar.");
      return null;
    }
    if (r.skipped.length > 0) {
      toast.warning(`Não deu para ler estes quadros, que ficaram de fora do backup: ${r.skipped.join(", ")}.`);
    }
    return r.boards;
  };

  const exportAll = async () => {
    const boards = await loadBoards();
    if (!boards) return;
    downloadBackup(boards);
    toast.success(`Backup com ${boards.length} ${boards.length === 1 ? "quadro baixado" : "quadros baixado"}.`);
  };

  const exportFolder = async () => {
    const boards = await loadBoards();
    if (!boards) return;
    const result = await saveBackupToFolder(boards, folderPicker());
    if ("count" in result) toast.success(`${result.count} ${result.count === 1 ? "quadro salvo" : "quadros salvos"} na pasta.`);
    else if (result.reason === "unsupported") toast.error("Este navegador não permite salvar numa pasta. Use o backup em arquivo.");
    else if (result.reason === "error") toast.error(`Não consegui salvar tudo na pasta (${result.saved ?? 0} salvos antes do erro).`);
    // cancelado: a pessoa desistiu, não é erro
  };

  const importFile = async (file: File) => {
    const parsed = await readBackupFile(file);
    if (!("boards" in parsed)) {
      toast.error(parsed.error);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const result = await insertBoards(parsed.boards, user?.id ?? null);
    if (result.ok) {
      queryClient.invalidateQueries({ queryKey: ["whiteboards"] });
      toast.success(`${result.count} ${result.count === 1 ? "quadro importado" : "quadros importados"}.`);
    } else {
      toast.error("Não consegui importar. Nenhum quadro foi criado.");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">
            <HardDriveDownload className="mr-2 h-4 w-4" />
            Backup
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={() => void exportAll()}>
            <Download className="mr-2 h-4 w-4" />
            Baixar backup (todos os quadros)
          </DropdownMenuItem>
          {canPickFolder ? (
            <DropdownMenuItem onSelect={() => void exportFolder()}>
              <FolderDown className="mr-2 h-4 w-4" />
              Salvar numa pasta do computador…
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void startCleanup()}>
            <Eraser className="mr-2 h-4 w-4" />
            Limpar arquivos não usados…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Importar backup…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={async (e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          if (file) await importFile(file);
          input.value = ""; // permite escolher o mesmo arquivo de novo
        }}
      />
      <AlertDialog open={!!cleanup} onOpenChange={(open) => !open && setCleanup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar arquivos sem uso?</AlertDialogTitle>
            <AlertDialogDescription>
              {cleanup ? `${cleanup.length} ${cleanup.length === 1 ? "arquivo não aparece" : "arquivos não aparecem"} em nenhum quadro. Apagar libera espaço e não dá para desfazer.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmCleanup()}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
