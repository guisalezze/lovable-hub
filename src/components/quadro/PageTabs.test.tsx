import { render, fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PageTabs } from "./PageTabs";

const pages = [
  { id: "a", name: "Página 1" },
  { id: "b", name: "Funil" },
  { id: "c", name: "Aula" },
];

function setup(over: Partial<React.ComponentProps<typeof PageTabs>> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onMove: vi.fn(),
  };
  render(<PageTabs pages={pages} activeId="b" {...handlers} {...over} />);
  return handlers;
}

const openMenu = () => {
  const trigger = screen.getByLabelText("Mais ações da página");
  fireEvent.keyDown(trigger, { key: "Enter" });
};

describe("PageTabs", () => {
  it("mostra todas as páginas e marca a ativa", () => {
    setup();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Funil" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Aula" }).getAttribute("aria-selected")).toBe("false");
  });

  it("clicar numa aba escolhe a página", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("tab", { name: "Aula" }));
    expect(h.onSelect).toHaveBeenCalledWith("c");
  });

  it("o + cria uma página nova", () => {
    const h = setup();
    fireEvent.click(screen.getByLabelText("Nova página"));
    expect(h.onAdd).toHaveBeenCalledTimes(1);
  });

  it("duplo clique renomeia no lugar: Enter confirma", () => {
    const h = setup();
    fireEvent.doubleClick(screen.getByRole("tab", { name: "Funil" }));
    const input = screen.getByLabelText("Nome da página") as HTMLInputElement;
    expect(input.value).toBe("Funil");
    fireEvent.change(input, { target: { value: "Funil novo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.onRename).toHaveBeenCalledWith("b", "Funil novo");
  });

  it("Esc cancela a renomeação sem avisar ninguém", () => {
    const h = setup();
    fireEvent.doubleClick(screen.getByRole("tab", { name: "Funil" }));
    const input = screen.getByLabelText("Nome da página");
    fireEvent.change(input, { target: { value: "outro" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(h.onRename).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nome da página")).toBeNull();
  });

  it("sair do campo (clicar fora) confirma o novo nome uma vez só", () => {
    const h = setup();
    fireEvent.doubleClick(screen.getByRole("tab", { name: "Funil" }));
    const input = screen.getByLabelText("Nome da página");
    fireEvent.change(input, { target: { value: "Novo" } });
    fireEvent.blur(input);
    expect(h.onRename).toHaveBeenCalledTimes(1);
    expect(h.onRename).toHaveBeenCalledWith("b", "Novo");
  });

  it("o campo de nome não deixa atalhos do quadro dispararem (digitar é digitar)", () => {
    setup();
    fireEvent.doubleClick(screen.getByRole("tab", { name: "Funil" }));
    const input = screen.getByLabelText("Nome da página");
    expect(input.tagName).toBe("INPUT");
  });

  it("o menu da página ativa oferece duplicar, mover e excluir", () => {
    const h = setup();
    openMenu();
    fireEvent.click(screen.getByText("Duplicar página"));
    expect(h.onDuplicate).toHaveBeenCalledWith("b");
  });

  it("mover para a esquerda e para a direita", () => {
    const h = setup();
    openMenu();
    fireEvent.click(screen.getByText("Mover para a esquerda"));
    expect(h.onMove).toHaveBeenCalledWith("b", 0);
    openMenu();
    fireEvent.click(screen.getByText("Mover para a direita"));
    expect(h.onMove).toHaveBeenCalledWith("b", 2);
  });

  it("a primeira página não anda para a esquerda e a última não anda para a direita", () => {
    setup({ activeId: "a" });
    openMenu();
    expect(screen.getByText("Mover para a esquerda").closest("[role=menuitem]")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("excluir pede confirmação e só então exclui", () => {
    const h = setup();
    openMenu();
    fireEvent.click(screen.getByText("Excluir página"));
    expect(screen.getByText("Excluir esta página?")).toBeInTheDocument();
    expect(h.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(h.onDelete).toHaveBeenCalledWith("b");
  });

  it("cancelar a exclusão não exclui", () => {
    const h = setup();
    openMenu();
    fireEvent.click(screen.getByText("Excluir página"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(h.onDelete).not.toHaveBeenCalled();
  });

  it("com uma página só, não dá para excluir", () => {
    setup({ pages: [{ id: "a", name: "Página 1" }], activeId: "a" });
    openMenu();
    expect(screen.getByText("Excluir página").closest("[role=menuitem]")?.getAttribute("aria-disabled")).toBe("true");
  });
});
