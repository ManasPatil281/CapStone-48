> Documentation status
>
> This document describes the current Pathfinder codebase reviewed from
> `CapStone-48-agentic-ai-integration`. Do not treat planned or proposed
> functionality as implemented unless it is explicitly labelled as
> implemented. When code and documentation disagree, inspect the code
> and notify the user rather than silently choosing one interpretation.

# Pathfinder project context

## 1. Purpose

Pathfinder is an adaptive learning platform designed around the idea
that students should not all receive the same learning sequence,
teaching method, revision schedule, or intervention.

The current system combines:

-   teacher-authored learning objects and submissions;
-   multiple pedagogical delivery types;
-   student interaction and performance tracking;
-   deterministic mastery and roadmap logic;
-   personalised recommendation rules;
-   LLM- and agent-based tutoring, evaluation, remediation, routing, and
    analytics.

The current research focus is the **student recommendation and adaptive
decision layer**: using as much meaningful student learning data as
possible to detect roadblocks and select an appropriate next pedagogical
action.

The intended research direction is not simply "recommend more content".
The stronger framing is:

> Given a continuously updated representation of a student's learning
> state, what should the system ask the student to do next to improve
> learning?

Possible next actions include advancing, revisiting a prerequisite,
changing teaching method, attempting active recall, receiving
remediation, explaining a concept using the Feynman technique,
practising, or revising previously learned material.

For exact persistence details, constraints and table relationships,
refer to `DATABASE_AND_DATA_FLOW.md` once completed.

For recommendation, mastery, struggle detection and agent details, refer
to `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`.

Before modifying this repository, follow `CODING_AGENT_RULES.md`.

## 2. Technology stack

The reviewed `frontend-app` currently uses:

-   Next.js 14 App Router
-   React 18
-   TypeScript
-   Supabase Auth and PostgreSQL
-   Tailwind CSS
-   React Flow for roadmap visualisation
-   LangChain
-   LangGraph
-   Groq through `@langchain/groq`
-   Gemini through `@langchain/google-genai` — currently used only as a
    temporary single-provider test for the Pedagogical Planner
    (`gemini-2.5-flash`); the Diagnostic Agent and every other agent remain
    on Groq. See `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md` §27.10.
-   Zod structured outputs
-   SWR and Zustand where required

The current LLM configuration used by the agentic layer includes
Groq-hosted models. Individual agent files and the shared model helper
must be inspected before changing model configuration.

## 3. Main user roles

### Student

Students can:

-   access the student dashboard;
-   browse courses and learning objects;
-   choose teacher submissions for an LO;
-   consume pedagogical content blocks;
-   interact with quizzes and the tutor;
-   generate visit, content engagement and assessment data;
-   view personal statistics and mastery;
-   view personalised recommendations;
-   perform Feynman explanation exercises;
-   interact with newer agentic recommendation widgets.

### Teacher

Teachers can:

-   create and edit LO submissions;
-   select pedagogical delivery types;
-   define prerequisite and postrequisite relationships for a
    submission;
-   create assessments;
-   view their submissions;
-   view student/course analytics;
-   use teacher-facing agentic analytics and authoring capabilities
    where wired into the UI.

### Admin

Admin behaviour should be verified from the relevant route/auth guard
before changing access logic. Do not assume teacher and admin
permissions are interchangeable.

## 4. Core domain model

### Course

A course is the top-level learning container.

### Learning object (LO)

An LO represents a concept/topic within a course, for example Stack,
Queue or Linked List.

### Teacher LO submission

Teachers can create their own submission for an LO. Multiple teachers
may therefore provide different ways of teaching the same LO.

A submission can contain pedagogical content blocks, quizzes, notes and
prerequisite/postrequisite relationships.

### Delivery type / teaching method

Pathfinder is intended to model **ways of teaching and learning**, not
merely file/media types.

Examples in the project include concept-oriented or interactive delivery
approaches such as visual explanations, flashcards, revision-oriented
material, worked/practice content, quizzes and chatbot interaction.

A video or image may be the media used by a teaching method, but media
format and pedagogical method should not be treated as the same concept.

### Submission-specific roadmap

Prerequisite/postrequisite edges attached to a teacher submission
describe that teacher's intended local/module learning path.

These relationships must remain submission-scoped.

### Course roadmap

The course roadmap aggregates approved LO relationships across
submissions to form the broader/global course graph.

### Student mastery

Mastery is maintained per student/submission and currently uses a 0--100
score with:

-   0--39: Beginner
-   40--69: Developing
-   70--84: Proficient
-   85--100: Mastered

See `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md` for the exact current
deterministic formula and additional Feynman signal.

## 5. Important application routes

Current reviewed pages include:

-   `/`
-   `/sign-in`
-   `/sign-up`
-   `/dashboard`
-   `/profile`
-   `/recommendations`
-   `/recommendations/feynman/[submissionId]`
-   `/courses/[courseSlug]`
-   `/courses/[courseSlug]/submission/[submissionId]`
-   `/courses/dsa/[loSlug]`
-   `/teacher`
-   `/teacher/submissions`
-   `/teacher/submissions/new`
-   `/teacher/submissions/[submissionId]/edit`
-   `/teacher/analytics`
-   `/teacher/analytics/[submissionId]`
-   `/debug/learning-state` (STUDENT-only, read-only; renders the generated
    Student Learning State for the logged-in student's own submissions —
    see `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md` §17)

Important API routes include:

-   `/api/chat`
-   `/api/feynman/evaluate`
-   `/api/tracking/finalize-session`
-   `/api/ai/recommend`
-   `/api/ai/remediate`
-   `/api/ai/graph-mutate`
-   `/api/ai/peer-match`
-   `/api/ai/viva`
-   `/api/ai/code-pair`
-   `/api/teacher/analytics-agent`
-   `/api/teacher/authoring-agent`

Do not assume an API route is fully wired to live UI/data merely because
it exists. Inspect its caller and request construction.

## 6. Current major student-facing capabilities

### Learning consumption

Students consume teacher-authored submissions containing different
pedagogical blocks.

Visual explanation currently supports image URLs, YouTube embedding and
direct video playback.

### Tracking

The system tracks student activity at multiple levels, including:

-   submission visits;
-   active and idle time;
-   content-block time;
-   quiz attempts and score trajectories;
-   navigation/traversal behaviour;
-   calculated mastery.

The current idle threshold constant is 15 seconds. Exact lifecycle
behaviour should be verified in the tracking/rendering components before
modification.

### Student statistics/profile

The profile and submission statistics views expose student engagement,
quiz and mastery information.

### Recommendations

`/recommendations` is now built around the evidence-grounded adaptive
pipeline as its primary architecture:

`StudentLearningState -> RoadblockEvidence -> Diagnostic Agent -> Pedagogical Planner -> student-facing action`

On each page load, the student's recently active submissions are ranked
**deterministically** (no LLM) by RoadblockEvidence severity — see
`src/lib/adaptive/candidateSubmissions.ts`. Only the single
highest-priority candidate is automatically run through the Diagnostic
Agent + Pedagogical Planner (bounded LLM cost per page view; the healthy/
no-roadblock case never calls the LLM at all, via the pipeline's existing
deterministic short-circuits). Any other flagged submissions are shown in a
subdued, on-demand "Other areas that might need attention" list — the LLM
only runs for them if the student explicitly clicks to analyze one.

The page also keeps four lighter, honestly-labelled deterministic sections
(not driven by the new pipeline, but not claiming more than they are):
Continue learning, Recommended next topics, Might be worth revisiting, and
Practice explaining a concept.

Removed from the page (implementations kept, not deleted — see
`ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md` for the full disposition table):
`SpacedRepetitionWidget`, `GraphMutatorWidget`, `PeerMatchingWidget`, and the
unconditional `learning-router.ts` call that previously ran on every page
load. All three widgets were found to send fabricated/hardcoded payloads
rather than the signed-in student's real data, and `learning-router.ts`'s
integration was found to silently substitute 0 for missing mastery/engagement
evidence — both are documented in detail in the architecture doc rather than
repeated here.

The recommendations page is the primary area for current
research-focused development.

### Feynman explanation

Low-mastery submissions can be recommended for explanation practice.

A dedicated route allows the student to explain an LO in their own
words. The agentic Feynman implementation evaluates the explanation and
can contribute a conservative additional signal to mastery.

### Roadmaps

Pathfinder maintains both:

-   teacher/course graph structure; and
-   a data-driven "most frequent path" derived from actual student visit
    transitions.

The popular path is not hardcoded.

## 7. Current teacher-facing capabilities

Teacher functionality includes:

-   submission creation/editing;
-   pedagogical content configuration;
-   quizzes;
-   submission-scoped prerequisites/postrequisites;
-   teacher analytics overview;
-   submission-level analytics;
-   agentic analytics;
-   course authoring agent endpoint/capability.

