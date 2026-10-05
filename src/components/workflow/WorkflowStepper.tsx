import {
  Check,
  FileText,
  ShieldCheck,
  Radar,
  Network,
  Sparkles,
  ListChecks,
  Code2,
  Play,
  FileSpreadsheet,
  LockKeyhole,
} from "lucide-react";
import { stages } from "../../utils/workflow";
const icons = [
  FileText,
  ShieldCheck,
  Radar,
  Network,
  Sparkles,
  ListChecks,
  Code2,
  Play,
  FileSpreadsheet,
];
export function AnimatedConnector({
  complete,
  active,
}: {
  complete: boolean;
  active: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`connector ${complete ? "complete" : ""} ${active ? "active" : ""}`}
    />
  );
}
export function WorkflowNode({
  index,
  current,
  complete,
  running,
  disabled,
  onClick,
}: {
  index: number;
  current: boolean;
  complete: boolean;
  running: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = icons[index];
  return (
    <button
      className={`workflow-node ${current ? "current" : ""} ${complete ? "complete" : ""} ${running ? "running" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-current={current ? "step" : undefined}
    >
      <span className="node-icon">
        {complete ? <Check size={19} /> : <Icon size={19} />}
      </span>
      <strong>{stages[index]}</strong>
      <small>
        {running ? (
          "In progress"
        ) : complete ? (
          "Completed"
        ) : current ? (
          "You are here"
        ) : disabled ? (
          <>
            <LockKeyhole size={10} /> Upcoming
          </>
        ) : (
          "Ready to review"
        )}
      </small>
    </button>
  );
}
export function WorkflowStepper({
  stage,
  available,
  completed,
  running,
  onChange,
}: {
  stage: number;
  available: number;
  completed: boolean[];
  running?: number;
  onChange: (n: number) => void;
}) {
  return (
    <nav className="workflow" aria-label="QA workflow">
      {stages.map((_, i) => (
        <div className="workflow-segment" key={i}>
          <WorkflowNode
            index={i}
            current={stage === i}
            complete={completed[i]}
            running={running === i}
            disabled={i > available}
            onClick={() => onChange(i)}
          />
          {i < stages.length - 1 && (
            <AnimatedConnector complete={completed[i]} active={running === i} />
          )}
        </div>
      ))}
    </nav>
  );
}
