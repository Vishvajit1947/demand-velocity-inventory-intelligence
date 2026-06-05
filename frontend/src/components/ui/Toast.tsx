/**
 * Toast — transient message surface + minimal provider/hook.
 * MT-42 owns global polish; this gives all panels an error surface now.
 * Shows the `message` field from 05 §7 error responses.
 * 06 §5 Error, §8.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../../lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastKind = "error" | "success" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Portal anchor — bottom-right, above everything */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2"
      >
        <AnimatePresence>
          {items.map((t) => (
            <ToastCard
              key={t.id}
              {...t}
              onClose={() => setItems((p) => p.filter((x) => x.id !== t.id))}
            />
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

// ── Toast card ────────────────────────────────────────────────────────────────

const TOAST_STYLES: Record<ToastKind, { border: string; icon: string }> = {
  error:   { border: "border-accent-rose/50 glow-rose",  icon: "text-accent-rose" },
  success: { border: "border-accent-lime/50 glow-lime",  icon: "text-accent-lime" },
  info:    { border: "border-border-glass",              icon: "text-accent-cyan"  },
};

const ICONS: Record<ToastKind, typeof AlertTriangle> = {
  error:   AlertTriangle,
  success: CheckCircle2,
  info:    Info,
};

function ToastCard({
  kind,
  message,
  onClose,
}: ToastItem & { onClose: () => void }) {
  const { border, icon } = TOAST_STYLES[kind];
  const Icon = ICONS[kind];

  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "pointer-events-auto flex max-w-sm items-start gap-2 glass-panel px-4 py-3",
        border,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", icon)} aria-hidden />
      <span className="flex-1 text-body text-text-primary">{message}</span>
      <button
        onClick={onClose}
        aria-label="Dismiss notification"
        className="ml-1 text-text-muted hover:text-text-primary"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
