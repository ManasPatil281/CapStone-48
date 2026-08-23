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

## 4. Deterministic mastery engine — CURRENT mastery (v2, implemented)

> **Redesign note (current-mastery-v2).** This engine was substantially
> redesigned from an earlier "best-ever" formula. An audit found that the
> old `computeQuizScore()` selected the single highest historical quiz
> score, which meant a student who scored 100% once could keep showing as
> Proficient/Mastered indefinitely afterward, even after later scoring 0%
> repeatedly — `mastery_score` was effectively tracking *peak* demonstrated
> performance while every downstream consumer (roadmap coloring,
> postrequisite "mastered" gating, "Continue learning"/"explore next"
> sections, the tutor agent's mastery-status tool) read it as if it meant
> *current* competence. The engine below is the fix: `mastery_score` now
> answers "how well does the student appear to understand this submission
> **now**," and is designed to rise and fall as new evidence arrives. The
> `4.x`/`5` sections below describe the CURRENT (v2) design; the old
> best-ever formula and the Feynman route's independent blend formula are
> both retired.

Source:

`src/lib/mastery/calculateMasteryScore.ts` (pure formula) +
`src/lib/mastery/recalculateMastery.ts` (the single DB-touching orchestrator
— see §4.7).

### 4.1 Recency-weighted "current" score (shared by quiz and Feynman)

Both quiz and Feynman evidence are reduced to a "current" score using the
same recency-weighting scheme, over at most the 5 most recent attempts:

-   rank 1 (most recent attempt) is **always** weight 5, regardless of how
    many total attempts exist;
-   rank 2 = weight 4, rank 3 = weight 3, rank 4 = weight 2, rank 5 = weight 1;
-   with fewer than 5 attempts, only the top-N weights are used, normalised
    by their own sum (e.g. 3 attempts → weights `[5,4,3]`, sum 12 — the
    latest attempt's relative share grows as evidence shrinks, which is
    intentional: there is genuinely less competing evidence to weigh it
    against);
-   an attempt outside the 5-attempt window has **zero** influence — this is
    what lets an old peak fade out once enough new evidence exists, and
    what prevents best-ever performance from permanently propping up the
    score.

With exactly 5 attempts present, the latest attempt contributes `5/15 ≈
33.3%` of the weighted score — deliberately **not** capped further (a
single accidental low attempt can move the score, but it competes against
up to 4 other recent, weighted data points, so it does not single-handedly
destroy it). No separate trend/improvement bonus is added on top — the
recency weighting already captures improvement/decline, and
`RoadblockEvidence` (§18) separately explains *why* a change happened using
the same raw quiz history.

### 4.2 Quiz current score

Each scored, timestamped quiz attempt is adjusted by a `randomizationMode`
multiplier before entering the recency-weighted average (unchanged from the
old engine's multiplier, just applied per-attempt instead of only to the
single "best" one):

-   mode 0: ×1.00
-   mode 1: ×1.05
-   mode 2: ×1.10

Each adjusted score is capped at 100, then combined via §4.1's
recency-weighted formula to produce `quizCurrentScore`.

### 4.3 Feynman current score (implemented — own attempt history)

Feynman evaluations are now persisted as their own historical rows in
`student_feynman_attempt` (see `DATABASE_AND_DATA_FLOW.md` §8), not only as
the latest snippet inside `metadata_json`. `feynmanCurrentScore` is computed
with the **identical** recency-weighted formula (§4.1) over up to the 5 most
recent Feynman attempts from that table.

### 4.4 Knowledge score (quiz + Feynman combination)

-   Quiz only → `knowledgeScore = quizCurrentScore`
-   Feynman only → `knowledgeScore = feynmanCurrentScore`
-   Both available → `knowledgeScore = QUIZ_KNOWLEDGE_WEIGHT * quizCurrentScore + FEYNMAN_KNOWLEDGE_WEIGHT * feynmanCurrentScore`,
    with `QUIZ_KNOWLEDGE_WEIGHT = 0.60` and `FEYNMAN_KNOWLEDGE_WEIGHT = 0.40`

**These weights are an explicit, named PILOT heuristic, not an empirically
validated weighting** — they exist so the two knowledge sources combine
predictably, and should be revisited once real classroom data can calibrate
them. Missing one source is never a penalty: a student with only quiz
evidence is scored purely on `quizCurrentScore`, with no discount for
lacking a Feynman attempt (the old engine's `0.75 ×` quiz-only discount is
removed for exactly this reason).

If there is **no** knowledge evidence at all (no quiz attempt AND no
Feynman attempt), the engine returns `null` and the caller writes **no**
`student_submission_mastery` row — "no evidence yet" must stay unknown,
never become a confident 0. See §4.7 for who calls this and when.

### 4.5 Engagement modifier (content/activity — bounded, non-positive)

Content-block time and idle behaviour are exposure/engagement evidence, not
proof of understanding, per this document's §3 caveats. The engagement
modifier can therefore only ever **subtract** points, never add them — time
spent alone can never raise mastery, and it is always applied on top of an
already-required `knowledgeScore` (§4.4), so it can never independently
produce a Proficient/Mastered score either.

Two independently-capped components, both reusing the 0.7 on-target
breakpoint from the old content-ratio curve:

-   **Under-exposure** — for content blocks with a `recommendedTimeSeconds`,
    `ratio = totalActiveSeconds / totalRecommendedSeconds`; if `ratio < 0.7`,
    penalty = `min(2, (0.7 - ratio) / 0.7 * 2)`, else 0.
-   **Idle** — `idleRatio = totalIdleSeconds / totalActiveSeconds` (0 if no
    active time); penalty = `min(3, idleRatio * 3)`.

`engagementModifier = -min(5, underExposurePenalty + idlePenalty)` — always
in `[-5, 0]`.

### 4.6 Final score

`finalScore = clamp(knowledgeScore + engagementModifier, 0, 100)`, rounded
to one decimal. `mastery_level` uses the **same, unchanged** thresholds
(§4.8) — only the meaning of the score changed, not the bands.

### 4.7 Recalculation — canonical engine, event-driven

`src/lib/mastery/recalculateMastery.ts` is the **single** DB-touching
function that reads quiz attempts + Feynman attempts + content-block time,
calls the pure formula above, and upserts `student_submission_mastery` (or
writes nothing if the result is `null`). It is the **only** code path
permitted to write that table.

Triggers:

-   **Quiz submitted** → `QuizSession.tsx` calls `POST
    /api/mastery/recalculate` (auth-checked; student id always comes from
    the session, never the request body) immediately after the
    `student_quiz_attempt` insert succeeds.
-   **Feynman evaluation completed** → `POST /api/feynman/evaluate` persists
    the attempt to `student_feynman_attempt`, then calls
    `recalculateMastery()` directly (same request, no extra round-trip). The
    route no longer computes or writes mastery itself.
-   **Submission page visit** → kept as a **fallback/idempotent consistency
    pass** (unconditional on every student visit, same trigger as before),
    but it is no longer the *primary* way quiz/Feynman evidence reaches
    mastery — it mainly exists to catch slowly-accumulated content-
    engagement drift and any missed-event edge cases.
-   **Content-engagement tracking flush** → deliberately does **not**
    trigger a recalculation (too frequent/low-signal); covered by the
    page-visit fallback instead.

### 4.8 Mastery levels (unchanged)

-   0--39: Beginner
-   40--69: Developing
-   70--84: Proficient
-   85--100: Mastered

Do not change these thresholds without explicit approval and
documentation update. (The current-mastery redesign changed what feeds this
scale, not the scale itself.)

### 4.9 Metadata / provenance

`metadata_json` on `student_submission_mastery` holds the computed
breakdown, versioned explicitly:

```
{
  engineVersion: "current-mastery-v2",
  quizCurrentScore: number | null,
  quizAttemptCountUsed: number,
  feynmanCurrentScore: number | null,
  feynmanAttemptCountUsed: number,
  knowledgeScore: number,
  engagementModifier: number,
  finalScore: number
}
```

Raw attempt history is **not** duplicated into this metadata — it already
lives in `student_quiz_attempt`/`student_feynman_attempt`. Best-ever/peak
scores are intentionally **not** persisted anywhere on the mastery row;
where a "personal best" figure is useful, derive it on read from those
attempt-history tables (`MAX(score)`) rather than storing it, since attempt
history is never deleted.

## 5. Feynman evidence (implemented)

The Feynman feature evaluates a student's own explanation of an LO via a
LangGraph Socratic-coaching flow (`src/lib/ai/agents/feynman-coach.ts`),
producing a validated 0--100 explanation score, feedback, misconceptions,
and an optional follow-up question.

Each evaluation is persisted as its own row in `student_feynman_attempt`
(`DATABASE_AND_DATA_FLOW.md` §8) — full history is retained, not just the
latest attempt. `POST /api/feynman/evaluate` no longer computes or writes
`student_submission_mastery` itself; it persists the attempt and then calls
the same canonical mastery engine (`recalculateMastery()`, §4.7) that quiz
submissions use. The route's previous independent blend formula
(`newMastery = 0.7 * existingMastery + 0.3 * feynmanScore`) is retired — it
was a second, disagreeing mastery formula writing the same row as the main
engine, which is exactly the kind of inconsistency the current-mastery
redesign eliminated (see §4's redesign note).

Feynman evidence is combined with quiz evidence as a co-equal "knowledge
evidence" source (§4.4), not blended into a running mastery number after
the fact.

Research significance:

Quiz performance measures one form of retrieval/assessment performance.
Feynman explanation adds a separate conceptual-expression signal and can
expose misconceptions that a quiz may miss.

## 6. Current deterministic recommendation sections

> **Status note:** `/recommendations` was substantially redesigned around
> the StudentLearningState → RoadblockEvidence → Diagnostic Agent →
> Pedagogical Planner pipeline. See §27 for the current architecture,
> including the deterministic candidate-ranking formula, the disposition of
> every previously-existing agent/widget on this page, and the sections
> described below. This section is kept as a record of the sections that
> remain, in their reworked, honestly-labelled form.

Source:

`src/app/recommendations/page.tsx`

### 6.1 Continue learning

Primary idea:

-   consider recently visited submissions;
-   keep submissions with missing mastery or mastery \< 70;
-   prioritise recent activity;
-   recommend continuing/revisiting.

Pedagogical action: **continue/reinforce**.

### 6.2 Recommended next topics

Primary idea:

-   identify mastered/proficient submissions (\>=70);
-   map those submissions to their LOs;
-   follow prerequisite graph edges from mastered source LOs to target
    LOs;
-   recommend approved target submissions not already mastered.

Pedagogical action: **advance**.

Fallbacks may be used when graph/mastery signals are insufficient.

### 6.3 Might be worth revisiting

Primary idea:

-   inspect prior quiz attempts;
-   select previously strong performance;
-   surface it as worth a quick recall check.

The reviewed recommendations page currently has:

`ACTIVE_RECALL_DAYS = 0`

This is a testing/demo value and must not be represented as a
research-grade spaced-repetition interval. As of the §27 redesign, page copy
for this section was explicitly reworded to avoid implying a timed/scientific
schedule (no "enough time has passed" framing) — it just says a quick recall
check helps confirm the topic is still solid.

Pedagogical action: **retrieve/revise**.

### 6.4 Practice explaining a concept

Primary idea:

-   identify under-mastered submissions;
-   offer the option to explain the LO in the student's own words;
-   evaluate conceptual understanding via the existing Feynman flow;
-   return feedback and an additional mastery signal.

This is now an opt-in browse list, separate from the roadblock-triggered
`FEYNMAN_CHECK` planner action (§27), which surfaces the same capability
contextually when the evidence actually supports it.

Pedagogical action: **explain/diagnose conceptual gaps**.

### 6.5 Removed sections (§27)

"Preferred content/teaching style" (aggregate `student_content_block_time`
by delivery type) was removed as an independent, standalone section — its
previous copy ("learning usually sticks better when the material matches how
you prefer to study") stated a causal effectiveness claim the underlying
engagement-only data does not support, which is exactly the "engagement ≠
effectiveness" overclaim this document has warned against since §3. The
underlying signal still feeds the Student Learning State and can surface
inside a `TRY_DIFFERENT_METHOD` recommendation when the planner actually
finds it relevant, but it is no longer presented as a standalone claim.

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
-   persisted mastery score/level/metadata;
-   the most recent `student_feynman_attempt` row, surfaced as a convenience
    view (`state.feynman`) — Feynman evidence now has its own history table
    (§4.3/§5) rather than living only inside mastery's `metadata_json`;
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

### Course-level prerequisites (implemented)

In addition to LO-to-LO prerequisite edges (`teacher_lo_submission_edge`), a
teacher submission may declare an entire **course** as recommended
background via `teacher_lo_submission_course_prerequisite` (submission-
scoped, additive table — see `DATABASE_AND_DATA_FLOW.md` §5). This is a
distinct dependency type from an LO prerequisite, both in the data model and
in meaning:

> "This LO assumes background knowledge from this course" — not "the
> student must complete this course first."

**Semantics (advisory, never a gate):**

-   never blocks access to the target LO/submission;
-   never requires completing or mastering any LO in the prerequisite
    course;
-   no course-level mastery score is computed, stored, or invented anywhere
    in this feature — course prerequisites are exposed as plain facts
    (`courseId`, `title`, `slug`) only.

**`StudentLearningState.prerequisites.coursePrerequisites`** — a new
sibling field next to `submissionScoped`/`prerequisiteDetails`, populated by
one additional submission-scoped query in `studentLearningState.ts` (same
`submission_id` scoping convention as the existing prerequisite/postrequisite
edge query). Facts only, per the constraint above: no mastery join, no
aggregation. `/debug/learning-state` renders it both as an explicit list and
inside the full raw-state JSON dump.

**Roadmap rendering.** `RoadmapNode` gained an optional `kind?:
"COURSE_PREREQUISITE"` field (omitted = ordinary LO node, so every existing
node-construction call site needed zero changes). A course-prerequisite node
uses a namespaced id (`course:${courseId}`) to guarantee it can never collide
with an LO id, a dashed violet border instead of the normal status-colored
border, a "🎓 Course prerequisite" badge instead of difficulty/time, and
clicking it navigates to `/courses/{courseSlug}` instead of `?lo=`
(`RoadmapTree.tsx` and `CourseRoadmap.tsx` both updated identically).

Course-prerequisite nodes/edges are added in three places, all following the
project's existing submission-scoped-vs-aggregated distinction:

-   **Module/submission roadmap**
    (`courses/[courseSlug]/submission/[submissionId]/page.tsx`'s
    `buildRoadmap()`): strictly submission-scoped — only shows a course
    prerequisite when *this exact submission* declared it, exactly mirroring
    how its LO prerequisite/postrequisite query is already scoped. Not added
    to `courses/dsa/[loSlug]/page.tsx`'s own "module roadmap" section
    (labeled "MASTER GRAPH" in code), because that section aggregates across
    *all* approved submissions of the LO rather than representing one
    specific submission — adding a submission-scoped course prerequisite
    there would misattribute one teacher's assertion as a property of the LO
    itself, which is exactly the failure mode this task was told to avoid.
-   **Course/global roadmap** (all three sites that build this: `courses/
    [courseSlug]/page.tsx`, `courses/dsa/[loSlug]/page.tsx`'s
    `courseRoadmapData` section, and `courses/[courseSlug]/submission/
    [submissionId]/page.tsx`'s `courseRoadmapData` section): aggregates
    course prerequisites the same way LO-to-LO edges are already aggregated
    there — any `status = "approved"` submission of an LO in the course may
    contribute a course-prerequisite node, deduplicated by
    `(prerequisiteCourseId, targetLoId)`. This is an aggregated
    *visualisation* of still-submission-scoped relationships, not a claim
    that a relationship is a universal curriculum fact — consistent with how
    the existing course roadmap already treats LO-to-LO edges.

**Teacher authoring** (`SubmissionForm.tsx`): a new "Course prerequisites"
checkbox list sits inside the existing "Prerequisites" card, alongside the
existing LO checkboxes (relabelled "Learning object prerequisites" for
clarity) — reusing the `courses` list already loaded for the submission's
own course dropdown, excluding the submission's own course (rejected as a
self-reference, same convention as the existing LO self-edge rejection).
On submit, existing course-prerequisite rows for the submission are deleted
and current selections freshly inserted — same delete-then-reinsert pattern
already used for `teacher_lo_submission_edge`, safe for the same reason (no
historical/tracking table references this row).

**Diagnostic/planner implications (explicitly deferred).** Neither
`RoadblockEvidence` nor the Diagnostic Agent nor the Pedagogical Planner
reads `coursePrerequisites` in this implementation — a course prerequisite
alone must never trigger `PREREQUISITE_LOW_MASTERY` or any other signal.
Documented future direction only: if a student struggles, a later layer
could inspect this student's existing per-LO mastery evidence for LOs inside
the declared prerequisite course (not a new course-level score — the same
`prerequisiteDetails`-style per-submission evidence pattern already used for
LO prerequisites) as one additional diagnostic input. This is not
implemented and requires its own explicit approval before being added.

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

**Rate-limit-aware fallback (TPM exhaustion, distinct from malformed output).**
Under sustained Groq TPM pressure, the first (`functionCalling`) attempt can
fail with a genuine rate-limit error (`HTTP 429` / groq-sdk's `RateLimitError`
/ a `rate_limit_exceeded` body) rather than a malformed-output error. Retrying
immediately with the second (plain-JSON) attempt in that case just re-submits
a same-size request into the same rate-limit window for a near-certain second
rejection — wasted latency and quota. `src/lib/ai/structuredOutputFallback.ts`
now exports `isRateLimitError()`, checked in both agents' catch blocks: a
rate-limit error on the first attempt skips the plain-JSON retry entirely and
goes straight to the deterministic fallback; the two attempts are only
sequential for genuine format/schema failures, where a second try can
reasonably succeed. Both agents also now set `maxRetries: 0` on their
`getGroqChat()` call — LangChain's own internal retry wrapper would otherwise
silently re-attempt a rate-limited request 2 more times before our code even
sees the error, which was found to be part of why a single rate-limited
`diagnoseRoadblock`/`planPedagogicalAction` call could burn up to 6 requests.

**Prompt/token reduction.** Two changes, motivated by observed TPM
rate-limiting on `gpt-oss-20b` (8000 TPM), keeping all grounding facts that
actually matter to a diagnosis category, not a blanket shrink:

-   Quiz deep-dive bounds reduced from 3 attempts/20 questions to **2
    attempts/10 questions** (`MAX_DEEP_DIVE_ATTEMPTS`, `MAX_QUESTIONS_PER_ATTEMPT`
    in `diagnostic-agent.ts`) — this was the single largest contributor to
    prompt size. Latest + best is sufficient for the retention-decline
    pattern this evidence primarily supports (for a declining student,
    "latest" already functionally is the worst attempt, so dropping the
    separate "worst" selection loses no signal for that case).
-   `formatStateSummary()`'s delivery-type-engagement breakdown was removed
    — it isn't referenced by any `diagnosisType` category and duplicated
    information the planner's `PlannerContext.currentSubmissionDeliveryOptions`
    already carries when relevant.
-   The Pedagogical Planner no longer receives the full `formatStateSummary()`
    at all — it was found to duplicate almost everything the Diagnostic
    Agent already interpreted into `diagnosis.primaryDiagnosis`/`explanation`,
    even though `RoadblockEvidence` + `Diagnosis` + the bounded
    `PlannerContext` candidate lists already contain everything the planner
    needs to decide. Replaced with `formatMinimalContext()`: just the LO/
    course name and current submission mastery (2 lines), so the planner can
    still name the topic naturally in its `reason` text. This was the
    largest single reduction of the two.
-   Diagnosis categories, planner actions, evidence thresholds, and all
    instructional/rule text in both prompts are unchanged — reductions only
    ever removed duplicated or category-irrelevant *data*, never grounding
    rules.

**Deterministic fallback copy must stay student-safe.** Both fallbacks
previously said things like "the diagnostic/planning model was unavailable"
in fields that are rendered directly to students (`primaryDiagnosis`,
`plan.reason`). Both now build their fallback text only from the actual
matched `RoadblockEvidence` signal's own `evidence` string (e.g. "Previously
scored as high as 100%, but the latest attempt dropped to 0%. Reviewing this
prerequisite is a safe next step.") — the "LLM unavailable"/technical detail
moved to `console.error` only, never a schema field a student-facing
component reads.

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
Diagnostic Agent above — the planner uses the identical rate-limit-aware,
three-layer `functionCalling` → plain-JSON-parse-and-validate →
deterministic-fallback approach). Only after all three layers are exhausted
does `deterministicGroundedFallback()` run — a conservative, evidence-only
fallback (not a full re-implementation of the LLM planner) covering:
`PREREQUISITE_LOW_MASTERY` signal + a valid prerequisite target →
`REVISIT_PREREQUISITE`; a retention/decline-pattern signal
(`QUIZ_RECENT_FAILURE_AFTER_STRONG_PERFORMANCE`, `RETENTION_RISK_ACTIVE_RECALL_DUE`,
`QUIZ_DECLINING_TREND`, `QUIZ_LATEST_BELOW_BEST`) → `ACTIVE_RECALL`;
repeated-low/no-proficiency quiz signals → `PRACTISE`; otherwise → `CONTINUE`.
Every branch's `reason` is built from the actual matched signal's own
evidence text — never a generic "model unavailable" message — instead of a
500 or a fabricated plan.

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

**Update (§27):** the planner is now wired into `/recommendations` as the
page's primary architecture — see §27 for the full integration. It still
does not itself invoke specialist agents on its own — the page's translation
layer maps `REMEDIATE` to the (now auth-fixed) remediation flow, and the
other actions to real navigation links — and no plan/intervention history is
written to the database (still a documented follow-up, not built).

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

## 27. `/recommendations` redesign: primary adaptive architecture (implemented)

`/recommendations` was substantially redesigned to make the
`StudentLearningState -> RoadblockEvidence -> Diagnosis -> Pedagogical Planner`
pipeline its primary architecture, replacing a page that combined honest
deterministic sections with several provisional/fabricated agentic widgets
added during earlier MVP work. This section documents the new architecture,
the full audit that motivated it, and the disposition of every existing
agent/widget touched.

### 27.1 Deterministic candidate ranking

Source: `src/lib/adaptive/candidateSubmissions.ts` — `gatherRankedCandidates(studentId)`.

Before any LLM call, the student's recently relevant submissions (from
mastery + visit rows, bounded to the most recent 8) each get a
`StudentLearningState` + `RoadblockEvidence` built (no LLM — this is the
existing deterministic pipeline). They are ranked by an explicit, documented
formula:

```
severityScore = 100 * (# of "high" severity signals)
              +  10 * (# of "medium" severity signals)
              +   1 * (# of "low" severity signals)
```

tie-broken by most recent activity (max of last mastery calculation and
last visit timestamp) descending. The highest-ranked candidate becomes the
page's single **focus candidate** — for a fully healthy student (all
severityScores 0) this is simply their most recently active submission.

