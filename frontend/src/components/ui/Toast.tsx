import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "../../lib/cn";

type ToastKind = "error" | "success" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <ToastCard
              key={t.id}
              {...t}
              onClose={() =>
                setItems((p) => p.filter((x) => x.id !== t.id))
              }
            />
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

function ToastCard({
  kind,
  message,
  onClose,
}: ToastItem & { onClose: () => void }) {
  const tone =
    kind === "error"
      ? "border-accent-rose/50 glow-rose text-text-primary"
      : kind === "success"
        ? "border-accent-lime/50 glow-lime text-text-primary"
        : "border-border-glass text-text-primary";

  const Icon =
    kind === "error"
      ? AlertTriangle
      : kind === "success"
        ? CheckCircle2
        : AlertTriangle;

  const iconColor =
    kind === "error"
      ? "text-accent-rose"
      : kind === "success"
        ? "text-accent-lime"
        : "text-accent-cyan";

  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "pointer-events-auto flex max-w-sm items-start gap-2 glass-panel px-4 py-3",
        tone,
      )}
    >
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)}
        aria-hidden
      />
      <span className="text-body">{message}</span>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="ml-2 text-text-muted hover:text-text-primary"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
