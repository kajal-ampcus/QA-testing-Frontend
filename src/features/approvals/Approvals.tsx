import { useEffect, useState } from "react";
import { ShieldCheck, ArrowRight, Check, Pencil, X } from "lucide-react";
import type { Requirement, Approval } from "../../types/api";
import { api } from "../../api/client";
import { useAction } from "../../hooks/useAction";
import {
  Button,
  Card,
  ErrorState,
  StatusBadge,
  ConfirmationDialog,
  NextAction,
} from "../../components/ui";
export default function Approvals({
  projectId,
  requirement: r,
  approval,
  onNext,
  onRevise,
}: {
  projectId: string;
  requirement: Requirement;
  approval?: Approval;
  onNext: () => void;
  onRevise: () => void;
}) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setEditingId(null);
    setEditedIds(new Set());
  }, [r.id]);
  const saveCriteria = useAction(
    projectId,
    (text: string) =>
      api.editAcceptanceCriteria(
        r.id,
        r.acceptance_criteria.map((ac) => ({
          id: ac.id,
          text: ac.id === editingId ? text.trim() : ac.text,
        })),
      ),
    () => {
      setEditedIds((prev) => new Set(prev).add(editingId!));
      setEditingId(null);
    },
  );
  const decision = useAction(
    projectId,
    (action: "approve" | "reject") =>
      api.decide(approval!.id, action, name.trim(), reason.trim()),
    (result) => {
      setConfirm(false);
      if (result.status === "APPROVED") onNext();
      else onRevise();
    },
  );
  return (
    <Card>
      <div className="card-heading">
        <div className="heading-icon">
          <ShieldCheck size={21} />
        </div>
        <div>
          <h2>Make the intent official</h2>
          <p>Review the requirement before discovery begins.</p>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <h3>{r.title}</h3>
      <p className="description-text">{r.description}</p>
      <h3 className="subheading">
        Acceptance criteria{" "}
        <span className="count">{r.acceptance_criteria.length}</span>
      </h3>
      {r.status === "APPROVED" ? (
        <div className="criteria">
          {r.acceptance_criteria.map((ac) => (
            <div key={ac.id}>
              <Check size={16} />
              <div>
                <span className="mono">{ac.id}</span>
                <p>{ac.text}</p>
                <small>{ac.source}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="criteria">
            {r.acceptance_criteria.map((ac) => (
              <div key={ac.id}>
                <Check size={16} />
                <div className="criteria-content">
                  <span className="mono">{ac.id}</span>
                  {editedIds.has(ac.id) && editingId !== ac.id && (
                    <span className="badge">Edited</span>
                  )}
                  {editingId === ac.id ? (
                    <>
                      <textarea
                        rows={2}
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      {saveCriteria.error && (
                        <ErrorState error={saveCriteria.error} />
                      )}
                      <div className="actions">
                        <Button
                          variant="secondary"
                          type="button"
                          disabled={saveCriteria.isPending}
                          onClick={() => setEditingId(null)}
                        >
                          <X size={14} />
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          busy={saveCriteria.isPending}
                          disabled={!draft.trim()}
                          onClick={() => saveCriteria.mutate(draft)}
                        >
                          <Check size={14} />
                          Save
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>{ac.text}</p>
                      <small>{ac.source}</small>
                    </>
                  )}
                </div>
                {editingId !== ac.id && (
                  <button
                    type="button"
                    className="icon-button criteria-edit"
                    aria-label={`Edit ${ac.id}`}
                    onClick={() => {
                      setEditingId(ac.id);
                      setDraft(ac.text);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {r.status === "APPROVED" ? (
        <NextAction
          title="Ready to explore"
          description="Your requirement is approved. Discover the application to ground your tests in observed behavior."
          label="Start discovery"
          onClick={onNext}
        />
      ) : r.ambiguities.length ? (
        <NextAction
          title="Resolve the open questions first"
          description="Every ambiguity needs a decision before this requirement can be approved."
          label="Resolve ambiguities"
          onClick={onRevise}
        />
      ) : !approval ? (
        <NextAction
          title="A revision is needed"
          description="There is no pending approval for this version. Revise the requirement to request a new review."
          label="Revise requirement"
          onClick={onRevise}
        />
      ) : (
        <>
          <div className="form-grid">
            <label>
              Reviewer name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </label>
            <label>
              Review note
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required when requesting a revision"
              />
            </label>
          </div>
          {decision.error && <ErrorState error={decision.error} />}
          <div className="actions">
            <Button
              variant="secondary"
              disabled={!name.trim() || !reason.trim()}
              busy={decision.isPending}
              onClick={() => decision.mutate("reject")}
            >
              Request revision
            </Button>
            <Button
              disabled={!name.trim() || decision.isPending || editingId !== null}
              onClick={() => setConfirm(true)}
            >
              Approve requirement <ArrowRight size={16} />
            </Button>
          </div>
        </>
      )}
      {confirm && (
        <ConfirmationDialog
          title="Approve this requirement?"
          onClose={() => {
            if (!decision.isPending) setConfirm(false);
          }}
          onConfirm={() => decision.mutate("approve")}
          busy={decision.isPending}
        >
          <p>
            You are approving{" "}
            <strong>
              {r.req_code} · Version {r.version}
            </strong>{" "}
            as <strong>{name}</strong>. This version will be available for
            discovery and test design.
          </p>
          {decision.error && <ErrorState error={decision.error} />}
        </ConfirmationDialog>
      )}
    </Card>
  );
}
