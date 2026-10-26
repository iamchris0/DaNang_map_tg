import { createContext, use } from 'react';

export type ToastKind = 'success' | 'error';
export type ShowToast = (message: string, kind?: ToastKind) => void;

export const ToastContext = createContext<ShowToast>(() => undefined);

export function useToast(): ShowToast {
  return use(ToastContext);
}
