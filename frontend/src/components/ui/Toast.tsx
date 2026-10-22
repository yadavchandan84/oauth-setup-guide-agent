import { useEffect } from 'react';

export function Toast({
  message,
  onDismiss,
  duration = 2500,
}: {
  message: string;
  onDismiss: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [onDismiss, duration]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-white/10 bg-ink-800/90 px-4 py-2 text-sm text-slate-100 shadow-lg backdrop-blur-xl animate-fade-in"
    >
      {message}
    </div>
  );
}