### 27.2 Bounded automatic LLM use

Only the focus candidate is automatically run through the full pipeline —
`src/lib/recommendations/buildFocusResult.ts` (`buildFocusResultFromState` /
`buildFocusResult`) calls `diagnoseRoadblock` → `buildPlannerContext` →
`planPedagogicalAction` → `resolvePlanAction` exactly once per page load.
Because `diagnoseRoadblock` and `planPedagogicalAction` both already
short-circuit deterministically when `evidence.hasPotentialRoadblock` is
false (§ Diagnostic Agent, § Pedagogical Planner above), a healthy student
triggers **zero** LLM calls on page load — the bound is "at most 2 small-
model calls per page view," not "always 2."

Any other candidates with a detected roadblock (up to 3) are listed in a
deliberately subdued, collapsed "Other areas that might need attention"
section (`src/components/recommendations/SecondaryRoadblockList.tsx`) with
a per-item **"Look into this"** button. Clicking it calls the new
`POST /api/ai/recommend-action` route (same auth pattern as
`/api/ai/diagnose`, self-scoped, read-only), which runs the identical
pipeline for that one submission on demand. The LLM is never invoked for
these unless the student explicitly asks.

### 27.2.1 Session-level Focus card cache (no DB table)

Source: `src/lib/recommendations/focusCache.ts`, `src/app/api/recommendations/focus-cache/route.ts`,
`src/components/recommendations/FocusCacheWriter.tsx`.

