import { useRef, useState } from "react";
import { ArrowRight, FileText, Plus, Pencil, Check, Upload, X } from "lucide-react";
import type { Requirement } from "../../types/api";
import { api } from "../../api/client";
import { useAction } from "../../hooks/useAction";
import {
  Button,
  Card,
  StatusBadge,
  ErrorState,
  ProgressIndicator,
  Timeline,
} from "../../components/ui";
export default function Requirements({
  projectId,
  requirement: r,
  onSaved,
  onNext,
}: {
  projectId: string;
  requirement?: Requirement;
  onSaved: (r: Requirement) => void;
  onNext: () => void;
}) {
  const [editing, setEditing] = useState(!r);
  const [raw, setRaw] = useState(r?.description || "");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reviewer, setReviewer] = useState("");
  const [decisions, setDecisions] = useState<string[]>(
    r?.ambiguities.map(() => "") || [],
  );
  const save = useAction(
    projectId,
    (text: string) =>
      r ? api.revise(r.id, text) : api.createRequirement(projectId, text),
    (result) => {
      setEditing(false);
      setFile(null);
      onSaved(result);
    },
  );
  const clarify = useAction(
    projectId,
    () =>
      api.clarify(
        r!,
        reviewer.trim(),
        decisions.map((x) => x.trim()),
      ),
    onSaved,
  );
  return (
    <div className="two-column">
      <Card>
        <div className="card-heading">
          <div className="heading-icon">
            <FileText size={19} />
          </div>
          <div>
            <h2>{!r ? "What should your application do?" : r.title}</h2>
            <p>
              {r
                ? `${r.req_code} · Version ${r.version}`
                : "Start with a story, specification, or a plain-language description."}
            </p>
          </div>
          {r && <StatusBadge status={r.status} />}
        </div>
        {editing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const text = raw.trim();
              if (text) {
                save.mutate(text);
                return;
              }
              if (file) {
                setFileError("");
                const content = (await file.text()).trim();
                if (!content) {
                  setFileError("That file appears to be empty.");
                  return;
                }
                save.mutate(content);
              }
            }}
          >
            <label>
              Requirement description
              <textarea
                rows={11}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="As a customer, I want to sign in securely so that I can access my account. Include expected behavior, business rules, and edge cases…"
              />
            </label>
            <div className="field-hint">
              Or upload a document instead —{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} />
                {file ? "Choose a different file" : "Choose file"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                className="sr-only"
                onChange={(e) => {
                  setFileError("");
                  setFile(e.target.files?.[0] || null);
                }}
              />
              {file && (
                <span className="tag">
                  {file.name}
                  <button
                    type="button"
                    aria-label="Remove file"
                    onClick={() => {
                      setFile(null);
                      setFileError("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
            </div>
            <p className="field-hint">
              AI will structure your requirement, extract acceptance criteria,
              and flag anything that needs clarification.
            </p>
            {fileError && <ErrorState error={fileError} />}
            {save.error && <ErrorState error={save.error} />}
            <div className="actions">
              {r && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={!raw.trim() && !file}
                busy={save.isPending}
              >
                {r ? "Analyze revision" : "Analyze requirement"}
                <ArrowRight size={16} />
              </Button>
            </div>
            {save.isPending && (
              <ProgressIndicator
                label="Analyzing your requirement"
                description="Extracting acceptance criteria and checking for ambiguities. This may take a moment."
              />
            )}
          </form>
        ) : (
          r && (
            <>
              <p className="description-text">{r.description}</p>
              <div className="tags">
                {r.domain_tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <h3 className="subheading">
                Acceptance criteria{" "}
                <span className="count">{r.acceptance_criteria.length}</span>
              </h3>
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
              {r.ambiguities.length > 0 ? (
                <form
                  className="clarification"
                  onSubmit={(e) => {
                    e.preventDefault();
                    clarify.mutate();
                  }}
                >
                  <span className="badge warn">
                    <i />
                    Your input is needed
                  </span>
                  <h3>Let’s make the requirement precise.</h3>
                  {r.ambiguities.map((a, i) => (
                    <label key={i}>
                      {a.field}
                      <span className="field-hint">{a.issue}</span>
                      <textarea
                        required
                        rows={2}
                        value={decisions[i] || ""}
                        onChange={(e) =>
                          setDecisions((d) =>
                            d.map((v, j) => (i === j ? e.target.value : v)),
                          )
                        }
                        placeholder="Describe the intended behavior…"
                      />
                    </label>
                  ))}
                  <label>
                    Your name
                    <input
                      required
                      value={reviewer}
                      onChange={(e) => setReviewer(e.target.value)}
                      placeholder="Recorded with your decisions"
                    />
                  </label>
                  {clarify.error && <ErrorState error={clarify.error} />}
                  <Button
                    type="submit"
                    busy={clarify.isPending}
                    disabled={
                      !reviewer.trim() || decisions.some((d) => !d.trim())
                    }
                  >
                    Save clarifications <ArrowRight size={16} />
                  </Button>
                </form>
              ) : (
                <div className="actions">
                  <Button onClick={onNext}>
                    Continue to approval <ArrowRight size={16} />
                  </Button>
                </div>
              )}
              <button
                className="text-button"
                onClick={() => {
                  setRaw(r.description);
                  setFile(null);
                  setFileError("");
                  setEditing(true);
                }}
              >
                <Pencil size={14} />
                Revise requirement
              </button>
            </>
          )
        )}
      </Card>
      <aside>
        <Card className="guide-card">
          <span className="eyebrow">A STRONG FOUNDATION</span>
          <h3>
            Clarity in.
            <br />
            Confidence out.
          </h3>
          <p>
            Every test starts here. Your requirement becomes the thread that
            connects application states to test cases.
          </p>
          <Timeline
            items={[
              {
                title: "Describe the behavior",
                detail: "What should the user be able to do?",
                done: !!r,
              },
              {
                title: "Resolve open questions",
                detail: "Make assumptions explicit.",
                done: !!r && !r.ambiguities.length,
              },
              {
                title: "Review and approve",
                detail: "You stay in control of the intent.",
                done: r?.status === "APPROVED",
              },
            ]}
          />
          <div className="guide-note">
            <Plus size={15} />
            You can add more requirements from the workspace selector.
          </div>
        </Card>
      </aside>
    </div>
  );
}
