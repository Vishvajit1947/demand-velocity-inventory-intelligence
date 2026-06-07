// MT-42 — ToastHost: shows the API error `message` (05 §7) in a Toast on forecast error
// (06 §5). Mounted once in the app shell under the MT-30 ToastProvider. Renders nothing.
import { useEffect, useRef } from "react";
import { useToast } from "./Toast";
import type { ApiError } from "../../lib/api";

export function ToastHost({
  error,
  status,
}: {
  error: ApiError | null;
  status: "idle" | "pending" | "error" | "success";
}) {
  const { toast } = useToast();
  // Track the last error we showed so re-renders don't re-fire the same toast.
  const lastShown = useRef<ApiError | null>(null);

  useEffect(() => {
    if (status === "error" && error && error !== lastShown.current) {
      lastShown.current = error;
      // 05 §7: show the API `message` verbatim. 06 §5 Error → toast.
      toast(error.message, "error");
    }
    if (status !== "error") {
      // Reset so the same message can appear again on a later separate error.
      lastShown.current = null;
    }
  }, [error, status, toast]);

  return null;
}
