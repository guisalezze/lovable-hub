/**
 * Módulo de sons para notificações do PWA.
 * Usa arquivos de áudio em public/sounds/.
 *
 * unlockAudio() ainda é necessário no iOS Safari/PWA para desbloquear
 * o contexto de áudio na primeira interação do usuário.
 */

/** Chame no primeiro clique/toque para desbloquear áudio no iOS */
export function unlockAudio() {
  // Cria e descarta um Audio silencioso para desbloquear o contexto no iOS
  try {
    const silent = new Audio();
    silent.play().catch(() => {});
  } catch {
    // Ignorar
  }
}

function playFile(src: string) {
  try {
    const audio = new Audio(src);
    audio.play().catch(() => {});
  } catch {
    // Ignorar — ambiente sem suporte a Audio
  }
}

/** Som de venda aprovada */
export function playSaleSound() {
  playFile("/sounds/venda.mp3");
}

/** Som de tarefa atribuída */
export function playTaskSound() {
  playFile("/sounds/tarefa.mp3");
}
