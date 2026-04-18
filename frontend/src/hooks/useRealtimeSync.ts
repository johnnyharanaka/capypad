import { useEffect, useRef, useState } from "react";
import { API } from "@/api";

export interface PadRemoteUpdate {
  path: string;
  content: string;
  imageCount: number;
  imageCountLimit: number;
  totalImageBytes: number;
  totalImageBytesLimit: number;
  uploadBlocked: boolean;
  uploadBlockReason: string | null;
  maintenanceMode: boolean;
  blockFiles: boolean;
}

/**
 * Subscribes to SSE updates for a pad. Only keeps the connection open while
 * the tab is visible. Returns a stable clientId that should be sent as the
 * X-Client-Id header on PUTs so the server skips echoing updates back.
 */
export function useRealtimeSync(
  padPath: string,
  onUpdate: (pad: PadRemoteUpdate) => void,
): string {
  const [clientId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36),
  );

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!padPath) return;
    let source: EventSource | null = null;

    const open = () => {
      if (source) return;
      const url = `${API}/api/pad/${encodeURIComponent(padPath)}/events?clientId=${encodeURIComponent(clientId)}`;
      source = new EventSource(url, { withCredentials: true });
      source.addEventListener("update", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as PadRemoteUpdate;
          onUpdateRef.current(data);
        } catch {
          /* ignore malformed events */
        }
      });
    };

    const close = () => {
      if (source) {
        source.close();
        source = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") open();
      else close();
    };

    if (document.visibilityState === "visible") open();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      close();
    };
  }, [padPath, clientId]);

  return clientId;
}
