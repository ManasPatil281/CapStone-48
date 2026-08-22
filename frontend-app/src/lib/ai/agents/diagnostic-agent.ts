/**
 * Diagnostic Agent.
 *
 * Third layer of the struggle-detection pipeline:
 *
 *   StudentLearningState -> RoadblockEvidence -> Diagnostic Agent -> Diagnosis
 *
 * The deterministic RoadblockEvidence (src/lib/adaptive/roadblockEvidence.ts)
 * remains the factual signal-detection layer. This agent's job is only to
 * INTERPRET those signals and produce a bounded diagnosis of the most likely
 * cause — it does not recompute mastery, does not invent student behaviour,
 * and does not choose a pedagogical action (no REMEDIATE/REVISIT_PREREQUISITE
 * decision here; that belongs to a future planner layer).
 *
 * Like src/lib/ai/agents/struggle-detector.ts, this agent uses a
 * deterministic pre-filter (`evidence.hasPotentialRoadblock`) to avoid
 * unnecessary LLM calls, and falls back to a deterministic, clearly-labeled
 * low-confidence result if the LLM call fails.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGroqChat } from "@/lib/ai/model";
import { DIAGNOSTIC_PROMPT } from "@/lib/ai/prompts";
import { DiagnosisSchema, type Diagnosis } from "@/lib/ai/output-schemas";
import { toTextContent, parseAndValidateJsonObject, isRateLimitError } from "@/lib/ai/structuredOutputFallback";
import type { StudentLearningState } from "@/lib/adaptive/studentLearningState";
import type { RoadblockEvidence } from "@/lib/adaptive/roadblockEvidence";

/* ── Quiz deep-dive types ────────────────────────────────────────────── */

export interface QuizDeepDiveQuestion {
  questionId: string;
  questionText: string;
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
  selectedOptionId: string | null;
  selectedOptionText: string | null;
  /** null when the question wasn't answered or the selected option couldn't be resolved. */
  wasCorrect: boolean | null;
}

export interface QuizDeepDiveAttempt {
  attemptId: string;
  assessmentId: string | null;
  submittedAt: string | null;
  scorePercentage: number | null;
  /** Why this attempt was selected for deep-dive (bounded set, not the full history). */
  role: "best" | "latest" | "other";
  questions: QuizDeepDiveQuestion[];
}

// Bounds to keep the prompt small and focused, not an exhaustive dump.
// Reduced from (3 attempts / 20 questions) after this was found to be the
// single largest contributor to Groq TPM rate-limit failures on gpt-oss-20b
// (see ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md). Latest + best is sufficient for
// the retention-decline pattern this evidence primarily supports — for a
// declining student, "latest" already functionally is the worst attempt.
const MAX_DEEP_DIVE_ATTEMPTS = 2;
const MAX_QUESTIONS_PER_ATTEMPT = 10;

/**
 * Reconstructs question-level evidence for a bounded set of quiz attempts
 * (latest, best-scoring — deduplicated) using only existing
 * stored quiz data: `student_quiz_attempt.selected_answers` (confirmed shape:
 * Record<questionId, selectedOptionId>) and `shown_question_ids` (confirmed
 * shape: string[]), joined against `teacher_lo_submission_question(_option)`.
 * No DB schema changes. Returns [] if there is no quiz evidence.
 */
