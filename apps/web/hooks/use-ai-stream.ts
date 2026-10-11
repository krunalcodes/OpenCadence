import { useCallback, useEffect, useRef, useState } from "react";
import { splitTrailer, streamAi } from "@/lib/ai-stream";
import { type ApiError, type Row, toApiError } from "@/lib/api";

export type AiStreamStatus =
  | "idle"
  | "streaming"
  | "done"
  | "stopped"
  | "failed";

export type AiStream = {
  status: AiStreamStatus;
  text: string;
  error: ApiError | null;
};

const idle: AiStream = { status: "idle", text: "", error: null };

export function useAiStream(path: string) {
  const [stream, setStream] = useState<AiStream>(idle);
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    controller.current?.abort();
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setStream(idle);
  }, []);

  const start = useCallback(
    async (body: Row) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setStream({ status: "streaming", text: "", error: null });
      const result = await streamAi(path, body, current.signal, (text) => {
        if (controller.current === current) {
          setStream({ status: "streaming", text, error: null });
        }
      });
      if (controller.current !== current) {
        return;
      }
      controller.current = null;
      if (result.state === "aborted") {
        setStream({
          status: "stopped",
          text: splitTrailer(result.text).text,
          error: null,
        });
        return;
      }
      if (result.state === "failed") {
        setStream({ status: "failed", text: result.text, error: result.error });
        return;
      }
      const { text, code } = splitTrailer(result.text);
      if (code) {
        setStream({
          status: "failed",
          text,
          error: toApiError(502, { code }),
        });
        return;
      }
      if (text.trim() === "") {
        setStream({
          status: "failed",
          text,
          error: toApiError(502, { code: "empty" }),
        });
        return;
      }
      setStream({ status: "done", text, error: null });
    },
    [path],
  );

  useEffect(() => () => controller.current?.abort(), []);

  return { stream, start, stop, reset };
}
