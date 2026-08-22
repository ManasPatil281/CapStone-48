import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildStudentLearningState } from "@/lib/adaptive/studentLearningState";
import { extractRoadblockEvidence, type Severity } from "@/lib/adaptive/roadblockEvidence";
import { DiagnosticPanel } from "./DiagnosticPanel";

const SEVERITY_COLOR: Record<Severity, string> = {
  high: "#ff5c5c",
  medium: "#f0c040",
  low: "#8fbcff",
};

/**
 * Read-only debug view of a Student Learning State.
 *
 * Restricted to the STUDENT role and always operates on the authenticated
 * user's own id — a submissionId may be passed via query string, but the
 * studentId is never taken from the client, so this page cannot be used to
 * inspect another student's data.
 *
 * This exists purely to manually verify buildStudentLearningState() output
 * against Supabase before any agent consumes it. It does not mutate anything.
 */
export default async function LearningStateDebugPage({
  searchParams,
}: {
  searchParams: { submissionId?: string };
}) {
  const user = await requireRole(["STUDENT"]);
  const supabase = createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const [{ data: masteryRows }, { data: visitRows }] = await Promise.all([
    supabaseAny.from("student_submission_mastery").select("submission_id").eq("student_id", user.id),
    supabaseAny.from("student_submission_visit").select("submission_id").eq("student_id", user.id),
  ]);

  const knownSubmissionIds = Array.from(
    new Set(
      [...(masteryRows ?? []), ...(visitRows ?? [])]
        .map((r: { submission_id: string | null }) => r.submission_id)
        .filter((id: string | null): id is string => Boolean(id))
    )
  );

  let submissionTitles = new Map<string, string>();
  if (knownSubmissionIds.length > 0) {
    const { data: subRows } = await supabaseAny
      .from("teacher_lo_submission")
      .select("id, title")
      .in("id", knownSubmissionIds);
    submissionTitles = new Map(
      ((subRows ?? []) as Array<{ id: string; title: string }>).map((r) => [r.id, r.title])
    );
  }

  const selectedSubmissionId = searchParams.submissionId || knownSubmissionIds[0] || null;

  const state = selectedSubmissionId
    ? await buildStudentLearningState(user.id, selectedSubmissionId)
    : null;

  const roadblockEvidence = state ? extractRoadblockEvidence(state) : null;

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace", maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Student Learning State (debug)</h1>
      <p style={{ marginBottom: "1rem" }}>
        Signed in as <strong>{user.email}</strong> ({user.id}). This page always shows your own data.
      </p>

      {knownSubmissionIds.length === 0 ? (
        <p>No mastery or visit data found for your account yet. Visit a submission first.</p>
      ) : (
        <ul style={{ marginBottom: "1.5rem", listStyle: "none", padding: 0 }}>
          {knownSubmissionIds.map((id) => (
            <li key={id}>
              <Link
                href={`/debug/learning-state?submissionId=${id}`}
                style={{
                  fontWeight: id === selectedSubmissionId ? "bold" : "normal",
                  textDecoration: id === selectedSubmissionId ? "underline" : "none",
                }}
              >
                {submissionTitles.get(id) ?? id}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {selectedSubmissionId && !state && <p>Could not resolve submission {selectedSubmissionId}.</p>}

      {state && (
        <div style={{ marginBottom: "1.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div style={{ border: "1px solid #333", borderRadius: 6, padding: "0.75rem" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>This submission&apos;s mastery</h2>
            <p>score: {state.mastery?.score ?? "—"}</p>
            <p>level: {state.mastery?.level ?? "—"}</p>
            <p>lastCalculatedAt: {state.mastery?.lastCalculatedAt ?? "—"}</p>
          </div>
          <div style={{ border: "1px solid #333", borderRadius: 6, padding: "0.75rem" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
              LO aggregate mastery ({state.loMastery?.loId ?? "—"})
            </h2>
            <p>score: {state.loMastery?.score ?? "—"} (mean of {state.loMastery?.evidenceSubmissionCount ?? 0})</p>
            <p>level: {state.loMastery?.level ?? "—"}</p>
            <p>
              evidenceSubmissionCount / totalApprovedSubmissions:{" "}
              {state.loMastery?.evidenceSubmissionCount ?? 0} / {state.loMastery?.totalApprovedSubmissions ?? 0}
            </p>
          </div>
        </div>
      )}

      {state && state.loMastery && state.loMastery.breakdown.length > 0 && (
        <table style={{ marginBottom: "1.5rem", borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Submission</th>
              <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Teacher</th>
              <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Score</th>
              <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Level</th>
            </tr>
          </thead>
          <tbody>
            {state.loMastery.breakdown.map((row) => (
              <tr key={row.submissionId}>
                <td style={{ padding: "0.25rem 0.5rem" }}>
                  {row.submissionTitle ?? row.submissionId}
                  {row.submissionId === selectedSubmissionId ? " (selected)" : ""}
                </td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{row.teacherName ?? row.teacherId ?? "Unknown"}</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{row.score ?? "no evidence"}</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{row.level ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {roadblockEvidence && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
            Roadblock evidence — hasPotentialRoadblock:{" "}
            <span style={{ color: roadblockEvidence.hasPotentialRoadblock ? "#ff5c5c" : "#8fbcff" }}>
              {String(roadblockEvidence.hasPotentialRoadblock)}
            </span>
          </h2>

          <p style={{ marginBottom: "0.5rem" }}>
            evidenceAvailability:{" "}
            {Object.entries(roadblockEvidence.evidenceAvailability)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}
          </p>

          {roadblockEvidence.signals.length === 0 ? (
            <p>No signals flagged.</p>
          ) : (
            <table style={{ marginBottom: "1rem", borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Type</th>
                  <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Severity</th>
                  <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Source</th>
                  <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {roadblockEvidence.signals.map((s, i) => (
                  <tr key={`${s.type}-${i}`}>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{s.type}</td>
                    <td style={{ padding: "0.25rem 0.5rem", color: SEVERITY_COLOR[s.severity] }}>{s.severity}</td>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{s.source}</td>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{s.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {roadblockEvidence.prerequisiteEvidence.length > 0 && (
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Prerequisite LO</th>
                  <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Evidence status</th>
                  <th style={{ borderBottom: "1px solid #333", padding: "0.25rem 0.5rem" }}>Best known score</th>
                </tr>
              </thead>
              <tbody>
                {roadblockEvidence.prerequisiteEvidence.map((p) => (
                  <tr key={p.loId}>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{p.title ?? p.loId}</td>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{p.evidenceStatus}</td>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{p.bestKnownScore ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {state && state.prerequisites.coursePrerequisites.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <p style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>
                Course prerequisites (advisory, facts only — no course mastery score is computed):
              </p>
              <ul>
                {state.prerequisites.coursePrerequisites.map((c) => (
                  <li key={c.courseId}>{c.title ?? c.courseId}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {selectedSubmissionId && state && <DiagnosticPanel submissionId={selectedSubmissionId} />}

      {state && (
        <pre
          style={{
            background: "#111",
            color: "#0f0",
            padding: "1rem",
            borderRadius: 6,
            overflowX: "auto",
            fontSize: "0.8rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify({ state, roadblockEvidence }, null, 2)}
        </pre>
      )}
    </div>
  );
}