Teacher submission editing must preserve historical student tracking
references. Do not reintroduce destructive delete/recreate behaviour for
tracked entities.

## 8. Agentic AI inventory

The reviewed source contains the following agent modules:

-   `tutor-agent.ts`
-   `feynman-coach.ts`
-   `multi-agent-evaluator.ts`
-   `remediation-agent.ts`
-   `learning-router.ts`
-   `struggle-detector.ts`
-   `spaced-repetition-agent.ts`
-   `graph-mutator-agent.ts`
-   `peer-matching-agent.ts`
-   `course-analytics-agent.ts`
-   `course-authoring-agent.ts`
-   `mock-interviewer-agent.ts`
-   `code-pair-programmer-agent.ts`

Not all of these should automatically be described as equally mature,
equally autonomous, or equally grounded in live student data. See
`ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`.

## 9. Research focus and novelty direction

The immediate research focus is **data-grounded student adaptation**.

Pathfinder already captures several signals that can be combined into a
richer student learning state:

-   mastery;
-   quiz performance and trajectory;
-   active/idle engagement;
-   repeat visits;
-   content-block engagement;
-   teaching-method engagement;
-   roadmap traversal;
-   prerequisite/postrequisite structure;
-   Feynman conceptual explanation performance;
-   revision history.

The research opportunity is to use these signals jointly rather than
independently.

A useful target architecture is:

`Observe student → estimate learning state → detect roadblock → choose pedagogical action → intervene → observe outcome → update state`

The novel contribution should therefore focus on **next pedagogical
action selection**, not simply LLM-generated recommendations.

Candidate actions include:

-   advance to a postrequisite;
-   continue current LO;
-   backtrack to a weak prerequisite;
-   switch teaching method;
-   provide misconception remediation;
-   trigger active recall;
-   schedule spaced repetition;
-   request a Feynman explanation;
-   provide targeted practice;
-   escalate persistent struggle.

A particularly important future research direction is to distinguish
**engagement preference** from **learning effectiveness**. Spending more
time with a teaching method does not prove that the method improves
learning. A stronger future model would estimate which method produces
the greatest subsequent mastery/performance gain for a particular
student.

## 10. Current implementation versus research direction

### Implemented foundations

The reviewed code contains real implementations for:

-   behavioural/performance tracking;
-   deterministic mastery;
-   student recommendations;
-   prerequisite graphs;
-   data-driven popular path;
-   Feynman evaluation;
-   tool-using tutor agent;
-   struggle detection logic;
-   remediation generation;
-   learning-router recommendation logic;
-   spaced repetition agent;
-   several specialist agent modules.

### Research/prototype direction

The following should be treated as an evolving research direction unless
explicitly verified as fully wired and evaluated:

-   unified Student Learning State;
-   one central pedagogical planner selecting among all intervention
    types;
-   causal/effectiveness-based teaching-method personalisation;
-   personalised prerequisite inference beyond teacher graph traversal;
-   outcome-based learning from prior recommendations;
-   rigorous adaptive revision interval optimisation;
-   research-grade comparison against fixed-path and mastery-only
    baselines.

## 11. Project management principle

Pathfinder is now sufficiently interconnected that isolated edits can
affect tracking, mastery, analytics, recommendations and historical
data.

All future coding agents must begin with this document, follow
`CODING_AGENT_RULES.md`, and consult the other context documents
relevant to the task.


## 12. Good-to-have student activity improvements

The current platform already separates submission-level time, content-block active/idle time, quiz behaviour and mastery. However, **time spent is an engagement proxy, not proof of attention or understanding**.

Good-to-have improvements for the research/prototype roadmap:

- pause/discount exposure when the browser tab is hidden or window is not focused;
- record meaningful learning events such as flashcard flips, practice answers, quiz answers, explanation expansion, chatbot help-seeking and Feynman submissions;
- track content completion where the delivery type supports it;
- track video watch duration, completion percentage, pauses, seeks and replays for visual explanations;
- distinguish repeated revisits that indicate revision from repeated revisits that may indicate struggle;
- use subsequent learning outcomes to estimate whether a teaching method was effective for a student, rather than assuming that more time spent means preference/effectiveness;
- keep raw time as one weak signal within a broader Student Learning State.

These items are **good-to-have / research TODOs**, not current implemented guarantees unless later code explicitly implements them.