Revisiting `/recommendations` within the same browser session previously
re-ran the Diagnostic Agent + Planner for the focus candidate every time,
even if nothing about the student's evidence had changed — unnecessary LLM
cost. Added a short-lived (`30` minute), `httpOnly` cookie cache, deliberately
**not** a database table:

-   `computeFocusFingerprint(candidate)` hashes exactly the evidence that
    could change the Focus card's conclusion: mastery score + its
    `last_calculated_at`, quiz attempt count/latest attempt timestamp/latest
    score, and the sorted list of `RoadblockEvidence` signal `type:severity`
    pairs. Any real change to these invalidates the cache.
-   Because `src/app/recommendations/page.tsx` is a Server Component and a
    plain RSC cannot call `cookies().set()` mid-render (only a Route Handler
    or Server Action can), the cache is read-then-write-back rather than
    read-write-in-place: the page reads the existing cookie cheaply at the
    top of rendering; on a fingerprint+submissionId match it renders
    straight from the cache (zero LLM calls); on a miss it computes fresh as
    before and mounts an inert `FocusCacheWriter` client component that
    fires a one-way `POST /api/recommendations/focus-cache` on mount to
    persist the new value for the *next* visit. The write-back route is
    auth-checked identically to the other agent routes and re-validates the
    payload shape before setting the cookie.
