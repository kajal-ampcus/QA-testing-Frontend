import {
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import {
  LoaderCircle,
  AlertCircle,
  X,
  ArrowRight,
  Check,
  Inbox,
} from "lucide-react";
import { human } from "../../utils/workflow";
export function Button({
  children,
  busy,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${props.className || ""}`}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`badge ${["APPROVED", "COMPLETE", "SUCCESS", "PASSED"].includes(status.toUpperCase()) ? "good" : /FAIL|REJECT|BLOCK|ERROR/.test(status.toUpperCase()) ? "bad" : /PENDING|CLARIFICATION|PARTIAL|REVIEW|QUEUED|RUNNING|SKIPPED/.test(status.toUpperCase()) ? "warn" : ""}`}
    >
      <i />
      {human(status)}
    </span>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error" role="alert">
      <AlertCircle size={18} />
      <div>
        <strong>Something needs attention</strong>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        {retry && (
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
export function LoadingState({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      {label}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={28} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ProgressIndicator({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="processing" role="status">
      <div className="orbit">
        <LoaderCircle className="spin" size={26} />
      </div>
      <div>
        <h3>{label}</h3>
        <p>{description}</p>
        <div className="indeterminate" />
      </div>
    </div>
  );
}
export function DetailDrawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("input, textarea, select")?.focus();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer-inner">
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function ConfirmationDialog({
  title,
  children,
  onClose,
  onConfirm,
  busy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <DetailDrawer title={title} onClose={onClose}>
      {children}
      <div className="actions">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button busy={busy} onClick={onConfirm}>
          Confirm approval <Check size={16} />
        </Button>
      </div>
    </DetailDrawer>
  );
}
export function NextAction({
  title,
  description,
  label,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="next-action">
      <div>
        <span className="eyebrow">UP NEXT</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <Button onClick={onClick} disabled={disabled}>
        {label}
        <ArrowRight size={16} />
      </Button>
    </div>
  );
}
export function Timeline({
  items,
}: {
  items: { title: string; detail?: string; done?: boolean }[];
}) {
  return (
    <ol className="timeline">
      {items.map((item, i) => (
        <li key={i}>
          <span className={item.done ? "timeline-dot done" : "timeline-dot"}>
            {item.done ? <Check size={12} /> : i + 1}
          </span>
          <div>
            <strong>{item.title}</strong>
            {item.detail && <p>{item.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
