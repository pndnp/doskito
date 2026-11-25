import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface Toast {
  id: number;
  text: string;
  kind: 'success' | 'error';
}

const ToastContext = createContext<{
  showToast: (text: string, kind?: 'success' | 'error') => void;
}>({ showToast: () => undefined });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    setToast({ id: Date.now(), text, kind });
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div className={`toast toast--${toast.kind}`} role="status" key={toast.id}>
          <span>{toast.text}</span>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
