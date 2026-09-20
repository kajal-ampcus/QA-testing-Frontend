# Arc QA workspace

A React + TypeScript frontend for the existing QA Platform API. No production mock data or fabricated progress.

## Run

Use Node 22+ and the QA backend from `../qa-platform`.

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Open http://localhost:3000. `VITE_API_BASE_URL` defaults to `/api/v1` and Vite proxies `/api` to `API_PROXY_TARGET` (default `http://127.0.0.1:8000`). The backend and frontend proxy must use the same port. The local `.env` points to **8000**, matching `run-local.bat`. If you choose another backend port, update `API_PROXY_TARGET` and restart Vite.

Start the API from the backend directory:

```powershell
.\.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000
```

Discovery additionally requires Redis and the arq worker; requirement analysis and generation require a configured LLM provider. Credentials are saved through the backend encryption endpoint. No credentials are put in browser storage.

For Docker, `../qa-platform/compose.yaml` now builds `../frontend`. Nginx proxies API requests to the `api` service and supports client-side routes. Production cross-origin hosting can instead set `VITE_API_BASE_URL` at build time and configure the backend CORS allowlist. Do not put secrets in Vite variables.

## Commands

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run format:check
# Optional read-only integration smoke test against the running QA API:
$env:LIVE_API='1'
npm.cmd test -- tests/live.spec.ts --project=desktop
```

Browser tests use locally installed Chrome. The regular suite intercepts the API using fixtures matching the backend contracts, allowing deterministic tests of success, failure, reload, versioning, accessibility, and mobile behavior. These fixtures live only under `tests/` and are never imported by the application. The optional live smoke test uses the actual API and database without creating data. It does not invoke paid LLM generation or crawl an external application.

## Architecture

- `src/app`: providers, lazy routes, shell composition, workspace state, design tokens, responsive styles.
- `src/api/client.ts`: typed HTTP transport and all backend endpoints.
- `src/features`: projects, requirements, approvals, discovery, application map, and test cases.
- `src/components/ui`: shared buttons, cards, badges, dialogs, loading/error/empty states, timeline, and next action.
- `src/components/workflow`: stepper, nodes, animated connectors.
- `src/hooks`: shared mutation lifecycle and query invalidation.
- `src/types` and `src/utils`: wire contracts and workflow derivation.

TanStack Query caches data by project and cancels abandoned reads. Mutations are not automatically retried. Route query parameters retain the selected requirement and viewed stage. Browser storage contains only project-scoped discovery job IDs and map-review markers. Requirement, approval, map, and generation gates derive from server data, not the viewed route.

The visual language uses an ink sidebar, warm surfaces, green state accents, shared component styles, and CSS motion. Media queries adapt at 1500, 1200, 1000, 760, and 480 pixels. `prefers-reduced-motion` disables animation. Native modal dialogs handle focus trapping and Escape; graph states also support keyboard selection.

## Backend state mapping

| Backend state                   | User experience                                                              |
| ------------------------------- | ---------------------------------------------------------------------------- |
| No requirement                  | Guided requirement input                                                     |
| Ambiguities present             | Explicit decisions for every ambiguity, with `expected_version`              |
| Pending approval                | Reviewer and optional note; reject requires a reason                         |
| Rejected approval               | Revision creates the next approval gate                                      |
| Approved requirement            | Discovery with a version-pinned focus                                        |
| queued / deferred / in_progress | Real job status; automatic polling                                           |
| RUNNING map                     | Poll saved observations, even if this browser has no job ID                  |
| Failed job or FAILED envelope   | Failure details and explicit retry                                           |
| PARTIAL map                     | Inspect observations; generation remains unavailable                         |
| COMPLETE map                    | Interactive map review, then generation                                      |
| Generation request in flight    | Indeterminate processing, no fake substeps or percentage                     |
| Generated drafts                | Search, category/status/confidence/requirement filters, details, JSON export |

## Data limitations handled explicitly

The map API exposes state URLs and `reached_via` action paths, not explicit edges or page titles. Display labels derive from URLs. An edge is inferred only when exactly one state matches the immediately preceding navigation path, and the graph legend labels this inference. Ambiguous parents remain disconnected; the drawer always shows the actual path and observations.

Test rows flag earlier requirement/map versions. Historical test details do not substitute current acceptance-criterion text for an older requirement version. Generation warnings are shown from the latest response; the backend does not persist a retrievable generation summary, so those warnings are not recoverable after reload. Saved tests and their traceability remain available.

The backend does not yet expose test validation, test approval, execution, account authentication, tenant enforcement, or detailed streaming job progress. The frontend does not simulate these capabilities. Generation is a synchronous request; keep the workspace open while it runs. A browser refresh can recover saved tests after completion but cannot recover an in-flight generation status from the current API.

Project details expose `has_application_map`. The workspace keeps the map query disabled until the backend confirms a map exists. During a newly queued discovery it checks project availability, then loads and polls the map. Refreshes and cache invalidation respect this gate, so requirement and approval work does not probe a missing map. Existing maps remain discoverable in a new browser session.