async function fetchQuizDeepDive(
  studentId: string,
  submissionId: string,
  hasQuizEvidence: boolean
): Promise<QuizDeepDiveAttempt[]> {
  if (!hasQuizEvidence) return [];

  const supabase = createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const { data: attemptRows, error: attemptErr } = await supabaseAny
    .from("student_quiz_attempt")
    .select("id, assessment_id, score_percentage, submitted_at, created_at, shown_question_ids, selected_answers")
    .eq("student_id", studentId)
    .eq("submission_id", submissionId)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (attemptErr) {
    console.error("[diagnostic-agent] Failed to load quiz attempts for deep-dive:", attemptErr);
    return [];
  }

  const attempts = (attemptRows ?? []) as Array<{
    id: string;
    assessment_id: string | null;
    score_percentage: number | null;
    submitted_at: string | null;
    created_at: string | null;
    shown_question_ids: unknown;
    selected_answers: unknown;
  }>;

  if (attempts.length === 0) return [];

  const scored = attempts.filter((a) => typeof a.score_percentage === "number");
  const latest = attempts[0];
  const best =
    scored.length > 0
      ? scored.reduce((p, c) => ((c.score_percentage as number) > (p.score_percentage as number) ? c : p))
      : null;

  const selected: Array<{ attempt: (typeof attempts)[number]; role: QuizDeepDiveAttempt["role"] }> = [];
  const seen = new Set<string>();
  const add = (attempt: (typeof attempts)[number] | null, role: QuizDeepDiveAttempt["role"]) => {
    if (!attempt || seen.has(attempt.id) || selected.length >= MAX_DEEP_DIVE_ATTEMPTS) return;
    seen.add(attempt.id);
    selected.push({ attempt, role });
  };
  add(latest, "latest");
  add(best, "best");

  // Defensive shape validation for jsonb columns — never assume without checking.
  const shownIdsByAttempt = new Map<string, string[]>();
  const selectedAnswersByAttempt = new Map<string, Record<string, string>>();
  for (const { attempt } of selected) {
    const shown = Array.isArray(attempt.shown_question_ids)
      ? (attempt.shown_question_ids as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    shownIdsByAttempt.set(attempt.id, shown.slice(0, MAX_QUESTIONS_PER_ATTEMPT));

    const rawAnswers = attempt.selected_answers;
    const answers: Record<string, string> = {};
    if (rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)) {
      for (const [qId, optId] of Object.entries(rawAnswers as Record<string, unknown>)) {
        if (typeof optId === "string") answers[qId] = optId;
      }
    }
    selectedAnswersByAttempt.set(attempt.id, answers);
  }

  const allQuestionIds = Array.from(new Set(Array.from(shownIdsByAttempt.values()).flat()));
  if (allQuestionIds.length === 0) {
    return selected.map(({ attempt, role }) => ({
      attemptId: attempt.id,
      assessmentId: attempt.assessment_id,
      submittedAt: attempt.submitted_at ?? attempt.created_at ?? null,
      scorePercentage: attempt.score_percentage,
      role,
      questions: [],
    }));
  }

  const [{ data: questionRows, error: questionErr }, { data: optionRows, error: optionErr }] = await Promise.all([
    supabaseAny.from("teacher_lo_submission_question").select("id, question_text").in("id", allQuestionIds),
    supabaseAny
      .from("teacher_lo_submission_question_option")
      .select("id, question_id, option_text, is_correct")
      .in("question_id", allQuestionIds),
  ]);

  if (questionErr) {
    console.error("[diagnostic-agent] Failed to load questions for deep-dive:", questionErr);
  }
  if (optionErr) {
    console.error("[diagnostic-agent] Failed to load options for deep-dive:", optionErr);
  }

  const questionById = new Map(
    ((questionRows ?? []) as Array<{ id: string; question_text: string }>).map((q) => [q.id, q])
  );
  const optionsByQuestionId = new Map<string, Array<{ id: string; option_text: string; is_correct: boolean }>>();
  ((optionRows ?? []) as Array<{ id: string; question_id: string; option_text: string; is_correct: boolean }>).forEach(
    (opt) => {
      const list = optionsByQuestionId.get(opt.question_id) ?? [];
      list.push(opt);
      optionsByQuestionId.set(opt.question_id, list);
    }
  );

  return selected.map(({ attempt, role }) => {
    const shownIds = shownIdsByAttempt.get(attempt.id) ?? [];
    const answers = selectedAnswersByAttempt.get(attempt.id) ?? {};

    const questions: QuizDeepDiveQuestion[] = shownIds
      .map((qId): QuizDeepDiveQuestion | null => {
        const q = questionById.get(qId);
        if (!q) return null;
        const options = optionsByQuestionId.get(qId) ?? [];
        const selectedOptionId: string | null = answers[qId] ?? null;
        const selectedOption = selectedOptionId ? options.find((o) => o.id === selectedOptionId) ?? null : null;
        return {
          questionId: qId,
          questionText: q.question_text,
          options: options.map((o) => ({ id: o.id, text: o.option_text, isCorrect: o.is_correct })),
          selectedOptionId,
          selectedOptionText: selectedOption?.option_text ?? null,
          wasCorrect: selectedOption ? selectedOption.is_correct : selectedOptionId ? null : null,
        };
      })
      .filter((q): q is QuizDeepDiveQuestion => q !== null);

    return {
      attemptId: attempt.id,
      assessmentId: attempt.assessment_id,
      submittedAt: attempt.submitted_at ?? attempt.created_at ?? null,
      scorePercentage: attempt.score_percentage,
      role,
      questions,
    };
  });
}

/* ── Format helpers (structured evidence -> readable prompt text) ───────
 * Follows the same convention as struggle-detector.ts's formatEngagementSignals:
 * plain-text summaries injected via named template variables, not raw JSON.
 */

/**
 * Exported so the pedagogical planner (pedagogical-planner.ts) can reuse the
 * exact same state/roadblock summaries shown to the diagnostic agent,
 * instead of re-deriving a second, potentially inconsistent formatting.
 */
