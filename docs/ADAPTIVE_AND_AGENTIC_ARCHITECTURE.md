> Documentation status
>
> This document describes the current Pathfinder codebase reviewed from
> `CapStone-48-agentic-ai-integration`. Do not treat planned or proposed
> functionality as implemented unless it is explicitly labelled as
> implemented. When code and documentation disagree, inspect the code
> and notify the user rather than silently choosing one interpretation.

# Pathfinder adaptive and agentic architecture

## 1. Purpose

This document explains how Pathfinder currently converts student
learning data into mastery estimates, recommendations and agentic
interventions, and records the intended research direction.

The current research priority is:

> Use the broad set of behavioural, performance and curriculum signals
> collected from students to identify learning roadblocks and select the
> best next pedagogical action.

For general project structure, refer to `PROJECT_CONTEXT.md`.

For exact tables, columns, FKs and persistence flows, refer to
`DATABASE_AND_DATA_FLOW.md`.

For safe implementation rules, refer to `CODING_AGENT_RULES.md`.

## 2. Two layers of adaptiveness

Pathfinder currently has two complementary adaptive layers.

### Layer A: deterministic/data-driven adaptation

This includes:

-   behavioural tracking;
-   deterministic mastery calculation;
-   rule-based recommendation sections;
-   prerequisite/postrequisite graph traversal;
-   data-derived popular course path;
-   explicit thresholds and fallbacks.

Advantages:

-   explainable;
-   reproducible;
-   easy to validate;
-   suitable as a research baseline.

### Layer B: agentic/LLM-assisted adaptation

This includes:

-   tool-using tutor;
-   learning router;
-   struggle detector;
-   remediation;
-   Feynman/Socratic evaluation;
-   spaced repetition;
-   graph mutation;
-   peer matching;
-   teacher analytics;
-   other specialist agents.

Advantages:

-   can combine heterogeneous signals;
-   can reason about context;
-   can generate interventions;
-   can select or explain actions that are difficult to encode as a
    single fixed rule.

The research architecture should preserve both layers rather than
replacing all deterministic logic with LLM calls.

## 3. Student signals currently represented in code

### Mastery

`student_submission_mastery` is used as the persistent
student/submission mastery representation.

### Submission visits

Recent visits are used to infer:

-   what the student recently studied;
-   revisit/continue opportunities;
-   active versus idle engagement;
-   traversal patterns.

### Content-block engagement

Per-block active/idle time is used by mastery and content-style
analysis.

### Quiz trajectories

The system stores quiz attempts and uses:

-   score;
-   multiple attempts;
-   latest/best performance;
-   improvement;
-   randomisation mode;
-   timing of prior attempts.

### Teaching/delivery preference

The recommendation layer aggregates active time by delivery type.

Important research caveat:

> Higher active time indicates engagement/exposure, not necessarily that
> the teaching method is more effective for the student.

A future effectiveness model should compare subsequent learning gain
after exposure to each teaching method.

### Curriculum graph

Teacher-defined prerequisite/postrequisite edges provide structural
knowledge about what can precede/follow an LO.

### Feynman conceptual signal

Student explanations can be evaluated to add evidence about conceptual
understanding that is different from multiple-choice performance.

## 4. Deterministic mastery engine

Source:

`src/lib/mastery/calculateMasteryScore.ts`

### 4.1 Content score

For each content block with a positive `recommendedTimeSeconds`:

`ratio = activeSeconds / recommendedTimeSeconds`

Current scoring:

-   ratio \< 0.7: scaled score `(ratio / 0.7) * 70`
-   ratio 0.7--1.3: score `100`
-   ratio \> 1.3: decreasing score `100 - (ratio - 1.3) * 20`, floored
    at `60`

The content score is the average across eligible blocks, rounded to one
decimal.

Interpretation: substantially under-consuming a recommended block
reduces the engagement-derived score; a broad on-target band receives
full credit; extreme over-time is treated as a possible
difficulty/inefficiency signal.

This is a heuristic and should be described as such in research writing.

### 4.2 Quiz score

The best valid quiz attempt is selected.

A multiplier is applied based on `randomizationMode`:

-   mode 0: ×1.00
-   mode 1: ×1.05
-   mode 2: ×1.10

Result is capped at 100.

### 4.3 Idle penalty

Total content idle time is compared with total active time.

`idlePenalty = min(8, idle / active * 8)`

No active time means no idle penalty.

### 4.4 Improvement bonus

With at least two timestamped attempts:

-   compare earliest score with latest score;
-   no bonus if latest \<= earliest;
-   otherwise `(latest - earliest) / 4`;
-   cap at +5.

### 4.5 Signal combination

If both content and quiz scores exist:

`combined = 0.5 * contentScore + 0.5 * quizScore`

Content only:

`combined = contentScore`

Quiz only:

`combined = 0.75 * quizScore`

Neither:

`combined = 0`

Final:

`mastery = clamp(combined - idlePenalty + improvementBonus, 0, 100)`

rounded to one decimal.

### 4.6 Mastery levels

-   0--39: Beginner
-   40--69: Developing
-   70--84: Proficient
-   85--100: Mastered