-   Only the fields `FocusCard` actually renders (`CachedFocusView`) are
    cached — not the full `Diagnosis`/`PedagogicalPlan` objects — which is
    also why `FocusCard`'s props were flattened to that same shape rather
    than accepting the full objects, keeping the cookie comfortably under
    the ~4KB per-cookie limit (the route defensively skips caching, without
    erroring, if a payload ever exceeds a safety margin).
-   The on-demand secondary-candidate flow (`SecondaryRoadblockList` /
    `/api/ai/recommend-action`) is intentionally NOT cached — each click is
    already an explicit student action, not a repeated automatic call.

### 27.3 Translating the plan into a real action

Source: `src/lib/recommendations/translateForStudent.ts` — `resolvePlanAction()`.

The planner's `action` + target ids (already grounding-validated — see the
Pedagogical Planner section above) are mapped to a friendly label and a
real route:

| Action | Student-facing label | Link target |
|---|---|---|
| `ADVANCE` | "Move on to the next topic" | a real postrequisite submission from `PlannerContext.postrequisiteTargets` |
| `CONTINUE` | "Keep working on this" | the current submission |
| `REVISIT_PREREQUISITE` | "Review the prerequisite first" | a real prerequisite submission from `PlannerContext.prerequisiteTargets` |
| `TRY_DIFFERENT_METHOD` | "Try a different explanation" | a real alternative submission from `PlannerContext.currentSubmissionAlternatives`, or the current submission if none exists |
| `ACTIVE_RECALL` | "Do a quick recall check" | the current submission |
| `FEYNMAN_CHECK` | "Explain it in your own words" | `/recommendations/feynman/[submissionId]` |
| `PRACTISE` | "Get some practice" | the current submission |
| `REMEDIATE` | "Get a quick concept fix" | opens the (now auth-fixed) remediation flow, §27.5 |
| `NO_ACTION` | "Keep going as planned" | no link |

When the planner named a valid target LO but didn't specify a submission
(or its specified one failed grounding validation), this layer
deterministically picks the first submission already present in the
planner's own validated candidate list for that LO — it never invents an
id, and never does its own independent database search.

