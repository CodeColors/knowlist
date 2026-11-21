import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

type Kind = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

const Ctx = createContext<(message: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pop-in pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 shadow-lift ${
              t.kind === 'error' ? 'bg-danger-soft text-danger' : t.kind === 'success' ? 'bg-ok-soft text-ok' : 'bg-surface text-ink border border-line'
            }`}
          >
            <Icon name={t.kind === 'error' ? 'info' : t.kind === 'success' ? 'check' : 'sparkle'} size={20} className="mt-0.5 shrink-0" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
