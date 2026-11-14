export type ElementType =
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "line"
  | "arrow"
  | "freedraw"
  | "text";

export type Tool =
  | "select"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "pencil"
  | "text"
  | "eraser"
  | "laser"
  | "hand";

/** Elemento do quadro. A ordem no array é a ordem de camadas (o último fica por cima). */
export interface WbElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  /** line/arrow/freedraw: pontos relativos a (x, y) */
  points?: [number, number][];
  /** arrow/line de 2 pontos: ponto de controle da curva (relativo a x,y, como os pontos). Sem isto, a linha é reta. */
  bend?: [number, number];
  /** arrow: ids das formas a que cada ponta está presa (a seta acompanha a forma quando ela se move). */
  bindings?: { start?: string; end?: string };
  /** type "text": conteúdo (linhas separadas por 
) e tamanho da fonte */
  text?: string;
  fontSize?: number;
  /** "auto" = cor de texto do tema */
  strokeColor: string;
  /** "transparent" = sem preenchimento */
  backgroundColor: string;
  strokeWidth: number;
  roundness: "sharp" | "round";
  seed: number;
  groupId: string | null;
  locked: boolean;
}

/** (x, y) = ponto do mundo no canto superior esquerdo da tela */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Scene {
  version: 1;
  elements: WbElement[];
}

/** Coordenadas do mundo; t em ms */
export interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

export interface LaserTrail {
  points: LaserPoint[];
  ended: number | null;
}

/** Propriedades de aparência que o painel de estilo edita. */
export type StylePatch = Partial<Pick<WbElement, "strokeColor" | "backgroundColor" | "strokeWidth" | "roundness" | "fontSize">>;