The `ACTIVE_RECALL` description ("You scored well on this before — a quick
recall check helps make sure it's still solid.") is deliberately worded to
avoid implying a timed/scientific spaced-repetition schedule, since the
underlying `activeRecallEligible` signal is still the same-day
`ACTIVE_RECALL_DAYS = 0` demo threshold documented in §6.3 — not real
spaced-repetition logic.

### 27.4 Page structure

`src/app/recommendations/page.tsx` now renders, top to bottom, in the exact
same order the sections are computed (§27.8):

1.  **Focus card** (`src/components/recommendations/FocusCard.tsx`) — the
    hero. Explicitly separates deterministic evidence from LLM
    interpretation: a "What we noticed" list shows a plain-language
    translation of the top `RoadblockEvidence` signals (§27.9 — presentation
    layer only, the underlying `evidence` strings are unchanged and still
    what `/debug/learning-state` shows), with a collapsed "Details"
    disclosure underneath holding the exact, precise numbers for students
    who want them; and a visually distinct "AI's read on this" block (only
    shown when a real diagnosis ran) shows the Diagnostic Agent's
    `primaryDiagnosis` with an explicit `diagnosisType` translation. Numeric
    confidence scores are never shown to students — this is a presentation
    choice to avoid an analytics-dashboard feel, not a change to the
    underlying `Diagnosis`/`PedagogicalPlan` schemas, which are unchanged.
2.  **Other areas that may need attention** (§27.2) — subdued, on-demand.
3.  **Continue learning**, **Might be worth revisiting**, **Ready to
    explore next** (renamed from "Recommended next topics"), **Practice
    explaining a concept** — the retained deterministic sections (§6),
    reworded for honesty and now cross-section deduplicated/conflict-filtered
    (§27.8).
4.  **Starter recommendations** — unchanged fallback for a student with no
    data yet.

### 27.5 Existing-agent audit and disposition

Every existing agent/widget touched by or related to this redesign was
inspected end-to-end (component → API route → agent → data source) before
deciding its disposition. Findings and outcomes:

| Agent / widget | Finding | Disposition |
|---|---|---|
| `learning-router.ts` (`generateRecommendations`) | Was called unconditionally on every page load. Its input construction coerced missing mastery to `score: 0, level: "beginner"` and hardcoded `activeSeconds: 0, idleSeconds: 0` for every visit — a direct violation of "missing evidence must remain unknown, never 0." Also used an invented `advanced/developing/beginner` scale distinct from the real `Beginner/Developing/Proficient/Mastered` levels. Its sibling `/api/ai/recommend` route was confirmed orphaned (zero callers) with hardcoded demo data. | **Removed from the page.** Not deleted — kept as-is for any future use, but no longer called from `/recommendations`. Superseded in purpose by the new pipeline, which does the same job per-submission with real safeguards. |
| `SpacedRepetitionWidget` | 100% hardcoded static array, including two non-existent fake submission ids (`"queue-sub-002"`, `"array-sub-003"`) linked via real, would-404 `<Link>`s. Not wired to `spaced-repetition-agent.ts` at all. | **Removed from the UI.** Component file kept, unmounted from the page. |
| `GraphMutatorWidget` | Sent an identical hardcoded payload (fixed mastery score, fixed quiz scores, fixed LO title) regardless of the signed-in student. Route had zero authentication (defaulted `studentId` to `"std-1"` from the request body). Confirmed via code inspection: never writes to the database — the "mutation" is display-only text. | **Removed from the UI.** Route auth fixed (now requires an authenticated STUDENT) since the endpoint stays reachable. Agent/route kept, not deleted. |
| `PeerMatchingWidget` | Same hardcoded-payload problem; the "peer" was either an LLM invention or a literally hardcoded fallback (`"Alex Rivera (Mastery 94%)"`). No real query against other students exists anywhere in the path. Route was also unauthenticated. | **Removed from the UI.** Route auth fixed. Real peer matching (an actual cross-student query) is flagged as a follow-up, not built — it is privacy-sensitive and nontrivial. |
| `remediation-agent.ts` / `RemediationModal.tsx` / `/api/ai/remediate` | A complete, well-formed capability with **zero live callers** anywhere in the app (`RemediationModal` was never imported). Route was unauthenticated. Agent had no deterministic fallback (a bare `structuredModel.invoke()` with no try/catch). | **Wired in** as the `REMEDIATE` action's UI (`FocusCard`/`SecondaryRoadblockList` both open `RemediationModal` directly, reusing it as-is). Route auth fixed. `RemediationModal` gained a visible error state (previously a failed fetch was silently swallowed with no user feedback). The agent itself was not modified — a deterministic fallback for it is a reasonable future improvement, not done here. |
| `struggle-detector.ts` | Confirmed (grep) to have **no live caller anywhere** in the app — it only exists as the architectural precedent `roadblockEvidence.ts`'s thresholds were deliberately copied from. | Left as-is. Out of scope for this page; not a `/recommendations` concern. |
| `multi-agent-evaluator.ts` | Fully implemented (defender/strict/judge) but confirmed to have **zero callers** — the live Feynman path uses the simpler `feynman-coach.ts` instead. | Left as-is (dead code, not deleted per project convention). |
| `tutor-agent.ts` | Live and well-grounded (4 real DB-backed tools) via `/api/chat` + `SubmissionChatPanel`/`AgentModeOverlay` — a genuinely good agent, just not related to `/recommendations`. | Untouched. Not surfaced on this page; a future "ask the tutor" CTA from the Focus card is a reasonable idea, not built now. |
| Feynman flow (`FeynmanClient.tsx`, `/api/feynman/evaluate`) | Backend evaluation is correctly grounded and documented above (§4–§5; the route's mastery write now goes through the canonical current-mastery engine, not an independent blend). The client only ever did a single evaluate call and **discarded** the `misconceptions`/`followUpQuestion` fields the API already returns. | **Kept, scope-limited rework**: `FeynmanClient.tsx` now renders `misconceptions` and `followUpQuestion` when present. The multi-turn Socratic loop itself was deliberately NOT built — that would be a larger Feynman redesign, out of scope here. |

### 27.8 Precedence-based cross-section deduplication and conflict prevention

The four lower deterministic sections were originally computed independently
of each other and of the primary plan, which could produce contradictions
like "Review Pointers first" (Focus card, `REVISIT_PREREQUISITE`) followed
immediately by "Start Stack" (the old "Recommended next topics" section,
driven purely by global mastered→postrequisite edges with no awareness of
the current roadblock) — both individually true, but confusing/contradictory
advice about the same LO.

Fixed with two deterministic mechanisms, both computed in
`src/app/recommendations/page.tsx`:

**Suppressed LO ids** — `translateForStudent.ts`'s `computeSuppressedLoIds()`
runs once, alongside the plan, inside `buildFocusResultFromState()` (it
already has `PlannerContext` in scope) and is cached as part of
`CachedFocusView.suppressedLoIds` so it's available even on a cache hit:

-   the focus LO itself is always suppressed from "Ready to explore next";
-   if the plan's `action` is anything other than `ADVANCE`, all of that
    submission's postrequisite LOs are suppressed too — the student hasn't
    demonstrated readiness to move past this LO, so `REVISIT_PREREQUISITE`,
    `ACTIVE_RECALL`, `REMEDIATE`, `TRY_DIFFERENT_METHOD`, `PRACTISE`,
    `CONTINUE`, and `FEYNMAN_CHECK` all suppress progression suggestions for
    this LO's subtree;
-   if `action === "ADVANCE"`, only the specific `targetLoId` already
    offered as the Focus card's own CTA is suppressed (avoids an exact
    duplicate card) — other legitimate postrequisites can still surface,
    matching "if ADVANCE, progression recommendations are appropriate."

**Precedence-ordered dedup** — the page computes (and renders) sections in
this fixed order, threading two running `Set`s (`usedSubmissionIds`,
`usedLoIds`) seeded with the focus candidate and every secondary candidate:

1.  Primary focus
2.  Other roadblock areas (secondary list)
3.  Continue learning
4.  Might be worth revisiting
5.  Ready to explore next (also filtered by `suppressedLoIds`)
6.  Practice explaining a concept (capped at 2 cards, down from 3, to stay a
    small supplementary list rather than a third repetitive block)

Each section excludes any submission/LO id already in either `Set` before
building its cards, then adds its own picks to both `Set`s before the next
section runs. This is why, for example, "Continue learning" and "Practice
explaining a concept" — which previously used the identical `mastery < 70`
filter and could show the same submission twice — no longer can.

### 27.9 Plain-language evidence translation (presentation layer only)

`translateForStudent.ts`'s `describeSignalForStudent()` is a deterministic,
`signal.type`-keyed switch that turns each `RoadblockEvidence` signal into a
short, student-facing sentence using the same real numbers already on
`state`/`signal` (e.g. looking up the actual prerequisite title via
`signal.relatedLoId`) — never string-parsing or re-deriving evidence, and
never inventing a fact not already present. Examples: "Submission mastery is
35.7 (Beginner), below the Proficient threshold (70)." becomes "Your mastery
of this Stack lesson is still at Beginner level."; "Prerequisite mastery is
0." becomes "Pointers and references looks like a weak foundation for this
topic."

Critically, **this does not change `roadblockEvidence.ts` or its `evidence`
strings** — those remain exactly as they were, still what `/debug/learning-state`
and any other research/debug view render. `buildFocusResult.ts` now produces
both `evidenceBullets` (translated, shown by default) and `evidenceDetails`
(the original raw grounded strings, shown only in `FocusCard`'s collapsed
"Details" disclosure) from the same top signals, so the exact numbers remain
available without leading with analytics language. A signal type not
explicitly covered by the switch falls back to its raw `evidence` string
(safe default, still factual, just less polished).

### 27.6 New files

- `src/lib/adaptive/candidateSubmissions.ts` — deterministic ranking (§27.1).
- `src/lib/recommendations/translateForStudent.ts` — action/diagnosis → student copy, target resolution (§27.3), evidence translation (§27.9), suppressed-LO computation (§27.8).
- `src/lib/recommendations/buildFocusResult.ts` — shared pipeline-run-and-translate helper, used by both the page (auto focus candidate) and the on-demand route (§27.2).
- `src/app/api/ai/recommend-action/route.ts` — on-demand version of the pipeline for secondary candidates.
- `src/components/recommendations/FocusCard.tsx`, `src/components/recommendations/SecondaryRoadblockList.tsx` — presentation (§27.4).
- `src/lib/recommendations/focusCache.ts`, `src/app/api/recommendations/focus-cache/route.ts`, `src/components/recommendations/FocusCacheWriter.tsx` — session-level Focus card cache (§27.2.1).

### 27.7 Explicitly not done in this redesign

- No new intervention-history database table. A future
  `student_intervention_event`-style table recording
  `{evidence snapshot, diagnosis, plan, action shown, student response, subsequent mastery}`
  would enable the outcome-feedback-loop research direction in §23, and is
  recommended as a follow-up rather than built now.
- No real cross-student peer-matching query.
- No wiring of `spaced-repetition-agent.ts`'s richer scheduling,
  `graph-mutator-agent.ts`, or `tutor-agent.ts` into `/recommendations`.
- No deep-link-to-specific-content-block UI for `TRY_DIFFERENT_METHOD`.
- No new dedicated "active recall" / "practice" micro-content UI — both
  currently route to the existing submission page.
- No multi-turn Socratic Feynman UI (kept single-shot, per scope).
- **TODO (non-urgent, recorded per your explicit request, not implemented):**
  visible loading feedback across `/recommendations` and related actions —
  a spinner/in-app loading state for slow AI operations, disabled state on
  clicked buttons to prevent accidental repeated clicks (e.g. "Look into
  this" in `SecondaryRoadblockList.tsx` currently only shows a small
  "Analyzing…" text swap, no disabled-button guard against a second click
  mid-request), confirming all navigation already uses plain Next.js
  `<Link>`s (it does, so browser/tab loading indicators already work where
  the browser provides them — no change needed there), and cursor/progress
  feedback during slower operations generally. Deliberately not built in
  this task.
- Retroactive suppression for on-demand-analyzed secondary candidates: once
  a student clicks "Look into this" in `SecondaryRoadblockList.tsx` and it
  resolves a target, that target is not retroactively removed from the
  already-server-rendered lower sections (doing so would require either a
  full page refetch or moving those sections to be client-driven, which
  would be a larger structural change). Accepted as a known, minor,
  low-frequency gap rather than "fixed" — flagged, not addressed, in this task.

### 27.10 Pedagogical Planner provider test: Gemini (temporary, single-provider)

To reduce pressure on Groq's shared 8k TPM window (the Planner call was
frequently hitting it immediately after the Diagnostic Agent's own Groq
call), the Pedagogical Planner was temporarily switched to
`gemini-2.5-flash` via a new `@langchain/google-genai` dependency, to verify
Gemini can reliably perform the same grounded structured-planning task. The
**Diagnostic Agent is unchanged and stays on Groq `openai/gpt-oss-20b`** —
only `src/lib/ai/agents/pedagogical-planner.ts`'s model call changed.

