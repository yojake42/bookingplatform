import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronDown, Loader2, Minus, Plus, Star, X } from 'lucide-react';
import { useLockBodyScroll } from '../lib/hooks';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-ink-900 text-white hover:bg-ink-800 active:bg-black shadow-sm',
  brand: 'text-white shadow-sm bg-[linear-gradient(90deg,var(--color-brand-600),var(--color-brand-500)_50%,var(--color-brand-600))] bg-[length:200%_100%] bg-left hover:bg-right transition-[background-position] duration-500',
  secondary: 'bg-white text-ink-900 ring-1 ring-ink-200 hover:bg-ink-50 hover:ring-ink-300 shadow-[0_1px_0_rgb(0_0_0/0.03)]',
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-white text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50',
  link: 'text-ink-900 underline underline-offset-4 decoration-ink-300 hover:decoration-ink-900 px-0! h-auto!',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ className, label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-700 transition hover:bg-ink-100 hover:text-ink-900 active:scale-95 disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

type FieldShellProps = { label?: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children: (id: string) => ReactNode };

export function FieldShell({ label, hint, error, className, children }: FieldShellProps) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-sm text-brand-700">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode; wrapperClassName?: string; suffix?: ReactNode; prefix?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, wrapperClassName, className, suffix, prefix, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={wrapperClassName}>
      {(id) => (
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-500">{prefix}</span>}
          <input
            ref={ref}
            id={id}
            aria-invalid={Boolean(error)}
            className={clsx('field', error && 'field-invalid', prefix && 'pl-8', suffix && 'pr-12', className)}
            {...rest}
          />
          {suffix && <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-ink-500">{suffix}</span>}
        </div>
      )}
    </FieldShell>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode; wrapperClassName?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, wrapperClassName, className, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={wrapperClassName}>
      {(id) => <textarea ref={ref} id={id} className={clsx('field min-h-28 resize-y leading-relaxed', error && 'field-invalid', className)} {...rest} />}
    </FieldShell>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode; wrapperClassName?: string };

export function Select({ label, hint, error, wrapperClassName, className, children, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={wrapperClassName}>
      {(id) => (
        <div className="relative">
          <select id={id} className={clsx('field appearance-none pr-10', className)} {...rest}>
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-500" />
        </div>
      )}
    </FieldShell>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (value: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx('flex items-start justify-between gap-4', disabled ? 'opacity-50' : 'cursor-pointer')}>
      {(label || description) && (
        <span>
          {label && <span className="block text-[15px] font-medium text-ink-900">{label}</span>}
          {description && <span className="mt-0.5 block text-sm text-ink-500">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-ink-900' : 'bg-ink-200')}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-out',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </label>
  );
}

export function Counter({ value, onChange, min = 0, max = 99, label, description, step = 1, zeroLabel }: { value: number; onChange: (value: number) => void; min?: number; max?: number; label: ReactNode; description?: ReactNode; step?: number; zeroLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="text-[15px] font-medium text-ink-900">{label}</div>
        {description && <div className="text-sm text-ink-500">{description}</div>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Decrease"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}
          className="flex size-8 items-center justify-center rounded-full border border-ink-300 text-ink-700 transition hover:border-ink-900 hover:text-ink-900 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-8 text-center text-[15px] font-medium tabular-nums">{value === 0 && zeroLabel ? zeroLabel : value}</span>
        <button
          type="button"
          aria-label="Increase"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}
          className="flex size-8 items-center justify-center rounded-full border border-ink-300 text-ink-700 transition hover:border-ink-900 hover:text-ink-900 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  bodyClassName?: string;
};

const modalSizes = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl', full: 'sm:max-w-none sm:h-full sm:rounded-none' };

export function Modal({ open, onClose, title, children, footer, size = 'md', bodyClassName }: ModalProps) {
  useLockBodyScroll(open);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-3xl bg-white shadow-float outline-none sm:animate-pop-in sm:rounded-3xl',
          modalSizes[size],
        )}
      >
        {title !== undefined && (
          <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-ink-100 px-5">
            <IconButton label="Close" onClick={onClose} className="-ml-2">
              <X className="size-5" />
            </IconButton>
            <h2 id={titleId} className="flex-1 truncate text-center text-base font-semibold">
              {title}
            </h2>
            <span className="w-7" />
          </div>
        )}
        <div className={clsx('min-h-0 flex-1 overflow-y-auto', bodyClassName ?? 'p-6')}>{children}</div>
        {footer && <div className="shrink-0 border-t border-ink-100 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useLockBodyScroll(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-lg animate-slide-in-right flex-col bg-white shadow-float">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-ink-100 px-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <div className="shrink-0 border-t border-ink-100 px-6 py-4">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', destructive, loading, children }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" bodyClassName="p-6">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description && <div className="mt-2 text-[15px] leading-relaxed text-ink-600">{description}</div>}
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Keep it
        </Button>
        <Button variant={destructive ? 'brand' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin text-ink-400', className ?? 'size-5')} />;
}

const badgeTones = {
  neutral: 'bg-ink-100 text-ink-700',
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-amber-600/15',
  red: 'bg-brand-50 text-brand-700 ring-1 ring-brand-600/15',
  blue: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/15',
  dark: 'bg-ink-900 text-white',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton rounded-xl', className)} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-ink-200 px-6 py-16 text-center">
      {icon && <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-ink-50 text-ink-500">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[15px] text-ink-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Stars({ value, size = 'size-4', onChange }: { value: number; size?: string; onChange?: (value: number) => void }) {
  return (
    <div className="flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.round(value);
        const icon = <Star className={clsx(size, filled ? 'fill-ink-900 text-ink-900' : 'fill-ink-200 text-ink-200', onChange && 'transition-transform hover:scale-110')} />;
        return onChange ? (
          <button key={star} type="button" role="radio" aria-checked={star === value} aria-label={`${star} star${star === 1 ? '' : 's'}`} onClick={() => onChange(star)}>
            {icon}
          </button>
        ) : (
          <span key={star}>{icon}</span>
        );
      })}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return (
    <span
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className ?? 'size-10 text-sm')}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 52%), hsl(${(hue + 40) % 360} 60% 42%))` }}
    >
      {initials}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-ink-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={clsx(
            'rounded-lg px-3.5 py-1.5 text-sm font-semibold transition',
            option.value === value ? 'bg-white text-ink-900 shadow-ring' : 'text-ink-500 hover:text-ink-900',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-2xl bg-white ring-1 ring-ink-200/70 shadow-[0_1px_2px_rgb(0_0_0/0.03)]', className)}>{children}</div>;
}
