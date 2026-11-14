import { describe, it, expect } from "vitest";
import { addFavorite, isHexColor, normalizeHex, removeFavorite, FAVORITES_LIMIT, parseFavorites } from "./colors";

describe("normalizeHex / isHexColor", () => {
  it("aceita #rgb e #rrggbb, em qualquer caixa, e devolve #rrggbb minúsculo", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#FFD43B")).toBe("#ffd43b");
    expect(normalizeHex("  #ffd43b ")).toBe("#ffd43b");
  });

  it("recusa o que não é cor hexadecimal", () => {
    for (const bad of ["red", "#12", "#12345", "#gggggg", "rgb(1,2,3)", "", "ffd43b", '#fff" onclick="x']) {
      expect(normalizeHex(bad)).toBeNull();
      expect(isHexColor(bad)).toBe(false);
    }
    expect(isHexColor("#fff")).toBe(true);
  });
});

describe("favoritos", () => {
  it("a cor nova entra no começo, normalizada", () => {
    expect(addFavorite(["#111111"], "#ABCDEF")).toEqual(["#abcdef", "#111111"]);
  });

  it("repetida sobe para o começo em vez de duplicar", () => {
    expect(addFavorite(["#111111", "#222222"], "#222222")).toEqual(["#222222", "#111111"]);
  });

  it("cor inválida é ignorada (mesma lista)", () => {
    const list = ["#111111"];
    expect(addFavorite(list, "azul")).toBe(list);
  });

  it(`guarda no máximo ${FAVORITES_LIMIT}: a mais antiga sai`, () => {
    let list: string[] = [];
    for (let i = 0; i < FAVORITES_LIMIT + 3; i++) list = addFavorite(list, `#${String(i).padStart(6, "0")}`);
    expect(list).toHaveLength(FAVORITES_LIMIT);
    expect(list[0]).toBe(`#${String(FAVORITES_LIMIT + 2).padStart(6, "0")}`);
    expect(list).not.toContain("#000000");
  });

  it("remover tira a cor, e remover o que não existe devolve a mesma lista", () => {
    expect(removeFavorite(["#111111", "#222222"], "#111111")).toEqual(["#222222"]);
    const list = ["#111111"];
    expect(removeFavorite(list, "#999999")).toBe(list);
  });
});

describe("parseFavorites: o que veio do armazenamento do navegador", () => {
  it("lê uma lista válida", () => {
    expect(parseFavorites('["#aabbcc","#112233"]')).toEqual(["#aabbcc", "#112233"]);
  });

  it("descarta lixo e valores inválidos, normaliza e tira repetidos", () => {
    expect(parseFavorites('["#aabbcc", 5, "azul", null, "#ABC", "#112233"]')).toEqual(["#aabbcc", "#112233"]);
  });

  it("não passa do limite", () => {
    const many = JSON.stringify(Array.from({ length: 40 }, (_, i) => `#${String(i).padStart(6, "0")}`));
    expect(parseFavorites(many)).toHaveLength(FAVORITES_LIMIT);
  });

  it("JSON quebrado ou de outro tipo vira lista vazia", () => {
    expect(parseFavorites("{não é json")).toEqual([]);
    expect(parseFavorites('{"a":1}')).toEqual([]);
    expect(parseFavorites(null)).toEqual([]);
  });
});