-   `src/lib/ai/model.ts` gained `getGeminiChat()`, mirroring `getGroqChat()`'s
    shape/conventions. Reads `GEMINI_API_KEY` from `process.env` (the SDK
    itself also falls back to `GOOGLE_API_KEY`, but this project's explicit
    convention is `GEMINI_API_KEY`, validated the same way `getGroqChat()`
    validates `GROQ_API_KEY`). `maxRetries` defaults to `0` here too, for
    the same reason as the Groq calls — no silent internal retries burning
    quota before our own fallback logic runs.
-   The planner's prompt (`PEDAGOGICAL_PLANNER_PROMPT`), `PlannerContext`,
    `PedagogicalPlanSchema`, post-generation target-grounding validation
    (`sanitizePlan`), and `deterministicGroundedFallback()` are all
    completely unchanged — only the model/provider changed.
-   Unlike the Groq path, this is a **single** structured-output attempt
    (`model.withStructuredOutput(PedagogicalPlanSchema)`, no forced method —
    Gemini's native structured-output support was used directly rather than
    forcing `functionCalling`) — no dual functionCalling/plain-JSON retry
    chain, and no second Gemini attempt on failure, per this test's explicit
    scope. Any failure (rate limit or otherwise) goes straight to the
    existing deterministic, evidence-grounded fallback. Malformed Gemini
    output still cannot bypass validation — `withStructuredOutput` runs the
    same Zod `PedagogicalPlanSchema.safeParse`-equivalent validation as
    every other agent in this codebase, and throws (caught, then handled by
    the fallback) rather than returning unvalidated data.
