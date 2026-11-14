import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  list: { data: [] as unknown[], isLoading: false, error: null as unknown },
  create: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  duplicate: vi.fn(),
}));

vi.mock("@/hooks/useWhiteboards", () => ({
  useWhiteboards: () => ({
    list: mocks.list,
    create: { mutateAsync: mocks.create, isPending: false },
    rename: { mutate: mocks.rename },
    duplicate: { mutate: mocks.duplicate },
    remove: { mutate: mocks.remove },
  }),
}));

vi.mock("@/components/quadro/BackupMenu", () => ({ BackupMenu: () => null }));

import Quadros from "./Quadros";

const boards = [
  { id: "b1", title: "Funil de vendas", thumbnail: null, created_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-12T10:00:00Z" },
  { id: "b2", title: "Aula 1", thumbnail: null, created_at: "2026-11-11T10:00:00Z", updated_at: "2026-11-13T10:00:00Z" },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/quadro"]}>
      <Routes>
        <Route path="/quadro" element={<Quadros />} />
        <Route path="/quadro/:id" element={<div>EDITOR ABERTO</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Quadros", () => {
  beforeEach(() => {
    mocks.list = { data: boards, isLoading: false, error: null };
    mocks.create.mockReset().mockResolvedValue({ id: "novo-id", title: "Sem título" });
    mocks.remove.mockReset();
    mocks.rename.mockReset();
    mocks.duplicate.mockReset();
  });

  it("lista os títulos dos quadros", () => {
    renderPage();
    expect(screen.getByText("Funil de vendas")).toBeInTheDocument();
    expect(screen.getByText("Aula 1")).toBeInTheDocument();
  });

  it("sem quadros mostra o estado vazio e o botão de criar", () => {
    mocks.list = { data: [], isLoading: false, error: null };
    renderPage();
    expect(screen.getByText("Nenhum quadro ainda")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /novo quadro/i }).length).toBeGreaterThan(0);
  });

  it("Novo quadro cria e abre o editor", async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: /novo quadro/i })[0]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("EDITOR ABERTO")).toBeInTheDocument());
  });

  it("clicar no cartão abre o quadro", () => {
    renderPage();
    fireEvent.click(screen.getByText("Aula 1"));
    expect(screen.getByText("EDITOR ABERTO")).toBeInTheDocument();
  });

  it("excluir pede confirmação antes de apagar", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: 'Excluir quadro "Aula 1"' }));
    expect(screen.getByText("Excluir este quadro?")).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(mocks.remove).toHaveBeenCalledWith("b2");
  });

  it("cancelar a exclusão não apaga nada", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: 'Excluir quadro "Funil de vendas"' }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("duplicar chama a ação com o id e não abre o quadro", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: 'Duplicar quadro "Aula 1"' }));
    expect(mocks.duplicate).toHaveBeenCalledWith("b2");
    expect(screen.queryByText("EDITOR ABERTO")).not.toBeInTheDocument();
  });

  it("falha ao carregar mostra mensagem em vez de tela vazia", () => {
    mocks.list = { data: undefined as unknown as unknown[], isLoading: false, error: new Error("falhou") };
    renderPage();
    expect(screen.getByText(/não consegui carregar os quadros/i)).toBeInTheDocument();
  });
});