Do not change these thresholds without explicit approval and
documentation update.

## 5. Feynman mastery signal

The Feynman feature evaluates a student's own explanation of an LO.

The current design uses a validated 0--100 explanation score.

Where the prototype mastery update is used, the intended conservative
blend is:

`newMastery = 0.7 * existingMastery + 0.3 * feynmanScore`

For a missing mastery row, the prototype can initialise conservatively
from a fraction of the Feynman score rather than treating one
explanation as complete mastery.

The agentic Feynman code now includes a LangGraph/Socratic workflow and
a multi-agent evaluator in the reviewed source. Exact route behaviour
should be verified before describing every internal stage as part of the
live UI.

Research significance:

Quiz performance measures one form of retrieval/assessment performance.
Feynman explanation adds a separate conceptual-expression signal and can
expose misconceptions that a quiz may miss.

## 6. Current deterministic recommendation sections

Source:

`src/app/recommendations/page.tsx`

### 6.1 Continue learning

Primary idea:

-   consider recently visited submissions;
-   keep submissions with missing mastery or mastery \< 70;
-   prioritise recent activity;
-   recommend continuing/revisiting.

Pedagogical action: **continue/reinforce**.

### 6.2 Recommended next LOs

Primary idea:

-   identify mastered/proficient submissions (\>=70);
-   map those submissions to their LOs;
-   follow prerequisite graph edges from mastered source LOs to target
    LOs;
-   recommend approved target submissions not already mastered.

Pedagogical action: **advance**.

Fallbacks may be used when graph/mastery signals are insufficient.

### 6.3 Preferred content/teaching style

Primary idea:

-   aggregate `student_content_block_time` active seconds by delivery
    type;
-   identify the highest-engagement delivery type;
-   recommend approved submissions containing that delivery type;
-   avoid already mastered items where appropriate.

Pedagogical action: **reinforce through an engaged teaching method**.

Research caveat: this is currently engagement-based preference, not
proven learning-effectiveness personalisation.

### 6.4 Active recall/revision

Primary idea:

-   inspect prior quiz attempts;
-   select previously strong performance;
-   trigger a revision recommendation after an interval.

The reviewed recommendations page currently has:

`ACTIVE_RECALL_DAYS = 0`

This is a testing/demo value and must not be represented as a
research-grade spaced-repetition interval.

Pedagogical action: **retrieve/revise**.

### 6.5 Feynman technique

Primary idea:

-   identify under-mastered submissions;
-   ask the student to explain the LO in their own words;
-   evaluate conceptual understanding;
-   return feedback and an additional mastery signal.

Pedagogical action: **explain/diagnose conceptual gaps**.

## 7. Data-driven popular path

Source:

`src/lib/popularity/computePopularPath.ts`

The popular path is based on actual student visit sequences.

Algorithm:

1.  Filter visits to LOs in the course.
2.  Count unique students visiting each LO.
3.  Group visits by student.
4.  Sort each student's visits by `started_at`.
5.  Deduplicate consecutive visits to the same LO.
6.  Count observed LO-to-LO transitions.
7.  Build the teacher/course graph.
8.  Find graph roots (nodes with no incoming course edge).
9.  Start from the most-visited root.
10. Greedily follow the valid outgoing course edge with the highest
    observed transition count.
11. Stop when no observed valid transition remains.
12. Return no highlighted path unless at least two nodes have a real
    observed transition.

Therefore the popular path is constrained by the course graph but
weighted by real student traversal.

It is not based on mastery.

Research opportunity: compare expert-defined course graph, population
traversal path and personalised student path.

## 8. Learning router agent

Source:

`src/lib/ai/agents/learning-router.ts`

The learning router is explicitly designed as a personalised
recommendation engine.

Its `StudentSignals` include:

-   mastery scores;
-   recent visits;
-   quiz trajectories;
-   content-style preferences.

It also receives:

-   available submissions;
-   prerequisite edges.

The router can produce recommendation section types:

-   `continue`
-   `next`
-   `style`
-   `recall`
-   `feynman`

The implementation contains both LLM-based structured recommendation
generation and a heuristic recommendation fallback.

This hybrid design is valuable for research because deterministic logic
can serve as a baseline/fallback while the LLM can reason across
signals.

## 9. Struggle detection

Source:

`src/lib/ai/agents/struggle-detector.ts`

The struggle detector receives:

-   session active seconds;
-   session idle seconds;
-   total visits;
-   current mastery;
-   previous mastery;
-   recent quiz scores;
-   current block time;
-   whether a quiz was attempted this session;
-   recent idle ratio;
-   current LO/content context.

### Current heuristic pre-filter

Potential struggle is detected before an LLM call if any of the
following occurs:

-   recent idle ratio \> 1.5;

-   latest quiz score declined by more than 10 points relative to the
    previous score;

-   mastery changes by \<5 points after at least 3 visits;

-   300 seconds on one block without attempting a quiz;

-   mastery \<40 after at least 4 visits.

If no heuristic is triggered, no LLM call is needed.

If struggle may exist, an LLM performs a more nuanced intervention
decision.

