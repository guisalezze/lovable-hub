import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { docFromElements } from "@/lib/whiteboard/scene";

const mocks = vi.hoisted(() => ({
  fetchAllBoards: vi.fn(),
  insertBoards: vi.fn(),
  downloadBackup: vi.fn(),
  saveBackupToFolder: vi.fn(),
  folderPicker: vi.fn(),
  readBackupFile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/whiteboard/api", () => ({ fetchAllBoards: mocks.fetchAllBoards, insertBoards: mocks.insertBoards }));
vi.mock("@/lib/whiteboard/backupIo", () => ({
  downloadBackup: mocks.downloadBackup,
  saveBackupToFolder: mocks.saveBackupToFolder,
  folderPicker: mocks.folderPicker,
  readBackupFile: mocks.readBackupFile,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } } }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { BackupMenu } from "./BackupMenu";

const doc = docFromElements([]);
const boards = [{ id: "a", title: "Funil", doc }];

function renderMenu() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <BackupMenu />
    </QueryClientProvider>,
  );
  return qc;
}
const open = () => fireEvent.keyDown(screen.getByRole("button", { name: /backup/i }), { key: "Enter" });

beforeEach(() => {
  Object.values(mocks).forEach((m) => {
    if (typeof m === "function") (m as ReturnType<typeof vi.fn>).mockReset();
  });
  Object.values(mocks.toast).forEach((m) => m.mockReset());
  mocks.folderPicker.mockReturnValue(async () => ({}));
});

describe("BackupMenu: baixar", () => {
  it("lê todos os quadros e baixa o arquivo", async () => {
    mocks.fetchAllBoards.mockResolvedValue({ ok: true, boards, skipped: [] });
    renderMenu();
    open();
    fireEvent.click(screen.getByText(/Baixar backup/));
    await waitFor(() => expect(mocks.downloadBackup).toHaveBeenCalledWith(boards));
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it("sem quadros avisa em vez de baixar um arquivo vazio", async () => {
    mocks.fetchAllBoards.mockResolvedValue({ ok: true, boards: [], skipped: [] });
    renderMenu();
    open();
    fireEvent.click(screen.getByText(/Baixar backup/));
    await waitFor(() => expect(mocks.toast.info).toHaveBeenCalled());
    expect(mocks.downloadBackup).not.toHaveBeenCalled();
  });

  it("quadro ilegível fica de fora e a pessoa é avisada (nada de backup 'completo' falso)", async () => {
    mocks.fetchAllBoards.mockResolvedValue({ ok: true, boards, skipped: ["Estragado"] });
    renderMenu();
    open();
    fireEvent.click(screen.getByText(/Baixar backup/));
    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalled());
    expect(String(mocks.toast.warning.mock.calls[0][0])).toContain("Estragado");
  });

  it("falha de rede mostra erro", async () => {
    mocks.fetchAllBoards.mockResolvedValue({ ok: false });
    renderMenu();
    open();
    fireEvent.click(screen.getByText(/Baixar backup/));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(mocks.downloadBackup).not.toHaveBeenCalled();
  });
});

describe("BackupMenu: pasta", () => {
  it("salva numa pasta e conta quantos", async () => {
    mocks.fetchAllBoards.mockResolvedValue({ ok: true, boards, skipped: [] });
    mocks.saveBackupToFolder.mockResolvedValue({ ok: true, count: 1 });
    renderMenu();
    open();
    fireEvent.click(screen.getByText(/Salvar numa pasta/));
    await waitFor(() => expect(mocks.saveBackupToFolder).toHaveBeenCalled());
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
  });

  it("cancelar a escolha da pasta não mostra erro", async () => {
    mocks.fetchAllBoards.mockResolvedValue({ ok: true, boards, skipped: [] });
    mocks.saveBackupToFolder.mockResolvedValue({ ok: false, reason: "cancelled" });
    renderMenu();
    open();
    fireEvent.click(screen.getByText(/Salvar numa pasta/));
    await waitFor(() => expect(mocks.saveBackupToFolder).toHaveBeenCalled());
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("sem suporte do navegador, o item não aparece", () => {
    mocks.folderPicker.mockReturnValue(undefined);
    renderMenu();
    open();
    expect(screen.queryByText(/Salvar numa pasta/)).toBeNull();
  });
});

describe("BackupMenu: importar", () => {
  it("importa o backup escolhido e atualiza a lista", async () => {
    mocks.readBackupFile.mockResolvedValue({ ok: true, boards: [{ title: "Funil", doc }] });
    mocks.insertBoards.mockResolvedValue({ ok: true, count: 1 });
    const qc = renderMenu();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["{}"], "backup.json")] } });
    await waitFor(() => expect(mocks.insertBoards).toHaveBeenCalledWith([{ title: "Funil", doc }], "u1"));
    expect(invalidate).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it("arquivo inválido mostra a mensagem e não cria nada", async () => {
    mocks.readBackupFile.mockResolvedValue({ ok: false, error: "O arquivo não é um JSON válido." });
    renderMenu();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "x.json")] } });
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("O arquivo não é um JSON válido."));
    expect(mocks.insertBoards).not.toHaveBeenCalled();
  });

  it("falha ao criar os quadros mostra erro", async () => {
    mocks.readBackupFile.mockResolvedValue({ ok: true, boards: [{ title: "Funil", doc }] });
    mocks.insertBoards.mockResolvedValue({ ok: false });
    renderMenu();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["{}"], "b.json")] } });
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
  });

  it("escolher o mesmo arquivo duas vezes funciona (o campo é limpo depois)", async () => {
    mocks.readBackupFile.mockResolvedValue({ ok: false, error: "x" });
    renderMenu();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "x.json")] } });
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(input.value).toBe("");
  });
});
