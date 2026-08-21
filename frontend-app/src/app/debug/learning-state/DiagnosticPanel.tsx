"use client";

import { useState } from "react";
import type { Diagnosis, PedagogicalPlan } from "@/lib/ai/output-schemas";
import type { PlannerContext } from "@/lib/adaptive/plannerContext";

const SEVERITY_COLOR: Record<string, string> = {
  high: "#ff5c5c",
  medium: "#f0c040",
  low: "#8fbcff",
};

type RunStatus = "idle" | "loading" | "error" | "done";

interface PlanResponse {
  plan: PedagogicalPlan;
  groundingNotes: string[];
  context: PlannerContext;
}

/**
 * Client-side control for /debug/learning-state that shows the full
 * pipeline: Student Learning State -> Roadblock Evidence (already rendered
 * by the server component) -> Diagnostic Agent -> Pedagogical Planner.
 *
 * Both the diagnostic agent and the planner are invoked only on explicit
 * button press — never automatically on page load. The planner button is
 * only enabled once a diagnosis has been fetched, since the planner uses
 * that diagnosis (POST /api/ai/diagnose then POST /api/ai/plan) rather than
 * silently re-running diagnosis itself.
 */
export function DiagnosticPanel({ submissionId }: { submissionId: string }) {
  const [diagnosisStatus, setDiagnosisStatus] = useState<RunStatus>("idle");
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  const [planStatus, setPlanStatus] = useState<RunStatus>("idle");
  const [planError, setPlanError] = useState<string | null>(null);
  const [planResult, setPlanResult] = useState<PlanResponse | null>(null);

  async function runDiagnostic() {
    setDiagnosisStatus("loading");
    setDiagnosisError(null);
    // Running a fresh diagnosis invalidates any previously generated plan.
    setPlanResult(null);
    setPlanStatus("idle");
    try {
      const res = await fetch("/api/ai/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setDiagnosis(data.diagnosis as Diagnosis);
      setDiagnosisStatus("done");
    } catch (e) {
      setDiagnosisError(e instanceof Error ? e.message : "Unknown error");
      setDiagnosisStatus("error");
    }
  }

  async function runPlanner() {
    if (!diagnosis) return;
    setPlanStatus("loading");
    setPlanError(null);
    try {
      const res = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, diagnosis }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setPlanResult(data as PlanResponse);
      setPlanStatus("done");
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Unknown error");
      setPlanStatus("error");
    }
  }

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {/* ── Diagnostic agent ── */}
      <div style={{ border: "1px solid #333", borderRadius: 6, padding: "0.75rem", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Diagnostic agent</h2>
        <button
          onClick={runDiagnostic}
          disabled={diagnosisStatus === "loading"}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 4,
            border: "1px solid #555",
            background: diagnosisStatus === "loading" ? "#222" : "#333",
            color: "#eee",
            cursor: diagnosisStatus === "loading" ? "not-allowed" : "pointer",
            fontFamily: "monospace",
            marginBottom: "1rem",
          }}
        >
          {diagnosisStatus === "loading" ? "Running diagnostic agent…" : "Run diagnostic agent"}
        </button>

        {diagnosisStatus === "error" && <p style={{ color: "#ff5c5c" }}>Error: {diagnosisError}</p>}

        {diagnosis && (
          <div>
            <p>
              hasRoadblock: <strong>{String(diagnosis.hasRoadblock)}</strong> | diagnosisType:{" "}
              <strong>{diagnosis.diagnosisType}</strong> | confidence: <strong>{diagnosis.confidence}</strong>
            </p>
            <p style={{ marginTop: "0.5rem" }}>
              <strong>{diagnosis.primaryDiagnosis}</strong>
            </p>
            <p style={{ marginTop: "0.5rem", color: "#aaa" }}>{diagnosis.explanation}</p>

            {diagnosis.evidence.length > 0 && (
              <>
                <p style={{ marginTop: "0.5rem", fontWeight: "bold" }}>Evidence:</p>
                <ul>
                  {diagnosis.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </>
            )}

            {diagnosis.possibleWeakConcepts.length > 0 && (
              <>
                <p style={{ marginTop: "0.5rem", fontWeight: "bold" }}>Possible weak concepts (inferential):</p>
                <ul>
                  {diagnosis.possibleWeakConcepts.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </>
            )}

            {diagnosis.evidenceLimitations.length > 0 && (
              <>
                <p style={{ marginTop: "0.5rem", fontWeight: "bold", color: SEVERITY_COLOR.medium }}>
                  Evidence limitations:
                </p>
                <ul>
                  {diagnosis.evidenceLimitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </>
            )}

            <pre
              style={{
                marginTop: "1rem",
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
              {JSON.stringify(diagnosis, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* ── Pedagogical planner ── */}
      <div style={{ border: "1px solid #333", borderRadius: 6, padding: "0.75rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Pedagogical planner</h2>
        {!diagnosis && <p style={{ color: "#888", marginBottom: "0.5rem" }}>Run the diagnostic agent first.</p>}
        <button
          onClick={runPlanner}
          disabled={!diagnosis || planStatus === "loading"}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 4,
            border: "1px solid #555",
            background: !diagnosis || planStatus === "loading" ? "#222" : "#333",
            color: diagnosis ? "#eee" : "#666",
            cursor: !diagnosis || planStatus === "loading" ? "not-allowed" : "pointer",
            fontFamily: "monospace",
            marginBottom: "1rem",
          }}
        >
          {planStatus === "loading" ? "Running pedagogical planner…" : "Run pedagogical planner"}
        </button>

        {planStatus === "error" && <p style={{ color: "#ff5c5c" }}>Error: {planError}</p>}

        {planResult && (
          <div>
            <p>
              action: <strong>{planResult.plan.action}</strong> | confidence:{" "}
              <strong>{planResult.plan.confidence}</strong>
            </p>
            <p style={{ marginTop: "0.5rem" }}>
              targetLoId: {planResult.plan.targetLoId ?? "—"} | targetSubmissionId:{" "}
              {planResult.plan.targetSubmissionId ?? "—"} | targetDeliveryTypeId:{" "}
              {planResult.plan.targetDeliveryTypeId ?? "—"}
            </p>
            <p style={{ marginTop: "0.5rem", color: "#aaa" }}>{planResult.plan.reason}</p>

            {planResult.plan.supportingSignals.length > 0 && (
              <>
                <p style={{ marginTop: "0.5rem", fontWeight: "bold" }}>Supporting signals:</p>
                <ul>
                  {planResult.plan.supportingSignals.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {planResult.plan.alternativesConsidered.length > 0 && (
              <>
                <p style={{ marginTop: "0.5rem", fontWeight: "bold" }}>Alternatives considered:</p>
                <ul>
                  {planResult.plan.alternativesConsidered.map((a, i) => (
                    <li key={i}>
                      {a.action}: {a.reasonNotChosen}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {planResult.groundingNotes.length > 0 && (
              <>
                <p style={{ marginTop: "0.5rem", fontWeight: "bold", color: SEVERITY_COLOR.medium }}>
                  Grounding corrections applied:
                </p>
                <ul>
                  {planResult.groundingNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </>
            )}

            <pre
              style={{
                marginTop: "1rem",
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
              {JSON.stringify(planResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