If the LLM fails, a deterministic micro-hint fallback is returned.

This is a strong foundation for the research question because it
combines behavioural and performance signals rather than equating
struggle with one low quiz score.

## 10. Tutor agent

Source:

`src/lib/ai/agents/tutor-agent.ts`

The tutor uses LangGraph's `createReactAgent`.

Documented/implemented tools include access to information such as:

-   prerequisites;
-   quiz weakness;
-   content blocks;
-   mastery status.

This makes the tutor different from a generic chatbot: it can select
tools to retrieve student/curriculum context before answering.

For research claims, distinguish tool use from recommendation-policy
autonomy.

## 11. Feynman/Socratic and multi-agent evaluation

Relevant sources:

-   `feynman-coach.ts`
-   `multi-agent-evaluator.ts`

The Feynman coach uses a LangGraph `StateGraph`.

The documented flow includes evaluation, misconception detection,
follow-up and grading stages.

The multi-agent evaluator contains specialised perspectives including an
optimistic/defending evaluator, a strict evaluator and a judge that
synthesises a final 0--100 score.

All generated scores must remain schema-validated before affecting
persistent mastery.

## 12. Remediation agent

Source:

`remediation-agent.ts`

Purpose:

When a student is struggling, generate targeted remediation rather than
merely report low performance.

The architecture is intended to produce focused learning interventions
such as misconception correction, a mental model and a check question.

Research significance:

This converts detection into an actionable pedagogical response.

## 13. Spaced repetition agent

Source:

`spaced-repetition-agent.ts`

The agent considers historical quiz information including:

-   prior score;
-   time since attempt;
-   attempt count;
-   other supplied engagement/retention context.

It is intended to move beyond the simple fixed-day active-recall
prototype.

Before making claims about an exact Ebbinghaus formula, inspect the
implementation and its prompt/calculation path. Do not claim a
mathematically implemented forgetting curve solely from
naming/documentation.

## 14. Graph mutator agent

Source:

`graph-mutator-agent.ts`

This capability reasons about possible learning-graph adaptation,
including skipping redundant introductory material when mastery supports
doing so.

This is highly relevant to the research direction of personalised
prerequisite and next-step selection.

However, a critical safety principle is:

> Teacher-defined curriculum structure should remain the authoritative
> graph. Personalisation should initially modify a student's
> traversal/recommendation through that graph rather than silently
> rewriting the canonical curriculum.

Any persistent graph mutation requires explicit approval and
deterministic validation.

## 15. Peer matching, viva and code-pair agents

The reviewed source also includes:

-   peer matching;
-   mock interviewer/viva;
-   Socratic code-pair programming.

These demonstrate extensibility but are secondary to the current
student-recommendation research focus.

Do not allow these peripheral capabilities to dilute the main research
contribution.

## 16. Teacher-side agents

The codebase includes:

-   course analytics agent;
-   course authoring agent.

These are useful platform capabilities but the current research priority
is student adaptation.

Teacher analytics can still support the research story by showing how
aggregated student-state data can surface cohort-level roadblocks.

## 17. Student Learning State (implemented, read-only builder)

A first version of the Student Learning State (SLS) is implemented as a
read-only, non-LLM aggregator:

`src/lib/adaptive/studentLearningState.ts` — `buildStudentLearningState(studentId, submissionId): Promise<StudentLearningState | null>`

This builder does not call an LLM, does not write to the database, and does
not change `calculateMasteryScore.ts` or persisted mastery in any way — it
reads the existing `student_submission_mastery` row as-is. It assembles, for
one student/submission pair:

-   course and LO identity;
-   persisted mastery score/level/metadata (including Feynman fields already
    stored in `metadata_json`, surfaced separately as a convenience view —
    not a new table);
-   quiz attempt history/count/best/latest and a trend label reusing the
    existing ±5-point first-vs-last convention from
    `src/lib/ai/tools/quiz-weakness.ts`;
-   visit counts and active/idle seconds for this submission;
-   per-content-block active/idle time joined with `recommended_time_seconds`;
-   delivery-type active-time breakdown **scoped to this submission only**
    (explicitly not a cross-submission "learning style" — exposure/engagement
    signal only, per §3 caveats above);
-   submission-scoped prerequisite/postrequisite LO ids from
    `teacher_lo_submission_edge`, using the same submission-scoped query
    pattern as the submission detail page;
-   prerequisite mastery reported **per prerequisite submission, not
    aggregated/averaged** across submissions of the same LO, because no
    aggregation rule is currently defined or approved;
-   active-recall eligibility, reusing the exact rule/threshold
    (`ACTIVE_RECALL_DAYS`, currently `0`, score ≥ 70) from the "Active
    recall / revision reminders" section of `src/app/recommendations/page.tsx`
    (duplicated as a local constant since that page does not export it).

