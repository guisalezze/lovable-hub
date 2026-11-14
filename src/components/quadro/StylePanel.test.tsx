import { render, fireEvent, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { StylePanel } from "./StylePanel";

const base = { style: {}, onChange: vi.fn() };

afterEach(() => {
  delete (window as unknown as { EyeDropper?: unknown }).EyeDropper;
});

describe("StylePanel: cores favoritas", () => {
  it("mostra as favoritas no traço e no fundo, e clicar aplica", () => {
    const onChange = vi.fn();
    render(<StylePanel {...base} onChange={onChange} favorites={["#aabbcc"]} onAddFavorite={vi.fn()} onRemoveFavorite={vi.fn()} />);
    const faves = screen.getAllByLabelText("Cor favorita #aabbcc");
    expect(faves).toHaveLength(2); // uma em "Traço", outra em "Fundo"
    fireEvent.click(faves[0]);
    expect(onChange).toHaveBeenLastCalledWith({ strokeColor: "#aabbcc" });
    fireEvent.click(faves[1]);
    expect(onChange).toHaveBeenLastCalledWith({ backgroundColor: "#aabbcc" });
  });

  it("clique direito numa favorita a remove", () => {
    const onRemove = vi.fn();
    render(<StylePanel {...base} favorites={["#aabbcc"]} onAddFavorite={vi.fn()} onRemoveFavorite={onRemove} />);
    fireEvent.contextMenu(screen.getAllByLabelText("Cor favorita #aabbcc")[0]);
    expect(onRemove).toHaveBeenCalledWith("#aabbcc");
  });

  it("escolher uma cor no seletor aplica e guarda como favorita", () => {
    const onChange = vi.fn();
    const onAdd = vi.fn();
    render(<StylePanel {...base} onChange={onChange} favorites={[]} onAddFavorite={onAdd} onRemoveFavorite={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Escolher outra cor do traço"), { target: { value: "#123456" } });
    expect(onChange).toHaveBeenLastCalledWith({ strokeColor: "#123456" });
    expect(onAdd).toHaveBeenCalledWith("#123456");
    fireEvent.change(screen.getByLabelText("Escolher outra cor do fundo"), { target: { value: "#654321" } });
    expect(onChange).toHaveBeenLastCalledWith({ backgroundColor: "#654321" });
  });

  it("sem os callbacks (uso antigo) o painel continua funcionando", () => {
    render(<StylePanel {...base} />);
    expect(screen.getByLabelText("Automático (cor do tema)")).toBeInTheDocument();
  });
});

describe("StylePanel: conta-gotas", () => {
  it("sem suporte do navegador, o botão não aparece", () => {
    render(<StylePanel {...base} />);
    expect(screen.queryByLabelText("Conta-gotas do traço")).toBeNull();
  });

  it("com suporte, pega a cor da tela e aplica e guarda", async () => {
    class FakeEyeDropper {
      open() {
        return Promise.resolve({ sRGBHex: "#FF0000" });
      }
    }
    (window as unknown as { EyeDropper: unknown }).EyeDropper = FakeEyeDropper;
    const onChange = vi.fn();
    const onAdd = vi.fn();
    render(<StylePanel {...base} onChange={onChange} onAddFavorite={onAdd} onRemoveFavorite={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Conta-gotas do traço"));
    });
    expect(onChange).toHaveBeenLastCalledWith({ strokeColor: "#ff0000" });
    expect(onAdd).toHaveBeenCalledWith("#ff0000");
  });

  it("cancelar o conta-gotas (Esc) não muda nada nem dá erro", async () => {
    class CancelledEyeDropper {
      open() {
        return Promise.reject(new DOMException("cancelado", "AbortError"));
      }
    }
    (window as unknown as { EyeDropper: unknown }).EyeDropper = CancelledEyeDropper;
    const onChange = vi.fn();
    render(<StylePanel {...base} onChange={onChange} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Conta-gotas do fundo"));
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