-   `src/lib/ai/structuredOutputFallback.ts`'s `isRateLimitError()` was
    broadened to also recognize Google's `GoogleGenerativeAIFetchError`
    shape (`status: 429`, `RESOURCE_EXHAUSTED` body/message) alongside the
    existing Groq/OpenAI-style detection, since it's now a cross-provider
    utility.

**This is a single-provider test only.** The planned next step —
Groq→Gemini→deterministic-fallback routing, where Gemini is tried only
after a Groq rate-limit — is a follow-up task and was deliberately NOT
implemented here; the planner currently calls Gemini unconditionally
whenever a plan is needed (i.e. whenever `evidence.hasPotentialRoadblock`
is true), not as a fallback from Groq.

### 27.11 Correctness/UX polish pass: generic target suppression, honest empty states, student-perspective copy

Three presentation/filtering bugs found by auditing a real Stack case
(`PREREQUISITE_GAP` → `REVISIT_PREREQUISITE` → real "Pointers and
references" target) — all fixed deterministically, no architecture change.

**Root cause of "Pointers and references" reappearing under "Continue
learning".** `computeSuppressedLoIds()` (§27.8) only ever suppressed the
*postrequisites* of the focus LO for non-`ADVANCE` actions — it never
suppressed the actual resolved target of `REVISIT_PREREQUISITE` (a
*prerequisite*, not a postrequisite) or `TRY_DIFFERENT_METHOD` (an
alternative submission of the same LO). That suppression rule exists purely
to stop "Ready to explore next" from claiming progression-readiness it
hasn't earned — it was never meant to be the *only* mechanism dedup relied
on, but nothing else fed the actual resolved target into the
`usedSubmissionIds`/`usedLoIds` sets that "Continue learning"/"Might be
worth revisiting"/"Practice explaining" check. So the one submission the
Focus card is actively telling the student to go review was simply invisible
to every other section's dedup logic.

**Fix: generic target suppression, not per-action special-casing.**
`ResolvedAction` (`translateForStudent.ts`) now returns the actual
`targetSubmissionId` it resolved for the CTA href — whatever the action:
the current submission for `CONTINUE`/`ACTIVE_RECALL`/`PRACTISE`/
`FEYNMAN_CHECK`, the resolved prerequisite/postrequisite/alternative
submission for `REVISIT_PREREQUISITE`/`ADVANCE`/`TRY_DIFFERENT_METHOD`, or
`null` for `REMEDIATE`/`NO_ACTION` (no navigable target). `buildFocusResult.ts`
surfaces this as `FocusResult.focusTargetSubmissionId` alongside
`focusTargetLoId` (= `plan.targetLoId`, which `sanitizePlan` already only
ever sets for `ADVANCE`/`REVISIT_PREREQUISITE`, so it's naturally empty
when not meaningful — no extra branching needed). `page.tsx` seeds
`usedSubmissionIds`/`usedLoIds` with these two values in addition to the
focus submission and secondary candidates, before any of the four lower
sections run. This is action-agnostic by construction — no action name is
hardcoded in the suppression logic itself, so it generalizes to all nine
planner actions without per-action rules. `computeSuppressedLoIds()` and its
postrequisite-suppression rule for "Ready to explore next" are unchanged and
still serve their original, distinct purpose.

**Cache impact:** `CachedFocusView` gained `focusTargetSubmissionId`/
`focusTargetLoId`, and `primaryDiagnosis`/`planReason` now hold
already-translated ("you/your") text instead of the raw LLM prose (same
field names, different value semantics — see below). `FOCUS_CACHE_SCHEMA_VERSION`
bumped `2 → 3` so any cookie written before this change is treated as a
clean cache miss, never partially trusted.

**Honest empty states.** Each of the four lower sections previously computed
its final card list by filtering candidates through `usedSubmissionIds`/
`usedLoIds` and then, if the result was empty, always showed the same
generic "no candidates" message — conflating "genuinely nothing eligible"
with "eligible items existed but were already covered by a higher-priority
section". Each section (`page.tsx`) now separately tracks its
pre-cross-section-dedup eligible list; only when that list is non-empty but
the post-dedup list is empty does the section swap to a distinct "already
covered above" message (e.g. Practice: "Your priority topics are already
covered in the recommendations above." instead of "No low-mastery topics
right now for explanation practice." when the student demonstrably does
have low-mastery topics, just not ones this section gets to claim).

**Student-perspective copy, without touching the agents.** Neither the
Diagnostic Agent's nor the Pedagogical Planner's prompt or schema changed.
`translateForStudent.ts` gained `toStudentPerspective()`: a deterministic,
bounded regex-based rewrite of the LLM's third-person analytics phrasing
("The student has...", "the student's...") into direct second-person
address ("You have...", "your..."), including subject-verb agreement for
the swapped pronoun (has→have, is→are, etc.) and dropping one internal
jargon token (`LO` → `topic`). It recognizes a fixed set of literal patterns
and leaves anything else untouched rather than risking a mangled sentence —
this is a targeted normalizer, not a general paraphraser, and does not call
an LLM. Applied in `buildFocusResult.ts` to produce
`primaryDiagnosisForStudent` (from `diagnosis.primaryDiagnosis`) and
`planReasonForStudent` (from `plan.reason`); the raw, untranslated
`diagnosis`/`plan` objects remain on `FocusResult` unchanged for any other
consumer, and the full untranslated originals remain visible on
`/debug/learning-state` regardless.

### 27.12 Response.clone crash, Gemini truncation/503, and a pronoun gap

Three independent bugs, fixed with the smallest safe change each.

**"Response.clone: Body has already been consumed" in "Continue learning".**
Root cause, confirmed by tracing (not guessed): `candidateSubmissions.ts`'s
`gatherRankedCandidates()` and `page.tsx`'s "Continue learning" section
issued a byte-identical PostgREST GET request (same table, columns, filter
value, order, limit) against `student_submission_visit` within the same
server-render request. `createSupabaseServerClient()` injects no custom
`fetch`, so both go through Next.js App Router's globally-patched `fetch`,
which performs request memoization — identical GET requests anywhere in one
render pass are deduped, and the second caller is served a `.clone()` of
the first response. Supabase-js's body-consumption pattern doesn't survive
being served an already-consumed clone in this environment, throwing on the
second (later) identical request. Fixed by removing the duplicate query
entirely: `gatherRankedCandidates()` now returns
`{ candidates, recentVisitRows }`, and "Continue learning" reuses
`recentVisitRows` instead of re-fetching. No caching disabled, no
architecture change — just one genuinely redundant query removed.

**Gemini 503 ("high demand").** `getGeminiChat()`'s `maxRetries` option
(already a clean, standard LangChain constructor option, not a hand-rolled
loop) is now set to `1` specifically for the Pedagogical Planner's call —
a single provider-level retry to ride out one transient failure before
falling through to the unchanged `deterministicGroundedFallback()`. Not a
retry loop, not applied to any other agent.

