import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

export type ToastActionVariant = 'primary' | 'danger' | 'ghost';

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: ToastActionVariant;
}

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
  actions?: ToastAction[];
  durationMs?: number;
}

interface ToastState {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const DEFAULT_KIND: ToastKind = 'info';
const MAX_TOASTS = 3;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => {
      const next = [...state.toasts, { ...toast, id, kind: toast.kind ?? DEFAULT_KIND }];
      return { toasts: next.slice(-MAX_TOASTS) };
    });
    return id;
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
}));

