/**
 * Módulo de sons para notificações do PWA.
 * Usa Web Audio API — sem arquivos externos.
 *
 * iOS Safari/PWA exige que o AudioContext seja criado/retomado
 * após uma interação do usuário. Chame `unlockAudio()` no primeiro
 * clique/toque do usuário (feito no App.tsx).
 */

let ctx: AudioContext | null = null;

/** Chame no primeiro clique/toque para desbloquear o AudioContext no iOS */
export function unlockAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (ctx.state === "suspended") {
      ctx.resume();
    }
  } catch {
    // Ignorar — ambiente sem Web Audio API
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Som de venda aprovada — sequência ascendente tipo "cha-ching".
 * Três notas: Dó → Mi → Sol, rápidas e alegres.
 */
export function playSaleSound() {
  const audioCtx = getCtx();
  if (!audioCtx) return;

  // Garantir que o contexto está rodando
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  const notes = [
    { freq: 523.25, start: 0.0,  dur: 0.12 }, // Dó5
    { freq: 659.25, start: 0.1,  dur: 0.12 }, // Mi5
    { freq: 783.99, start: 0.2,  dur: 0.22 }, // Sol5 (mais longa)
  ];

  notes.forEach(({ freq, start, dur }) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);

    // Envelope: ataque rápido, decaimento suave
    gain.gain.setValueAtTime(0, audioCtx.currentTime + start);
    gain.gain.linearRampToValueAtTime(0.35, audioCtx.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);

    osc.start(audioCtx.currentTime + start);
    osc.stop(audioCtx.currentTime + start + dur + 0.05);
  });
}

/**
 * Som de tarefa atribuída — ding único, suave.
 * Uma nota mais grave e tranquila para não assustar.
 */
export function playTaskSound() {
  const audioCtx = getCtx();
  if (!audioCtx) return;

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(440, audioCtx.currentTime);       // Lá4
  osc.frequency.exponentialRampToValueAtTime(330, audioCtx.currentTime + 0.3); // desce suavemente

  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.55);
}
