import { useEffect, useState } from "react";
import { getMediaUrl } from "@/lib/whiteboard/mediaCache";

export interface OverlayTarget {
  id: string;
  fileId: string;
  kind: "audio" | "video";
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
}

/** Player de verdade sobre o áudio/vídeo selecionado (no resto do tempo o quadro mostra só o cartão). */
export function MediaOverlay({ target }: { target: OverlayTarget }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    void getMediaUrl(target.fileId).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [target.fileId]);

  const style: React.CSSProperties = {
    position: "absolute",
    left: target.left,
    top: target.top,
    width: target.width,
    height: target.height,
    transform: target.angle ? `rotate(${target.angle}rad)` : undefined,
    zIndex: 5,
  };

  if (failed) {
    return (
      <div style={style} className="flex items-center justify-center rounded border border-border bg-card text-xs text-muted-foreground">
        Não consegui abrir este arquivo.
      </div>
    );
  }
  if (!url) return <div style={style} className="rounded border border-border bg-card" />;

  return target.kind === "video" ? (
    <video key={url} src={url} controls style={style} className="rounded bg-black object-contain" />
  ) : (
    <audio key={url} src={url} controls style={{ ...style, height: Math.max(target.height, 40) }} />
  );
}