export function formatStateSummary(state: StudentLearningState): string {
  const parts: string[] = [];
  parts.push(`LO: ${state.learningObject?.title ?? "unknown"}`);
  parts.push(`Course: ${state.course?.title ?? "unknown"}`);
  parts.push(
    `Submission mastery: ${state.mastery?.score ?? "no evidence"} (${state.mastery?.level ?? "n/a"})`
  );
  parts.push(
    `LO aggregate mastery: ${state.loMastery?.score ?? "no evidence"} (${state.loMastery?.level ?? "n/a"}, based on ${
      state.loMastery?.evidenceSubmissionCount ?? 0
    }/${state.loMastery?.totalApprovedSubmissions ?? 0} approved submissions)`
  );
  parts.push(
    `Quiz: ${state.quiz.attemptCount} attempt(s)${
      state.quiz.attemptCount > 0
        ? `, best ${state.quiz.bestScorePercentage}%, latest ${state.quiz.latestScorePercentage}%, trend ${state.quiz.trend}`
        : " (no quiz evidence for this LO/submission)"
    }`
  );
  parts.push(
    `Feynman: ${
      state.feynman
        ? `score ${state.feynman.score}, last attempt ${state.feynman.lastAttemptAt ?? "unknown"}`
        : "no Feynman evidence"
    }`
  );
  parts.push(
    `Engagement: ${state.visits.totalVisits} visit(s); content time ${state.contentEngagement.totalActiveSeconds}s active / ${state.contentEngagement.totalIdleSeconds}s idle`
  );
  parts.push(`Active-recall due: ${state.revision.activeRecallEligible}`);

  if (state.prerequisites.prerequisiteDetails.length === 0) {
    parts.push("Prerequisites: none defined for this submission.");
  } else {
    parts.push(
      `Prerequisites: ${state.prerequisites.prerequisiteDetails
        .map((p) => {
          const scores = p.masteryBySubmission.map((m) => m.score).filter((s): s is number => typeof s === "number");
          return scores.length > 0
            ? `${p.title ?? p.loId} (best known mastery: ${Math.max(...scores)})`
            : `${p.title ?? p.loId} (no mastery evidence — UNKNOWN, not zero)`;
        })
        .join("; ")}`
    );
  }

  return parts.join("\n");
}

export function formatRoadblockSummary(evidence: RoadblockEvidence): string {
  if (evidence.signals.length === 0) {
    return "No deterministic roadblock signals were detected.";
  }
  return evidence.signals
    .map((s) => `[${s.severity.toUpperCase()}/${s.source}] ${s.type}: ${s.evidence}`)
    .join("\n");
}

function formatEvidenceAvailability(evidence: RoadblockEvidence): string {
  const lines = Object.entries(evidence.evidenceAvailability).map(
    ([category, available]) => `${category}: ${available ? "available" : "UNAVAILABLE (treat as unknown, not weak)"}`
  );
  if (evidence.prerequisiteEvidence.length > 0) {
    lines.push(
      `prerequisite detail: ${evidence.prerequisiteEvidence
        .map((p) => `${p.title ?? p.loId}=${p.evidenceStatus}`)
        .join(", ")}`
    );
  }
  return lines.join("\n");
}

function formatQuizDeepDive(attempts: QuizDeepDiveAttempt[]): string {
  if (attempts.length === 0) {
    return "No quiz evidence exists for this LO/submission. Do not discuss quiz performance.";
  }
  return attempts
    .map((a) => {
      const header = `Attempt (${a.role}, ${a.scorePercentage ?? "unknown"}%, ${a.submittedAt ?? "unknown date"}):`;
      if (a.questions.length === 0) {
        return `${header}\n  (question detail unavailable for this attempt)`;
      }
      const qLines = a.questions.map((q, i) => {
        const correctOption = q.options.find((o) => o.isCorrect);
        return `  Q${i + 1}: "${q.questionText}" | correct answer: "${correctOption?.text ?? "unknown"}" | student selected: "${
          q.selectedOptionText ?? "no answer recorded"
        }" | correct: ${q.wasCorrect === null ? "unknown" : q.wasCorrect}`;
      });
      return [header, ...qLines].join("\n");
    })
    .join("\n\n");
}

/* ── Public API ──────────────────────────────────────────────────────── */

function deterministicNoRoadblockResult(): Diagnosis {
  return {
    hasRoadblock: false,
    diagnosisType: "NO_ROADBLOCK_DETECTED",
    primaryDiagnosis: "No deterministic roadblock signals were detected for this submission.",
    explanation:
      "The Roadblock Evidence layer found no concerning signals in the currently available data. This does not call the diagnostic LLM to avoid unnecessary API usage.",
    evidence: [],
    possibleWeakConcepts: [],
    confidence: 1,
    evidenceLimitations: [],
    // Unused by the UI today (FocusCard only shows the AI's read when a
    // roadblock exists), but the schema field is required, so a grounded,
    // always-true value is still needed here.
    studentSummary: "Nothing concerning stands out here right now — your recent activity and mastery look healthy.",
  };
}

