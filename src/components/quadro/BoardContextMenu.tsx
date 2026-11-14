import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type MenuAction =
  | "copy"
  | "paste"
  | "duplicate"
  | "copy-style"
  | "paste-style"
  | "group"
  | "ungroup"
  | "front"
  | "forward"
  | "backward"
  | "back"
  | "lock"
  | "delete"
  | "align-left"
  | "align-center"
  | "align-right"
  | "align-top"
  | "align-middle"
  | "align-bottom";

interface Props {
  count: number;
  hasGroup: boolean;
  allLocked: boolean;
  canPaste: boolean;
  onAction: (action: MenuAction) => void;
  /** Roda antes de o menu abrir (para selecionar o que está sob o cursor). */
  onContextMenu: (e: React.MouseEvent) => void;
  children: ReactNode;
}

export function BoardContextMenu({ count, hasGroup, allLocked, canPaste, onAction, onContextMenu, children }: Props) {
  const none = count === 0;
  const item = (label: string, action: MenuAction, opts: { disabled?: boolean; shortcut?: string; destructive?: boolean } = {}) => (
    <ContextMenuItem
      disabled={opts.disabled}
      className={opts.destructive ? "text-destructive focus:text-destructive" : undefined}
      onSelect={() => onAction(action)}
    >
      {label}
      {opts.shortcut ? <ContextMenuShortcut>{opts.shortcut}</ContextMenuShortcut> : null}
    </ContextMenuItem>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {item("Copiar", "copy", { disabled: none, shortcut: "Ctrl+C" })}
        {item("Colar", "paste", { disabled: !canPaste, shortcut: "Ctrl+V" })}
        {item("Duplicar", "duplicate", { disabled: none, shortcut: "Ctrl+D" })}
        {item("Copiar formatação", "copy-style", { disabled: none, shortcut: "Ctrl+Alt+C" })}
        {item("Colar formatação", "paste-style", { disabled: none, shortcut: "Ctrl+Alt+V" })}
        <ContextMenuSeparator />
        {item("Agrupar", "group", { disabled: count < 2, shortcut: "Ctrl+G" })}
        {item("Desagrupar", "ungroup", { disabled: !hasGroup, shortcut: "Ctrl+Shift+G" })}
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={none}>Ordem</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            {item("Trazer para a frente", "front", { shortcut: "Ctrl+]" })}
            {item("Subir uma camada", "forward", { shortcut: "]" })}
            {item("Descer uma camada", "backward", { shortcut: "[" })}
            {item("Enviar para o fundo", "back", { shortcut: "Ctrl+[" })}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={count < 2}>Alinhar</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            {item("À esquerda", "align-left")}
            {item("Centralizar na horizontal", "align-center")}
            {item("À direita", "align-right")}
            {item("No topo", "align-top")}
            {item("Centralizar na vertical", "align-middle")}
            {item("Na base", "align-bottom")}
          </ContextMenuSubContent>
        </ContextMenuSub>
        {item(allLocked ? "Desbloquear" : "Bloquear", "lock", { disabled: none, shortcut: "Ctrl+Shift+L" })}
        <ContextMenuSeparator />
        {item("Excluir", "delete", { disabled: none, destructive: true, shortcut: "Del" })}
      </ContextMenuContent>
    </ContextMenu>
  );
}
