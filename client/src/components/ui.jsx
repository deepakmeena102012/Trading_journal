import { useEffect, useId } from 'react';
import { AlertCircle, Inbox, Loader2, X } from 'lucide-react';

export function Card({ title, action, children, className = '', bodyClassName = 'p-4' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, sub, valueClass = 'text-ink', icon: Icon }) {
  return (
    <div className="card p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        {Icon && <Icon size={15} className="shrink-0 text-muted" aria-hidden />}
      </div>
      <p className={`num mt-1.5 truncate text-lg font-semibold sm:text-xl ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-12 text-sm text-muted ${className}`} role="status">
      <Loader2 size={18} className="animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm text-loss" role="alert">
      <AlertCircle size={16} className="shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 rounded-full bg-raised p-3 text-muted">
        <Icon size={22} aria-hidden />
      </div>
      <p className="font-medium text-ink">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Label + control + error/hint. `children` receives the generated id. */
export function Field({ label, error, hint, children, className = '', required }) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="text-loss"> *</span>}
        </label>
      )}
      {children(id)}
      {error ? <p className="mt-1 text-xs text-loss">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    profit: 'bg-profit/15 text-profit',
    loss: 'bg-loss/15 text-loss',
    neutral: 'bg-raised text-soft',
    accent: 'bg-accent/15 text-accent',
    warn: 'bg-[#fab219]/15 text-[#fab219]',
  };
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>{children}</span>;
}

export function ResultBadge({ result, status }) {
  if (status === 'open' || !result) return <Badge tone="accent">Open</Badge>;
  if (result === 'win') return <Badge tone="profit">Win</Badge>;
  if (result === 'loss') return <Badge tone="loss">Loss</Badge>;
  return <Badge>Break-even</Badge>;
}

export function DirectionBadge({ direction }) {
  return <Badge tone="neutral">{direction === 'long' ? '▲ Long' : '▼ Short'}</Badge>;
}

export function Modal({ open, onClose, title, children, footer, size = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card max-h-[90vh] w-full overflow-y-auto rounded-b-none sm:rounded-xl ${size}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" className="btn-ghost p-1.5" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel, busy, danger = true }) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-soft">{message}</p>
    </Modal>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex min-w-full gap-1 border-b border-line sm:min-w-0" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              value === t.value ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SegmentedControl({ options, value, onChange, ariaLabel }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-bg p-1" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.value ? 'bg-raised text-ink' : 'text-muted hover:text-soft'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
