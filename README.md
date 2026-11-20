# Pathfinder

Pathfinder is an adaptive learning platform built as a college capstone project (CapStone-48). Its premise is that students should not all receive the same learning sequence, teaching method, revision schedule or intervention.

The research focus is the **student recommendation and adaptive decision layer**: using the behavioural, performance and curriculum signals the platform collects to detect learning roadblocks and choose the best *next pedagogical action* for each student.

> The whole application lives in [`frontend-app/`](frontend-app). There is no separate backend: Next.js route handlers and server components talk to Supabase and to the LLM providers directly.

## Tech stack

- **Framework:** Next.js 14 (App Router), React 18, TypeScript
- **Data and auth:** Supabase (Postgres and Auth)
- **UI:** Tailwind CSS, Radix UI primitives, Framer Motion, ReactFlow (roadmaps), custom chart components
- **AI:** LangChain, LangGraph, Zod structured outputs
  - Groq (`openai/gpt-oss-20b`) for the Diagnostic Agent and most other agents
  - Gemini (`gemini-2.5-flash`) for the Pedagogical Planner only (a temporary single-provider test)
- **Testing:** Vitest

## Roles

| Role | Can do |
|---|---|
| Student | Browse courses and learning objects, study teacher content, take quizzes, chat with the tutor, do Feynman explanations, view profile stats and personalised recommendations |
| Teacher | Create and edit LO submissions (content blocks, quizzes, prerequisites), view submission and course analytics, use the analytics and authoring agents |
| Admin | Shares teacher access to `/teacher`; verify guards in code before assuming further permissions |

## How the adaptive pipeline works

`/recommendations` is built on an evidence-grounded pipeline:

```
StudentLearningState -> RoadblockEvidence -> Diagnostic Agent -> Pedagogical Planner -> student-facing action
   (read-only, no LLM)    (deterministic)         (LLM)               (LLM)              (real link / flow)
```

- Student state is assembled from mastery, quiz and Feynman attempt history, visits, content-block time and the prerequisite graph.
- Roadblock signals are extracted by deterministic rules with explicit thresholds. Missing evidence is never treated as a negative finding.
- The Diagnostic Agent interprets the signals and the Planner picks one action from a bounded set: `ADVANCE`, `CONTINUE`, `REMEDIATE`, `REVISIT_PREREQUISITE`, `TRY_DIFFERENT_METHOD`, `ACTIVE_RECALL`, `FEYNMAN_CHECK`, `PRACTISE`, `NO_ACTION`.
- The LLM is only called when a roadblock is detected. Every target the Planner returns is validated against a deterministic candidate list, and every agent has a deterministic fallback.
- Mastery is a recency-weighted *current* score (quiz 60% and Feynman 40%, minus a small capped engagement penalty), written only by `src/lib/mastery/recalculateMastery.ts`.

Other features include submission-scoped and course-level roadmaps, a data-derived popular path, a tool-using tutor agent, Feynman explanation coaching, and teacher-side analytics and authoring agents.

## Getting started

Requirements: Node.js 20+ and a Supabase project with the Pathfinder schema (see [`docs/DATABASE_AND_DATA_FLOW.md`](docs/DATABASE_AND_DATA_FLOW.md)).

```bash
cd frontend-app
npm install
```

Create `frontend-app/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server-only, never expose to the browser
GROQ_API_KEY=...
GEMINI_API_KEY=...              # used by the Pedagogical Planner
```

Then run:

```bash
npm run dev        # start the dev server on http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npx vitest run     # automated tests
npm run build      # production build
```

## Project layout

```
docs/                       Authoritative project documentation (see below)
frontend-app/
  src/app/                  Routes: dashboard, courses, teacher, profile, recommendations, debug, api/*
  src/components/           UI: lo/ (learning object views), recommendations/, teacher/, charts/, chat/, ui/
  src/lib/adaptive/         Student Learning State, roadblock evidence, candidate ranking, planner context
  src/lib/ai/               Agents, prompts, Zod output schemas, model helpers, agent tools
  src/lib/mastery/          Deterministic mastery formula and the single DB writer
  src/lib/recommendations/  Focus-card pipeline, plan translation, session cache
  src/lib/supabase/         Browser, server and service-role clients
  src/middleware.ts         Auth redirect for /dashboard and role check for /teacher
  tests/                    Vitest suites (mastery, roadblock, ranking, path, schemas, agents)
```

Key routes: `/dashboard`, `/courses/[courseSlug]`, `/courses/[courseSlug]/submission/[submissionId]`, `/profile`, `/recommendations`, `/recommendations/feynman/[submissionId]`, `/teacher`, `/teacher/submissions`, `/teacher/analytics`, and `/debug/learning-state` (students only, shows their own state, evidence, diagnosis and plan).

## Documentation

Read these before changing the code, in this order:

1. [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md): purpose, domain model, routes, roles, research direction
2. [`docs/ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`](docs/ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md): mastery engine, learning state, roadblock evidence, agents, `/recommendations` design
3. [`docs/DATABASE_AND_DATA_FLOW.md`](docs/DATABASE_AND_DATA_FLOW.md): tables, constraints, tracking and data flows
4. [`docs/CODING_AGENT_RULES.md`](docs/CODING_AGENT_RULES.md): safety rules for changes (schema, mastery, tracking, auth, historical data)
5. [`frontend-app/AGENT_INTEGRATION_GUIDE.md`](frontend-app/AGENT_INTEGRATION_GUIDE.md): earlier agent integration reference (may predate the current pipeline; prefer the docs above when they differ)

Other files in the repo: `TESTING_EVALUATION_REPORT.md` (test and evaluation results for the project report), `Agentic_RS_Literature_Review.docx` (literature review) and `research.js` (a script that generates a report document).

## Known limitations

- Row-level security is currently disabled on all Supabase tables, so access control relies on application-layer checks. Some API routes lack authentication (see the testing report).
- The Groq free tier rate-limits the recommendation pipeline after a handful of requests per minute; the app falls back to deterministic output.
- The active-recall interval is a demo value (`ACTIVE_RECALL_DAYS = 0`), not a research-grade spaced-repetition schedule.
- There is no intervention-history table yet, so the outcome feedback loop (did the recommendation help?) is not implemented.