**Gemini truncated JSON ("Unterminated string in JSON").** Three
compounding, additive changes, all local to the Pedagogical Planner:
`maxOutputTokens` raised `2500 → 4000` (still an explicit local override,
not a change to `getGeminiChat()`'s own default); `PedagogicalPlanSchema.alternativesConsidered`
tightened `max(4) → max(3)` (a stricter bound, not weakened validation —
still Zod-validated, still rejects malformed/truncated JSON exactly as
before); and `PEDAGOGICAL_PLANNER_PROMPT` now explicitly asks for at most
2-3 alternatives and reinforces the existing ~180-char brevity target for
`reasonNotChosen`. `action`/`targetLoId`/`targetSubmissionId`/`reason`/
`supportingSignals`/grounding validation are all unchanged.

**Student-facing "they" leak.** `toStudentPerspective()` (§27.11) only
recognized "The student"/"the student's" — it correctly turned "The student
is struggling..." into "You are struggling...", but a later pronoun in the
same sentence referring back to that subject ("...because they lack
mastery...") was left untouched, producing the reported "You are struggling
because they lack mastery...". Since this text is always about exactly one
student's own evidence (per both prompts' grounding rules), a bare
"they"/"their"/"them"/"themselves" here reliably co-refers to the student,
not some other plural noun — the normalizer now also replaces these
(`they → you`, `their → your`, `them → you`, `themselves → yourself`,
case-preserving), plus added "the learner"/"the learner's" alongside the
existing "the student" patterns. Still no LLM call, still a bounded literal
pattern list, not a general paraphraser.

### 27.13 Translate at render time, not at cache-write time

A follow-up "they" leak was reported after §27.12's fix. Tracing the exact
reported sentence through the then-current `toStudentPerspective()` showed
the regex was already correct — the real cause was that `CachedFocusView.primaryDiagnosis`/
`.planReason` stored the **already-translated** string at the moment the
Focus card was computed and cached (§27.2.1's 30-minute session cookie).
Improving `toStudentPerspective()` doesn't change `CachedFocusView`'s shape,
so it correctly didn't need a schema-version bump for that — but it meant
any cookie written before the improvement kept serving its stale, pre-fix
translated text until the cookie expired or the evidence fingerprint
changed. This is a recurring failure class, not a one-off: any future
wording improvement to the translator would have hit the same silent
staleness.

**Fix:** translation moved out of `buildFocusResult.ts` (which now leaves
`diagnosis`/`plan` on `FocusResult` as raw, untranslated LLM output only)
and into `page.tsx`, applied once at the single point of rendering
`<FocusCard>` — `toStudentPerspective(focusView.primaryDiagnosis)` /
`toStudentPerspective(focusView.planReason)` — for both the fresh-computation
and cache-hit paths uniformly. `CachedFocusView` now caches the raw text
instead. This means every render always reflects whatever the current
translation logic is, so this exact class of bug cannot recur on future
`toStudentPerspective()` changes. `FOCUS_CACHE_SCHEMA_VERSION` bumped
`3 → 4` (same field names, reverted meaning: translated → raw) so any
pre-existing cookie is treated as a clean cache miss, never partially
trusted.

### 27.14 Schema-native student-facing fields (retiring `toStudentPerspective()` from `/recommendations`)

Even after §27.13's render-time fix, `toStudentPerspective()` kept
surfacing new brittle edge cases against arbitrary Diagnostic/Planner
prose (e.g. `"You's difficulty…"` from a possessive pattern the regex
list hadn't anticipated). Regex-rewriting free-form LLM output is an
open-ended problem — every new phrasing the model produces is a
potential new bug, and the fix is never actually complete. Rather than
keep expanding the pattern list, the fix was moved upstream into the
agents' own structured output contracts.

**Schema.** `DiagnosisSchema` (`output-schemas.ts`) gained `studentSummary`
(`max(300)`) and `PedagogicalPlanSchema` gained `studentReason`
(`max(300)`), both required, non-nullable. Both are described in the Zod
schema as: written directly to the student, address only as "you"/"your",
never "the student"/"the learner"/"they"/"their", no internal enum or
debug language, and grounded in the same evidence as the existing internal
fields (`primaryDiagnosis`/`explanation` for the diagnosis, `reason` for
the plan) — no new claims or targets introduced. All pre-existing internal
fields are unchanged and remain research/debug-quality (precise, allowed
to name categories, numbers, signal types); `studentSummary`/`studentReason`
are additive, not replacements. `DIAGNOSTIC_PROMPT` and
`PEDAGOGICAL_PLANNER_PROMPT` (`prompts.ts`) were updated with matching
instructions and their "Output format" lines now mention the new fields.

**Fallbacks.** Every deterministic fallback branch (Diagnostic Agent's
`deterministicNoRoadblockResult()`/`deterministicFallbackResult()`; Planner's
`deterministicHealthyPlan()` (2 branches) and `deterministicGroundedFallback()`
(4 branches)) now includes a hand-authored, grounded `studentSummary`/
`studentReason` — no new LLM calls. In `sanitizePlan()`, if grounding
validation downgrades the LLM's chosen `action` (e.g. an invalid
`REVISIT_PREREQUISITE` target downgraded to `CONTINUE`), `studentReason` is
now also swapped to a small safe generic string matched to the *new*
action (`SAFE_STUDENT_REASON_ON_DOWNGRADE`), since it's shown to the student
verbatim and would otherwise visibly contradict the action actually taken.
`reason` (internal-only) is left as the LLM produced it either way, since it
is debug/provenance text, never rendered to a student.

**`/recommendations` (`page.tsx`, `FocusCard.tsx`).** No longer imports or
calls `toStudentPerspective()`. `<FocusCard>`'s `primaryDiagnosis`/`planReason`
props were renamed to `studentSummary`/`studentReason` and are rendered
directly — `diagnosis.studentSummary` under "AI's read on this",
`plan.studentReason` under "Recommended next step" (still overridden by the
deterministic `actionDetail` when one exists, unchanged from §27.3). CTA
label/href continue to come from `resolvePlanAction()`'s fully deterministic
resolution — the LLM never generates URLs or routing; this was untouched.
"What we noticed" evidence bullets (`describeSignalForStudent()`) are also
untouched — they were already deterministic and unrelated to this fix.

**Cache.** `CachedFocusView.primaryDiagnosis`/`.planReason` (raw text, per
§27.13) replaced with `.studentSummary`/`.studentReason` (also raw — these
are already second-person by construction, so caching-and-rendering-as-is is
now safe with no transform step to go stale). `FOCUS_CACHE_SCHEMA_VERSION`
bumped `4 → 5`, a one-time migration off the old field names (not another
instance of the staleness bug §27.13 fixed, since there is no longer any
transform for a stale cookie to preserve).

**`toStudentPerspective()`'s fate.** Left defined and exported in
`translateForStudent.ts` (not deleted) since nothing else in the codebase
called it outside `/recommendations`'s two removed call sites — its doc
comment now notes it is retired from that page and available if a future
caller needs bounded third-person→second-person rewriting for some other
free-text agent output.

**`/debug/learning-state`.** `DiagnosticPanel.tsx` already dumped the full
raw `Diagnosis`/`PedagogicalPlan` via `JSON.stringify(...)`, so the new
fields appear there automatically; explicit labeled lines were also added
for `studentSummary`/`studentReason` (visually distinct from the internal
fields above them) so the raw-evidence → internal-diagnosis →
student-facing-message provenance chain is visible at a glance during
debugging.