A read-only debug page at `/debug/learning-state` (STUDENT role only, always
scoped to the authenticated user's own id) renders the generated state as
JSON for manual verification against Supabase.

### Derived LO-level aggregate mastery

The builder also exposes `loMastery`, a derived, read-only aggregate of
mastery across all **approved, non-soft-deleted** teacher submissions for
the LO underlying the requested submission (same soft-delete convention —
`notes` starting with `[SOFT_DELETED]` — as `isSoftDeletedSubmission()` in
`src/app/recommendations/page.tsx`).

Rules (v1, intentionally simple):

-   only submissions where this student has an actual
    `student_submission_mastery` row count as evidence;
-   a missing mastery row is excluded from the calculation, **never**
    treated as 0;
-   `score = arithmetic mean of available submission mastery scores,
    rounded to 1 decimal`;
-   `level` uses the existing thresholds (`<40` Beginner, `40–69`
    Developing, `70–84` Proficient, `>=85` Mastered) — same thresholds as
    submission-level mastery, not a new scale;
-   `evidenceSubmissionCount` / `totalApprovedSubmissions` and a
    per-submission `breakdown` (submission id/title, teacher id/name, score,
    level) are exposed alongside the aggregate so the number is auditable,
    not just a black-box average.

This is intentionally a simple, transparent v1: no weighting by recency,
attempt count, or teacher, and it does **not** feed recommendations, agents,
or prerequisite routing yet. `mastery` (submission-level, for the requested
submission) and `loMastery` (LO-level aggregate) are both present on the
state and must not be confused with each other.

### Roadblock Evidence extraction (deterministic, first layer only)

`src/lib/adaptive/roadblockEvidence.ts` — `extractRoadblockEvidence(state: StudentLearningState): RoadblockEvidence`

This is the **first layer** of struggle detection: a pure, synchronous,
deterministic transformation of an already-built Student Learning State into
a structured list of factual warning signals. It does not call an LLM, does
not query the database (it only reads fields already present on the state),
and does not decide a pedagogical action — no `REMEDIATE`,
`REVISIT_PREREQUISITE`, or similar decision is made here. That belongs to a
future planner layer that consumes this evidence.

Core rule: **absence of a signal is never a negative finding.** Every check
is gated behind an explicit "evidence exists" condition (e.g.
`quiz.attemptCount > 0`, `feynman !== null`, a prerequisite having an actual
`mastery` row). Where a category has no usable evidence, nothing is flagged
for it and the corresponding `evidenceAvailability` flag is `false`.

Signal categories and v1 thresholds (all explicit constants in the file):

-   **Mastery**: low submission mastery / low LO-aggregate mastery (both
    `<70`), and submission mastery notably below LO-aggregate (`>=20` point
    gap, directional).
-   **Quiz** (only when `quiz.attemptCount > 0`): single very-low latest
    score (`<40`), majority of attempts below 70%, latest substantially
    below best (`>=15`/`>=30` points), declining trend (reuses the existing
    `quiz.trend` field, no new trend math), 3+ attempts never reaching
    proficiency, and a sharp regression from a previously strong best
    (`>=70`) to a recent low (`<50`).
-   **Retention**: reuses `state.revision.activeRecallEligible` exactly as
    computed elsewhere — no new spaced-repetition/forgetting-curve logic was
    added here.
-   **Engagement** (exposure/attention only, never treated as proof of
    understanding): idle ratio `>1.5` on content-block time (same constant
    already documented for `struggle-detector.ts` §9), `>=4` visits with
    mastery still `<40` (same existing struggle-detector rule), and active
    time `>2x` the combined recommended time on timed blocks with no
    improving quiz trend to explain it.
-   **Prerequisites**: per-prerequisite evidence is resolved to
    `"concerning"` (best known score `<70`), `"healthy"` (`>=70`), or
    `"unavailable"` (no mastery row on any submission for that LO) —
    exposed as its own `prerequisiteEvidence` array so missing evidence is
    visible rather than silently dropped. A low-mastery signal is only
    emitted for `"concerning"` entries. A separate signal flags when the
    current LO is weak (`<40`) while a prerequisite appears strong (`>=70`).
-   **Feynman** (only when a Feynman score exists): low score (`<70`), and a
    `>=20` point gap where quiz/mastery performance is notably higher than
    the Feynman score (possible surface-level performance).

The exact numeric thresholds beyond the two reused from
`struggle-detector.ts` are new v1 defaults chosen conservatively; they are
isolated named constants at the top of the file and can be tuned without
touching the extraction logic.

The `/debug/learning-state` page (STUDENT-only, self-scoped) now also
renders the generated `RoadblockEvidence` — signal table with
type/severity/source/evidence, `evidenceAvailability`, and the
per-prerequisite evidence-status table — next to the raw Student Learning
State JSON, for manual verification.

### Diagnostic Agent (LLM interpretation of RoadblockEvidence, implemented)

Pipeline: `StudentLearningState -> RoadblockEvidence -> Diagnostic Agent -> Diagnosis`.

Source: `src/lib/ai/agents/diagnostic-agent.ts`, exporting
`diagnoseRoadblock(state, evidence): Promise<Diagnosis>`.

This is the first LLM-based layer in the pipeline. Its responsibility is
strictly to **interpret** the deterministic RoadblockEvidence signals and
produce a bounded diagnosis of the most likely cause of difficulty — it does
not recompute mastery, does not invent behaviour not present in the supplied
evidence, and does not select a pedagogical action (no `REMEDIATE`,
`REVISIT_PREREQUISITE`, etc.). That remains a future planner layer.

**Deterministic pre-filter (reused pattern from `struggle-detector.ts`):**
if `evidence.hasPotentialRoadblock === false`, the LLM is never called; a
deterministic `NO_ROADBLOCK_DETECTED` result is returned immediately. This
avoids unnecessary API usage exactly like `struggle-detector.ts`'s
`mightBeStruggling()` pre-filter.

**Output schema** — `DiagnosisSchema` in `src/lib/ai/output-schemas.ts`
(same Zod + `withStructuredOutput()` convention as every other agent in this
codebase): `hasRoadblock`, `diagnosisType` (bounded enum), `primaryDiagnosis`,
`explanation`, `evidence: string[]`, `possibleWeakConcepts: string[]`,
`confidence: number 0-1`, `evidenceLimitations: string[]`.

`diagnosisType` enum:

-   `CONCEPTUAL_DIFFICULTY`
-   `PREREQUISITE_GAP`
-   `RETENTION_DIFFICULTY`
-   `ENGAGEMENT_DIFFICULTY`
-   `ASSESSMENT_DIFFICULTY`
-   `SUBMISSION_SPECIFIC_DIFFICULTY`
-   `INSUFFICIENT_EVIDENCE`
-   `NO_ROADBLOCK_DETECTED` — added beyond the originally-proposed set,
    because none of the other categories correctly describe "the
    deterministic layer found nothing." It is only ever returned by the
    code-level pre-filter above, never chosen by the LLM itself.

**Quiz deep-dive (question-level evidence, existing storage only, no schema
change).** When `evidenceAvailability.quiz` is true, `diagnostic-agent.ts`
independently queries `student_quiz_attempt` for this student/submission and
selects a bounded set (latest, best-scoring, worst-scoring — deduplicated,
capped at 3 attempts, capped at 20 questions/attempt) to keep the prompt
small and focused rather than dumping full history. For each selected
attempt it reconstructs, purely from existing tables:

-   the actual question text (`teacher_lo_submission_question`);
-   the actual options and which one is correct
    (`teacher_lo_submission_question_option.is_correct`);
-   the student's actual selected option, from `selected_answers`
    (confirmed shape: `Record<questionId, optionId>` — see
    `DATABASE_AND_DATA_FLOW.md` §8) restricted to the question ids in
    `shown_question_ids` (confirmed shape: `string[]`) for that attempt.

No question-topic tagging is required from teachers — the LLM reasons
directly from LO title + question text + correct answer + student's answer.
Both jsonb shapes are validated defensively before use rather than assumed.
If there is no quiz evidence, `quizDeepDive` is `[]` and the prompt is told
explicitly not to discuss quiz performance.

**Grounding controls** (best-effort via structure + prompting, consistent
with how every other agent in this codebase is grounded — not a hard
guarantee against hallucination):

-   all evidence is pre-formatted into plain-text summaries (same convention
    as `struggle-detector.ts`'s `formatEngagementSignals`), never raw
    `JSON.stringify` dumped into the prompt;
-   the prompt explicitly lists `evidenceAvailability` per category and
    instructs the model to treat an unavailable category as unknown, never
    as weak/failing;
-   the prompt requires the model to separate observed facts (`evidence`
    array) from inference (`explanation`, `possibleWeakConcepts`);
-   low temperature (0.2) and a Zod-validated bounded enum via
    `withStructuredOutput()`;
-   on LLM failure, a deterministic fallback (same pattern as
    `struggle-detector.ts`) restates the top deterministic RoadblockEvidence
    signals at low confidence (`0.3`) rather than returning a 500 or
    fabricating a diagnosis.

**Structured-output reliability on `gpt-oss-20b`.** Both this agent and the
Pedagogical Planner (below) use `openai/gpt-oss-20b`. `@langchain/groq`
auto-selects Groq's native `"jsonSchema"` structured-output mode for any
`openai/gpt-oss*` model when no method is specified — this enforces the
schema server-side and can reject a smaller model's output with a
provider-level `json_validate_failed` error (observed: "expected object, but
got array", the model echoing parts of the schema itself) before it ever
reaches our code. Both agents now use the same three-layer fallback already
proven for `gpt-oss` models in `src/lib/ai/agents/learning-router.ts`
(`src/lib/ai/structuredOutputFallback.ts` holds the shared helpers):

1.  `withStructuredOutput(Schema, { method: "functionCalling" })` — a
    different, tool-calling-based decode path, still Zod-validated;
2.  on failure, a plain (non-structured) `model.invoke()` call, with the raw
    text's first `{...}` object extracted and validated with
    `Schema.safeParse()` — malformed/wrong-shaped JSON (including an
    array-rooted response) is rejected here exactly as it would be by
    `withStructuredOutput`, so nothing unvalidated can reach the caller;
3.  on failure, the existing deterministic fallback described above
    (unchanged).

Both prompts also gained one short, additive output-format line ("return
exactly ONE JSON object... do not repeat or restate the JSON schema
itself") to help the plain-JSON fallback path; no other prompt content
changed.

**API route** — `POST /api/ai/diagnose` (`src/app/api/ai/diagnose/route.ts`):
auth pattern copied from `api/feynman/evaluate/route.ts`
(`supabase.auth.getUser()` → 401 → `user_profile.role` lookup → 403 unless
`STUDENT`). The authenticated user's id is always used as the student id;
any client-supplied student id would be ignored — only `submissionId` is
accepted from the request body. Read-only: builds the state, extracts
evidence, runs the diagnostic agent, and returns all three — nothing is
persisted to the database.

**Debug integration** — `/debug/learning-state` now also renders a
`DiagnosticPanel` (`src/app/debug/learning-state/DiagnosticPanel.tsx`, a
client component) with an explicit **"Run diagnostic agent"** button that
calls `POST /api/ai/diagnose`. The LLM is never invoked automatically on
page load — only on demand, to control API usage and keep testing
deterministic. Existing debug sections (Student Learning State JSON,
RoadblockEvidence tables) are unchanged.

### Pedagogical Planner (chooses the next action, implemented; not yet wired to recommendations)

Pipeline: `StudentLearningState -> RoadblockEvidence -> Diagnosis -> Pedagogical Planner`.

Source: `src/lib/ai/agents/pedagogical-planner.ts`, exporting
`planPedagogicalAction(state, evidence, diagnosis, context): Promise<PlannerResult>`.

The planner does **not** diagnose again — it decides the single best next
pedagogical action, using `StudentLearningState`/`RoadblockEvidence` as the
factual source of truth and the `Diagnosis` only as an interpretive hint
(its free-text fields are never treated as new facts). It sits above
existing specialist agents as an orchestration/decision layer and does not
invoke or modify them — `REMEDIATE` would map to `remediation-agent.ts`,
`FEYNMAN_CHECK` to `feynman-coach.ts`, `ACTIVE_RECALL` to the spaced-repetition
flow, etc., but that wiring is intentionally out of scope for this task.

**Bounded action set** (unchanged from the originally proposed set — no
addition was needed, unlike the diagnosis layer):
`ADVANCE`, `CONTINUE`, `REMEDIATE`, `REVISIT_PREREQUISITE`,
`TRY_DIFFERENT_METHOD`, `ACTIVE_RECALL`, `FEYNMAN_CHECK`, `PRACTISE`,
`NO_ACTION`.

**Output schema** — `PedagogicalPlanSchema` in `output-schemas.ts`: `action`,
`targetLoId`, `targetSubmissionId`, `targetDeliveryTypeId` (all nullable),
`reason`, `confidence` (0-1), `supportingSignals: string[]`,
`alternativesConsidered: {action, reasonNotChosen}[]`.

**Target assembly is deterministic and happens before the LLM runs** — the
planner is never given raw database access. `src/lib/adaptive/plannerContext.ts`
exports `buildPlannerContext(state): Promise<PlannerContext>`, which prepares
four bounded candidate lists:

-   `currentSubmissionAlternatives` — other approved, accessible submissions
    of the same LO (reused directly from `state.loMastery.breakdown`) —
    candidates for `TRY_DIFFERENT_METHOD`'s `targetSubmissionId`.
-   `currentSubmissionDeliveryOptions` — all delivery types actually offered
    by the current submission's active content (not just ones the student
    has engaged with) — candidates for `TRY_DIFFERENT_METHOD`'s
    `targetDeliveryTypeId`.
-   `prerequisiteTargets` — reused directly from
    `state.prerequisites.prerequisiteDetails` — candidates for
    `REVISIT_PREREQUISITE`.
-   `postrequisiteTargets` — a new bounded query resolving
    `state.prerequisites.submissionScoped.postrequisiteLoIds` (submission-scoped,
    per the existing roadmap-edge convention) into real approved,
    non-soft-deleted submissions plus this student's mastery on them —
    candidates for `ADVANCE`.

**Bugfix discovered and fixed while building this:**
`studentLearningState.ts`'s prerequisite-submission query did not filter out
soft-deleted submissions (unlike the `loMastery` computation, which already
did). Fixed by applying the same `isSoftDeletedSubmission` filter, which is
now exported from `studentLearningState.ts` for reuse instead of being
re-duplicated a third time. `prerequisiteDetails.masteryBySubmission` now
also carries `submissionTitle` for display/target purposes. This only
affects which prerequisite submissions are considered valid targets — it
does not change mastery, tracking, or any previously-reported roadblock
evidence values.

**Deterministic short-circuit (no roadblock).** Mirrors the pre-filter
pattern already used in `struggle-detector.ts` and `diagnostic-agent.ts`:
gated on the freshly-recomputed `evidence.hasPotentialRoadblock` (never on
the client-supplied diagnosis, so this safe path cannot be spoofed). If
false: `ADVANCE` to the first postrequisite with an available approved
submission, else `NO_ACTION` — both at confidence `1`, without calling the
LLM.

**Post-LLM grounding validation (hard safeguard, not just prompting).**
After the LLM responds, every returned target id is checked against the
`PlannerContext` candidate lists assembled above. An id that isn't present
is stripped and the action is safely downgraded (e.g. `REVISIT_PREREQUISITE`
with an invalid/missing prerequisite id → `CONTINUE`; `ADVANCE` with no
valid postrequisite → `NO_ACTION` if none exist at all, else `CONTINUE`).
Every correction is recorded in `groundingNotes: string[]`, returned
alongside the plan so corrections are visible rather than silent. This
sanitization runs regardless of which structured-output path produced the
raw plan (see "Structured-output reliability on `gpt-oss-20b`" under the
Diagnostic Agent above — the planner uses the identical three-layer
`functionCalling` → plain-JSON-parse-and-validate → deterministic-fallback
approach). Only after all three layers are exhausted is the deterministic
`CONTINUE` fallback at confidence `0.3` returned, instead of a 500 or a
fabricated plan.

**API route** — `POST /api/ai/plan` (`src/app/api/ai/plan/route.ts`), same
auth pattern as `/api/ai/diagnose`. Request body: `{ submissionId, diagnosis }`,
where `diagnosis` is the object the client already received from a prior
`/api/ai/diagnose` call. Design rationale: recomputing the diagnosis inside
this route would double the LLM cost and silently trigger a second
uncontrolled LLM call when the user only asked to run the planner, so the
already-fetched diagnosis is reused instead — but it is schema-validated
server-side with `DiagnosisSchema.safeParse()` before use, and `state`/
`evidence` are always recomputed fresh server-side (never trusted from the
client), so the diagnosis can only ever influence the LLM's *reasoning*, not
the deterministic safety short-circuit or the target-validation step. This
is debug-only, read-only, self-scoped, so the residual risk of a forged
diagnosis is bounded to a worse-quality suggestion, never an unsafe target
or a database write. Response: `{ plan, groundingNotes, context }` — the
`PlannerContext` is included so the debug UI (and manual verification) can
see exactly which candidates were available.

**Debug integration** — `DiagnosticPanel.tsx` now also renders a
"Pedagogical planner" section with an explicit **"Run pedagogical planner"**
button, disabled until a diagnosis has been fetched (running a fresh
diagnosis clears any previous plan, since a plan is only valid for the
diagnosis it was generated from). The LLM is never invoked automatically.
This completes the full debug-visible pipeline: Student Learning State →
Roadblock Evidence → Diagnostic Agent → Pedagogical Planner.

**Not yet done (explicitly out of scope for this task):** the planner is
not wired into `/recommendations`, no specialist agent is invoked based on
its output, and no plan/intervention history is written to the database.

This builder does **not** yet perform struggle diagnosis, pedagogical action
selection, or feed any agent/recommendation logic. It is a data-assembly
layer only. The remaining SLS work below (roadblock detection, action
selection, outcome feedback) is still a research/prototype direction, not
implemented.

Conceptually, for student `s` and LO/submission `l`:

`SLS(s,l,t) = {mastery, assessment trajectory, engagement, teaching-method response, prerequisite readiness, revision urgency, conceptual understanding, traversal history, recency}`

The LLM should reason over a structured state rather than receive
unstructured raw database dumps.

## 18. Proposed pedagogical action space

Instead of asking an agent to "recommend something", define a bounded
action space.

Suggested actions:

### Advance

Move to an appropriate postrequisite/next LO.

### Continue

Resume an incomplete or under-mastered submission.

### Backtrack

Revisit a prerequisite that appears to be the source of a current
roadblock.

### Reinforce

Stay on the same LO but use a different teaching method.

### Remediate

Deliver targeted misconception correction.

### Retrieve

Use active recall.

### Revise

Schedule spaced repetition/revisit.

### Explain

Use Feynman explanation to test conceptual understanding.

### Practise

Provide additional exercises/questions.

### Escalate

Flag persistent difficulty for teacher/human intervention.

This bounded action space makes the agentic system easier to evaluate,
explain and constrain.

## 19. Proposed roadblock taxonomy

A major research improvement is to distinguish different kinds of
difficulty.

Examples:

### Conceptual difficulty

Possible evidence:

-   high engagement;
-   repeated visits;
-   low quiz performance;
-   low Feynman score;
-   stagnant mastery.

Potential action: prerequisite check, Feynman, remediation.

### Insufficient engagement

Possible evidence:

-   low active time;
-   high idle ratio;
-   little content completion;
-   low performance.

Potential action: shorter/different teaching method or re-engagement
rather than immediate prerequisite backtracking.

### Retrieval/retention difficulty

Possible evidence:

-   previously high mastery;
-   later quiz decline;
-   time since successful recall.

Potential action: active recall/spaced repetition.

### Prerequisite gap

Possible evidence:

-   struggle on current LO;
-   weak mastery in ancestor/prerequisite LO;
-   repeated backward traversal.

Potential action: recommend the weakest relevant prerequisite.

### Method mismatch

Possible evidence:

-   poor outcomes after one teaching method;
-   better subsequent gains after another.

Potential action: switch pedagogical method.

The final category requires outcome/effectiveness modelling and should
not currently be inferred solely from time spent.

## 20. Proposed personalised prerequisite reasoning

Current graph edges provide expert-defined structural possibilities.

A future student-specific router can:

1.  detect struggle on current LO;
2.  traverse prerequisite ancestors;
3.  inspect student mastery/performance for those prerequisites;
4.  identify the weakest relevant prerequisite;
5.  recommend a suitable submission/teaching method for that
    prerequisite;
6.  reassess the original LO after remediation.

This creates a personalised traversal without destroying the
teacher-authored graph.

## 21. Proposed teaching-method effectiveness model

Current preference logic uses active time.

A stronger research contribution would estimate:

`effectiveness(student, teachingMethod) = subsequent learning gain after exposure`

Possible outcome signals:

-   change in mastery;
-   next quiz score;
-   delayed recall score;
-   Feynman improvement;
-   reduced time/visits required to reach proficiency.

This would let Pathfinder distinguish:

"I spend time on flashcards"

from:

"I consistently learn better after flashcards."

That is a meaningful novelty opportunity.

## 22. Proposed revision priority

Instead of a fixed number of days, future revision urgency can combine:

-   time since last successful recall;
-   previous mastery;
-   quiz stability;
-   number of successful recalls;
-   Feynman/conceptual confidence;
-   engagement;
-   prior forgetting behaviour.

The agent should decide between remediation and revision: a student with
mastery 35 should not necessarily receive the same spaced-repetition
action as a student who previously mastered the LO at 92.

## 23. Outcome feedback loop

The long-term adaptive loop should be:

1.  Observe student state.
2.  Detect roadblock/opportunity.
3.  Select pedagogical action.
4.  Deliver recommendation/intervention.
5.  Record whether student accepted it.
6.  Measure subsequent outcome.
7.  Update student state.
8.  Improve future action selection.

Without steps 5--7, the system personalises using historical behaviour
but does not learn whether its own recommendations were effective.

This feedback loop is one of the strongest directions for the research
paper.

## 24. Research evaluation direction

A useful experimental comparison is:

### Baseline A: fixed curriculum

Teacher-defined path without personalisation.

### Baseline B: deterministic/mastery-only

Next action based primarily on mastery thresholds and graph rules.

### Proposed approach: multi-signal agentic planner

Uses structured learning state and multiple behavioural/performance
signals to select the next pedagogical action.

Candidate outcome metrics:

-   mastery gain;
-   subsequent quiz improvement;
-   delayed recall performance;
-   time to proficiency;
-   number of unnecessary revisits;
-   successful prerequisite recovery;
-   recommendation acceptance;
-   intervention success;
-   retention;
-   student-reported usefulness.

This provides a stronger research contribution than evaluating whether
users "liked the chatbot".

## 25. Research positioning

A concise framing for the project is:

> Pathfinder is a multi-signal adaptive learning architecture that
> combines deterministic learning analytics with specialised agentic
> reasoning to identify student roadblocks and select the next
> pedagogical action.

The novelty should be grounded in:

-   the breadth of student-state signals;
-   explicit roadblock detection;
-   graph-aware prerequisite reasoning;
-   multiple intervention types;
-   explainable deterministic baselines;
-   an outcome feedback loop;
-   evaluation of whether selected actions actually improve learning.

Do not claim novelty solely from using LangGraph or multiple agents. The
research value comes from **how student evidence is transformed into
adaptive pedagogical decisions**.


## 26. Good-to-have activity instrumentation roadmap

The current system already captures useful timing, quiz, traversal and mastery signals, but future research-quality activity modelling should move beyond raw time.

### Recommended additional signals

#### Browser visibility and focus
Pause or separately classify time when the learning page is hidden or the browser window loses focus.

#### Meaningful interaction events
Potential events include:

- flashcard flip/reveal;
- practice answer submitted;
- quiz answer selected/submitted;
- worked-example step revealed;
- explanation expanded;
- chatbot help requested;
- Feynman explanation submitted;
- revision action accepted.

These events should not all be weighted equally; they should be categorised by pedagogical meaning.

#### Completion signals
Where a delivery type supports it, capture whether the student completed the activity rather than only how long the page remained open.

#### Video engagement
For video-based visual explanations, useful signals include:

- watched seconds;
- completion percentage;
- pause/resume;
- seek/replay behaviour.

These still indicate engagement, not comprehension.

#### Outcome-linked effectiveness
The strongest future signal is the learning outcome after an intervention or teaching method.

Examples:

- mastery delta after a worked example;
- quiz improvement after flashcards;
- delayed recall after revision;
- Feynman-score improvement after remediation.

This enables a future model of:

`teaching method effectiveness = expected subsequent learning gain for this student`

rather than:

`teaching method preference = highest time spent`.

### Research principle

A future Student Learning State should distinguish:

- **exposure** — content was visible;
- **interaction** — student performed a meaningful action;
- **engagement** — sustained relevant activity;
- **performance** — quiz/Feynman/practice result;
- **learning gain** — improvement after an intervention;
- **retention** — performance after a delay.

This separation is a good-to-have research TODO and should guide new tracking work.

