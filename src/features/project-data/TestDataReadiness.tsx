import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Button, Card, DetailDrawer, ErrorState } from "../../components/ui";
import { testDataReadiness } from "./readiness";

export default function TestDataReadiness({ projectId, revision, generation, busy }: {
  projectId: string;
  revision: string;
  generation?: string;
  busy: boolean;
}) {
  const requirements = useQuery({
    queryKey: ["smart-template", projectId, revision, generation],
    queryFn: ({ signal }) => api.smartTestDataTemplate(projectId, signal),
    enabled: !!revision && !busy,
  });
  const [open, setOpen] = useState(false);
  const notified = useRef<string | undefined>(undefined);
  const readiness = testDataReadiness(requirements.data?.rows ?? []);
  useEffect(() => {
    if (!generation || busy || !requirements.isSuccess || requirements.isFetching || notified.current === generation) return;
    notified.current = generation;
    if (readiness.missingCount) setOpen(true);
  }, [generation, busy, requirements.isSuccess, requirements.isFetching, readiness.missingCount]);
  if (!revision || busy) return null;
  const destination = `/projects/${projectId}/data?section=forms`;
  const message = readiness.missingCount
    ? `${readiness.caseCount} test case${readiness.caseCount === 1 ? " needs" : "s need"} input values (${readiness.missingCount} missing).`
    : readiness.fieldCount ? "Test data ready. All mapped form inputs have values."
      : "These test cases have no mapped form-input requirements.";
  return <>
    <Card>
      <h3>{requirements.isPending ? "Checking test data…" : requirements.isError ? "Test data check unavailable" : readiness.missingCount ? "Missing test data" : "Test data readiness"}</h3>
      {requirements.isError ? <ErrorState error={requirements.error} retry={() => { void requirements.refetch(); }} />
        : !requirements.isPending && <p role="status">{message}</p>}
      <div className="actions">
        <Link className="button secondary" to={destination}>{readiness.missingCount ? "Add test data" : "Review form test data"}</Link>
        <Link className="text-action" to={`/projects/${projectId}/data?section=credentials`}>Manage login credentials</Link>
      </div>
    </Card>
    {open && <DetailDrawer title="Add missing test data" onClose={() => setOpen(false)}>
      <p>{message}</p>
      <p>Supply the business-form values before running these tests. Login credentials are managed separately in Application Access.</p>
      <div className="actions"><Link className="button" to={destination}>Add test data</Link>
        <Button variant="secondary" onClick={() => setOpen(false)}>Review test cases first</Button></div>
    </DetailDrawer>}
  </>;
}
