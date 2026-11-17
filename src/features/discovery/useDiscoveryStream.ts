import { useEffect, useState } from "react";

type Frame = { image: string | null; url?: string };

export function useDiscoveryStream(projectId?: string) {
  const [frame, setFrame] = useState<Frame | null>(null);
  useEffect(() => {
    setFrame(null);
    if (!projectId) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    async function connect() {
      try {
        const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
        const headers: Record<string, string> = { Accept: "text/event-stream" };
        if (import.meta.env.VITE_API_KEY) headers["X-API-Key"] = import.meta.env.VITE_API_KEY;
        const response = await fetch(`${base}/application-maps/projects/${projectId}/live-stream`, {
          headers, signal: controller.signal, cache: "no-store",
        });
        if (!response.ok || !response.body) throw new Error("Stream unavailable");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        try {
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            let boundary: number;
            while ((boundary = pending.indexOf("\n\n")) !== -1) {
              const event = pending.slice(0, boundary);
              pending = pending.slice(boundary + 2);
              const data = event.split("\n").find(line => line.startsWith("data: "));
              if (data) {
                const next = JSON.parse(data.slice(6)) as Frame;
                if (!controller.signal.aborted) setFrame(next.image ? next : null);
              }
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      } catch {
        // Keep the saved screenshot visible while the stream reconnects.
      }
      if (!controller.signal.aborted) {
        setFrame(null);
        retry = setTimeout(connect, 2000);
      }
    }
    void connect();
    return () => { controller.abort(); if (retry) clearTimeout(retry); };
  }, [projectId]);
  return frame;
}
