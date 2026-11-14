import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { usePresentationMode } from "./usePresentationMode";
import { resolveShortcut } from "@/lib/whiteboard/shortcuts";

function makeRoot(requestFullscreen?: () => Promise<void>) {
  const el = document.createElement("div") as HTMLElement & { requestFullscreen?: () => Promise<void> };
  if (requestFullscreen) el.requestFullscreen = requestFullscreen;
  return { current: el };
}

function setFullscreenElement(value: Element | null) {
  Object.defineProperty(document, "fullscreenElement", { value, configurable: true });
}

afterEach(() => {
  setFullscreenElement(null);
  delete (document as unknown as { exitFullscreen?: unknown }).exitFullscreen;
});

describe("usePresentationMode", () => {
  it("entrar liga o modo e pede tela cheia ao elemento do quadro", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const root = makeRoot(request);
    const { result } = renderHook(() => usePresentationMode(root));
    expect(result.current.active).toBe(false);
    await act(async () => {
      await result.current.enter();
    });
    expect(result.current.active).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("sem suporte a tela cheia ainda esconde as barras", async () => {
    const root = makeRoot(undefined);
    const { result } = renderHook(() => usePresentationMode(root));
    await act(async () => {
      await result.current.enter();
    });
    expect(result.current.active).toBe(true);
  });

  it("tela cheia recusada pelo navegador não derruba o modo", async () => {
    const root = makeRoot(vi.fn().mockRejectedValue(new Error("negado")));
    const { result } = renderHook(() => usePresentationMode(root));
    await act(async () => {
      await result.current.enter();
    });
    expect(result.current.active).toBe(true);
  });

  it("sair desliga o modo e sai da tela cheia se estiver nela", async () => {
    const exit = vi.fn().mockResolvedValue(undefined);
    (document as unknown as { exitFullscreen: unknown }).exitFullscreen = exit;
    const root = makeRoot(vi.fn().mockResolvedValue(undefined));
    const { result } = renderHook(() => usePresentationMode(root));
    await act(async () => {
      await result.current.enter();
    });
    setFullscreenElement(root.current);
    await act(async () => {
      await result.current.exit();
    });
    expect(result.current.active).toBe(false);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("Esc no navegador (fullscreenchange sem elemento) desliga o modo", async () => {
    const root = makeRoot(vi.fn().mockResolvedValue(undefined));
    const { result } = renderHook(() => usePresentationMode(root));
    await act(async () => {
      await result.current.enter();
    });
    setFullscreenElement(root.current);
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.active).toBe(true); // ainda em tela cheia
    setFullscreenElement(null);
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.active).toBe(false);
  });
});

describe("atalho F", () => {
  const key = (k: string, extra: Record<string, unknown> = {}) => ({
    key: k, ctrlKey: false, metaKey: false, shiftKey: false, target: document.body as EventTarget | null, ...extra,
  });

  it("F liga o modo apresentação", () => {
    expect(resolveShortcut(key("f"))).toEqual({ kind: "presentation" });
  });

  it("F não faz nada dentro de um campo de texto nem com Ctrl", () => {
    expect(resolveShortcut(key("f", { target: document.createElement("input") }))).toBeNull();
    expect(resolveShortcut(key("f", { ctrlKey: true }))).toBeNull();
  });
});
