import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Layers3,
  Network,
  Sparkles,
  Check,
  Command,
  FolderOpen,
} from "lucide-react";
import { api } from "../../api/client";
import {
  Button,
  Card,
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
  DetailDrawer,
} from "../../components/ui";
export function Shell({
  children,
  project,
  action,
}: {
  children: ReactNode;
  project?: string;
  action?: ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-symbol">
            a<span>↗</span>
          </span>
          arc<span className="brand-caption">QA WORKSPACE</span>
        </Link>
        <div className="workspace-label">
          <div className="avatar">Q</div>
          <div>
            Engineering workspace<small>AI-powered quality</small>
          </div>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <Link className="side-link selected" to="/">
          <Layers3 size={18} />
          Projects<span className="keycap">P</span>
        </Link>
        <div className="side-journey">
          <span className="nav-caption">YOUR QA JOURNEY</span>
          {[
            "Define what matters",
            "Explore the application",
            "Design with evidence",
          ].map((s, i) => (
            <div key={s}>
              <span>0{i + 1}</span>
              {s}
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="tiny-orbit">
            <Sparkles size={19} />
          </div>
          <strong>From intent to confidence.</strong>
          <p>
            One connected workflow.
            <br />
            Every test, traceable.
          </p>
          <div className="sidebar-footer">
            <div className="avatar small">QA</div>
            <span>Quality engineering</span>
            <Command size={14} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <div className="topbar">
          <div>
            <Link to="/">Workspace</Link>
            <span>/</span>
            <span>{project || "Projects"}</span>
          </div>
          <div className="topbar-action">
            {action}
            <span className="version">EARLY ACCESS</span>
          </div>
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
export default function Projects() {
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: ({ signal }) => api.projects(signal),
  });
  const [search, setSearch] = useState("");
  const [create, setCreate] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: api.createProject,
    onSuccess: async (p) => {
      await client.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projects/${p.id}`);
    },
  });
  const filtered =
    projects.data?.filter((p) =>
      `${p.name} ${p.application_url}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  return (
    <Shell>
      <PageHeader
        eyebrow="BUILD CONFIDENCE, CONTINUOUSLY"
        title="Your quality workspace"
        description="Turn requirements into a clear map of what to test next."
        action={
          <Button
            onClick={() => {
              mutation.reset();
              setCreate(true);
            }}
          >
            <Plus size={17} />
            New project
          </Button>
        }
      />
      <section className="welcome-banner">
        <div>
          <span className="eyebrow">INTELLIGENT QA, CONNECTED</span>
          <h2>
            Great testing starts
            <br />
            with a clear journey.
          </h2>
          <p>
            Define the intent. Discover the application.
            <br />
            Generate test cases grounded in real evidence.
          </p>
          <button className="text-button" onClick={() => setCreate(true)}>
            Start a new journey <ArrowRight size={16} />
          </button>
        </div>
        <div className="welcome-diagram" aria-hidden>
          <div className="mini-node">
            <Layers3 size={18} />
            Requirement
            <Check size={14} />
          </div>
          <div className="mini-line" />
          <div className="mini-node accented">
            <Network size={18} />
            Application map
            <span className="dot" />
          </div>
          <div className="mini-line" />
          <div className="mini-node">
            <Sparkles size={18} />
            Test design
            <ArrowUpRight size={14} />
          </div>
          <span className="diagram-caption">
            CONTEXT → DISCOVERY → CONFIDENCE
          </span>
        </div>
      </section>
      <div className="section-heading">
        <h2>
          Projects <span className="count">{projects.data?.length ?? "—"}</span>
        </h2>
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search projects"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {projects.isPending ? (
        <LoadingState />
      ) : projects.error ? (
        <ErrorState error={projects.error} retry={() => projects.refetch()} />
      ) : !filtered.length ? (
        <Card>
          <EmptyState
            title={
              search ? "No matching projects" : "A fresh start for better QA"
            }
            description={
              search
                ? "Try a different project name or application URL."
                : "Create your first project. We’ll guide you from the first requirement to traceable test cases."
            }
            action={
              !search && (
                <Button onClick={() => setCreate(true)}>
                  <Plus size={16} />
                  Create project
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="project-grid">
          {filtered.map((p) => (
            <Link to={`/projects/${p.id}`} className="project-card" key={p.id}>
              <div className="project-card-top">
                <div className="project-icon">
                  <FolderOpen size={23} />
                </div>
                <ArrowUpRight size={18} />
              </div>
              <h3>{p.name}</h3>
              <p>{p.application_url || "Application URL not configured"}</p>
              <footer>
                <span className="badge">
                  <i />
                  Project workspace
                </span>
                <span>
                  Open journey <ArrowRight size={14} />
                </span>
              </footer>
            </Link>
          ))}
        </div>
      )}
      {create && (
        <DetailDrawer
          title="Create your project"
          onClose={() => {
            if (!mutation.isPending) setCreate(false);
          }}
        >
          <p className="muted">
            Give your QA journey a home. Next, we’ll help you define the first
            requirement.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              mutation.mutate({
                name: String(f.get("name")).trim(),
                application_url: String(f.get("url")).trim(),
              });
            }}
          >
            <label>
              Project name
              <input
                name="name"
                required
                maxLength={160}
                placeholder="e.g. Customer portal"
                autoFocus
                pattern=".*\S.*"
              />
            </label>
            <label>
              Application URL
              <input
                name="url"
                type="url"
                required
                placeholder="https://app.example.com"
                pattern="https?://.*"
              />
            </label>
            {mutation.error && <ErrorState error={mutation.error} />}
            <Button type="submit" busy={mutation.isPending}>
              Create project <ArrowRight size={16} />
            </Button>
          </form>
        </DetailDrawer>
      )}
    </Shell>
  );
}