function deterministicFallbackResult(evidence: RoadblockEvidence): Diagnosis {
  const bySeverity = [...evidence.signals].sort((a, b) => {
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity];
  });
  const top = bySeverity[0];

  // Student-facing copy must stay grounded in the actual evidence and must
  // never leak internal/technical detail ("LLM unavailable", "rate limited",
  // etc.) — that detail belongs in server logs only (see call site).
  return {
    hasRoadblock: true,
    diagnosisType: "INSUFFICIENT_EVIDENCE",
    primaryDiagnosis: top
      ? top.evidence
      : "There's a possible roadblock here, but we don't have enough evidence yet to say exactly why.",
    explanation:
      "This is a deterministic summary of the detected warning signals, without further AI interpretation.",
    evidence: bySeverity.slice(0, 5).map((s) => s.evidence),
    possibleWeakConcepts: [],
    confidence: 0.3,
    evidenceLimitations: ["AI interpretation was unavailable for this diagnosis; only deterministic evidence is shown."],
    studentSummary: "There are some signs this topic may need attention, but there is not enough evidence yet to say exactly why.",
  };
}

/**
 * Produces a bounded, grounded diagnosis of the most likely reason a student
 * is struggling with an LO/submission, given an already-built
 * StudentLearningState and its derived RoadblockEvidence.
 *
 * Does not write to the database. Does not choose a pedagogical action.
 */
export async function diagnoseRoadblock(
  state: StudentLearningState,
  evidence: RoadblockEvidence
): Promise<Diagnosis> {
  if (!evidence.hasPotentialRoadblock) {
    return deterministicNoRoadblockResult();
  }

  const quizDeepDive = await fetchQuizDeepDive(
    state.studentId,
    state.submissionId,
    evidence.evidenceAvailability.quiz
  );

  // Bounded, highly-grounded structured task: use the smaller 20b model to
  // reduce TPM pressure while retaining more reasoning capacity than 8b.
  // maxTokens maps to Groq's max_completion_tokens, which covers this
  // reasoning model's hidden reasoning tokens as well as the final JSON —
  // 900 was getting exhausted by reasoning before the structured output
  // completed (json_validate_failed: max completion tokens reached).
  // maxRetries: 0 — LangChain's own internal retry wrapper would otherwise
  // silently re-attempt a rate-limited request 2 more times before our code
  // ever sees the error, burning TPM quota that our own fallback logic below
  // is specifically trying to conserve.
  const model = getGroqChat({ model: "openai/gpt-oss-20b", temperature: 0.2, maxTokens: 2500, maxRetries: 0 });

  const prompt = await DIAGNOSTIC_PROMPT.formatMessages({
    stateSummary: formatStateSummary(state),
    roadblockSummary: formatRoadblockSummary(evidence),
    evidenceAvailability: formatEvidenceAvailability(evidence),
    quizDeepDive: formatQuizDeepDive(quizDeepDive),
  });

  // gpt-oss-20b is unreliable with Groq's default native "jsonSchema" mode
  // for this schema (observed: provider-level json_validate_failed —
  // "expected object, but got array" / schema echoed back instead of an
  // instance). Same layered fallback already proven for gpt-oss models in
  // src/lib/ai/agents/learning-router.ts:
  //   1. functionCalling structured output (different decode path, Zod-validated)
  //   2. plain invocation + manual JSON-object extraction + Zod safeParse —
  //      but ONLY when attempt 1 failed for a malformed-output reason, not
  //      a rate-limit error (retrying an already-rate-limited request just
  //      consumes more quota for another near-certain rejection)
  //   3. existing deterministic fallback (unchanged)
  try {
    const structuredModel = model.withStructuredOutput(DiagnosisSchema, { method: "functionCalling" });
    return await structuredModel.invoke(prompt);
  } catch (functionCallingError) {
    if (isRateLimitError(functionCallingError)) {
      console.error(
        "[diagnostic-agent] Rate limited by Groq on the first attempt; skipping the plain-text retry and using the deterministic fallback.",
        functionCallingError
      );
      return deterministicFallbackResult(evidence);
    }

    console.warn(
      "[diagnostic-agent] functionCalling structured output failed, falling back to plain-text JSON parsing:",
      functionCallingError
    );
    try {
      const raw = await model.invoke(prompt);
      const text = toTextContent(raw.content);
      return parseAndValidateJsonObject(text, DiagnosisSchema);
    } catch (parseError) {
      if (isRateLimitError(parseError)) {
        console.error("[diagnostic-agent] Rate limited by Groq on the plain-text retry too:", parseError);
      } else {
        console.error("[diagnostic-agent] Plain-text JSON fallback also failed:", parseError);
      }
      return deterministicFallbackResult(evidence);
    }
  }
}
