"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type ToastVariant = "success" | "error" | "info";

type ToastOptions = {
  title?: string;
  description: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastRecord = {
  id: string;
  title?: string;
  description: string;
  variant: ToastVariant;
  duration: number;
};

type ToastContextValue = {
  show: (options: ToastOptions) => string;
  success: (description: string, title?: string) => string;
  error: (description: string, title?: string) => string;
  info: (description: string, title?: string) => string;
  dismiss: (id: string) => void;
};

const FLASH_TOAST_KEY = "tfcf-flash-toast";
const DEFAULT_DURATION = 4000;

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLES: Record<
  ToastVariant,
  {
    border: string;
    iconBg: string;
    iconColor: string;
    icon: string;
    title: string;
  }
> = {
  success: {
    border: "border-emerald-200",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-700",
    icon: "check_circle",
    title: "成功",
  },
  error: {
    border: "border-rose-200",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-700",
    icon: "error",
    title: "發生錯誤",
  },
  info: {
    border: "border-slate-200",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-700",
    icon: "info",
    title: "提醒",
  },
};

function createToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function setFlashToast(options: ToastOptions) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(FLASH_TOAST_KEY, JSON.stringify(options));
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  const style = TOAST_STYLES[toast.variant];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration);

    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.duration, toast.id]);

  return (
    <div
      className={`toast-enter pointer-events-auto w-full rounded-2xl border ${style.border} bg-white p-4 shadow-lg shadow-slate-900/10`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.iconBg} ${style.iconColor}`}
        >
          <span className="material-symbols-outlined text-[20px]">
            {style.icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">
            {toast.title || style.title}
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            {toast.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label="關閉通知"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const nextToast: ToastRecord = {
      id: createToastId(),
      title: options.title,
      description: options.description,
      variant: options.variant ?? "info",
      duration: options.duration ?? DEFAULT_DURATION,
    };

    setToasts((current) => [...current, nextToast]);
    return nextToast.id;
  }, []);

  const consumeFlashToast = useCallback(() => {
    if (typeof window === "undefined") return;

    const rawToast = window.sessionStorage.getItem(FLASH_TOAST_KEY);
    if (!rawToast) return;

    window.sessionStorage.removeItem(FLASH_TOAST_KEY);

    try {
      const parsedToast = JSON.parse(rawToast) as ToastOptions;
      if (parsedToast?.description) {
        show(parsedToast);
      }
    } catch {
      window.sessionStorage.removeItem(FLASH_TOAST_KEY);
    }
  }, [show]);

  useEffect(() => {
    consumeFlashToast();
  }, [consumeFlashToast, pathname]);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      dismiss,
      success: (description, title) =>
        show({ title, description, variant: "success" }),
      error: (description, title) =>
        show({ title, description, variant: "error" }),
      info: (description, title) => show({ title, description, variant: "info" }),
    }),
    [dismiss, show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex flex-col gap-3 px-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-full sm:max-w-sm"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
