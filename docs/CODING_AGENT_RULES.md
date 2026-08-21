> Documentation status
>
> This document describes the current Pathfinder codebase reviewed from
> `CapStone-48-agentic-ai-integration`. Do not treat planned or proposed
> functionality as implemented unless it is explicitly labelled as
> implemented. When code and documentation disagree, inspect the code
> and notify the user rather than silently choosing one interpretation.

# Pathfinder coding agent rules

## 1. Purpose

These rules apply to every coding task in this repository unless the
user explicitly overrides them.

The priority order is:

1.  preserve data integrity;
2.  preserve working behaviour;
3.  understand before modifying;
4.  make the smallest safe change;
5.  keep project documentation synchronised with implementation.

Pathfinder contains tightly connected tracking, mastery, roadmap,
recommendation and agentic systems. A change that appears local can
affect historical data or adaptive behaviour elsewhere.

## 2. Mandatory context before coding

Before making a meaningful change:

1.  Read `PROJECT_CONTEXT.md`.
2.  Read the relevant sections of
    `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`.
3.  For any persistence/query/schema-sensitive task, read
    `DATABASE_AND_DATA_FLOW.md`.
4.  Inspect the actual source files involved.
5.  Trace important callers and consumers of any shared
    function/component being changed.

Documentation is context, not a substitute for inspecting code.

If code and documentation disagree, do not silently pick one. Report the
discrepancy and use the actual code/database evidence to determine the
safe next step.

## 3. Never make structural assumptions

Do not assume:

-   database table names;
-   column names;
-   enum/casing values;
-   foreign keys;
-   uniqueness constraints;
-   nullability;
-   route shapes;
-   auth behaviour;
-   role casing;
-   component props;
-   API payloads;
-   tracking lifecycle;
-   whether an entity is safe to delete;
-   whether an apparently unused function is truly unused.

Verify using source code, generated types and/or the database
documentation.

If exact live database structure is required and cannot be confirmed,
ask the user to run a precise SQL inspection query before changing code.

Do not invent a migration to solve an uncertain schema problem.

## 4. Ask before large or ambiguous changes

Stop and ask the user before:

-   changing database schema;
-   adding/removing constraints;
-   changing mastery formula or thresholds;
-   changing recommendation policy;
-   changing auth/role rules;
-   changing tracking semantics;
-   changing what counts as active/idle;
-   deleting historical student data;
-   replacing deterministic logic with LLM logic;
-   introducing a new framework/dependency;
-   broad architectural refactoring;
-   changing agent responsibilities;
-   changing public API contracts used by multiple features.

If there are multiple reasonable implementations with materially
different behaviour, explain the options briefly and ask before
choosing.

Small implementation details that follow an already-approved design do
not require repeated confirmation.

## 5. Scope discipline

For each task:

-   modify only what is necessary;
-   avoid opportunistic refactors;
-   do not "clean up" unrelated code;
-   do not rename shared structures without need;
-   do not fix unrelated type/lint errors unless requested;
-   do not alter UI/UX outside requested scope;
-   do not alter tracking/mastery/auth as a side effect of another
    feature.

If a pre-existing error is encountered, report it separately.

## 6. Database and historical-data safety

Pathfinder stores historical learning behaviour.

Treat student tracking data as persistent evidence, not disposable
implementation detail.

Never casually hard-delete or recreate a row whose ID may be referenced
by:

-   content-block tracking;
-   quiz attempts;
-   submission visits;
-   mastery;
-   analytics;
-   agent inputs;
-   other historical records.

Prefer:

-   in-place update for existing tracked entities;
-   soft-delete/inactivation where supported;
-   insert only for genuinely new entities.

Before destructive changes, inspect FK relationships in
`DATABASE_AND_DATA_FLOW.md` and the live schema if necessary.

Do not silently swallow PostgreSQL/Supabase errors such as FK or unique
violations. Surface useful diagnostics and fix the underlying data
model/logic.

## 7. Submission roadmap semantics must be preserved

Do not conflate the two roadmap concepts.

### Module/submission roadmap

Represents prerequisite/postrequisite relationships entered for that
specific teacher submission.

Queries must remain submission-scoped.

### Course/global roadmap

Aggregates approved relationships across relevant submissions to
represent the course graph.

A pair such as Stack → Queue may legitimately be stored by multiple
submissions if the database uniqueness rule is submission-scoped.

Refer to `DATABASE_AND_DATA_FLOW.md` before modifying edge persistence.

## 8. Tracking rules

Do not modify tracking semantics without explicit approval.

Current tracking includes submission visits and content-block
engagement.

The current idle threshold constant is 15 seconds.

Statistics/dashboard/recommendation browsing must not accidentally
become learning-content engagement unless explicitly designed that way.

When changing tracking:

-   trace session start;
-   idle transition;
-   active transition;
-   content-block switching;
-   page unload/finalisation;
-   persistence endpoint;
-   analytics consumers.


### Activity-quality interpretation

Do not treat mouse movement, scrolling, or raw time-on-page as proof of meaningful learning.

When introducing new activity signals:

- separate exposure from meaningful interaction;
- do not automatically equate a DOM event with attention;
- prefer explicit pedagogical events such as answering, flipping, completing, explaining, seeking help or revising;
- preserve browser visibility/focus information if implemented;
- document whether a signal measures exposure, engagement, performance, or learning outcome;
- avoid increasing mastery solely because a student kept a page open.

Time-based signals should remain one feature among several, not the sole determinant of mastery or recommendation quality.


## 9. Mastery safety

The deterministic mastery engine is an important shared contract.

Do not change `calculateMasteryScore.ts`, its weights, thresholds or
interpretation unless the user explicitly approves a mastery-model
change.

Current levels:

-   0--39: Beginner
-   40--69: Developing
-   70--84: Proficient
-   85--100: Mastered

Agent-generated scores must be validated before influencing mastery.

An LLM must never be allowed to write an arbitrary unvalidated mastery
value.

Feynman or other future signals should be clearly documented as
additional signals and their blend/update behaviour must be explicit.

See `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`.

## 10. Recommendation and research rules

The current research priority is student adaptation using collected
learning data.

When adding recommendations:

-   state exactly which student signals are used;
-   distinguish observed data from LLM inference;
-   give the student a human-readable reason;
-   avoid recommending inaccessible/unapproved submissions;
-   avoid presenting engagement time as proof of learning effectiveness;
-   preserve deterministic fallbacks where appropriate;
-   make recommendation thresholds/constants explicit;
-   avoid hidden behavioural changes.

Where possible, structure new recommendation logic around a pedagogical
action such as:

-   advance;
-   continue;
-   backtrack;
-   reinforce;
-   remediate;
-   retrieve/recall;
-   revise;
-   explain;
-   practise;
-   escalate.

For research-oriented features, make it possible to later measure
whether the recommendation improved the student's outcome.

## 11. Agentic AI rules

An "agent" must not be treated as magical autonomy.

For every agentic feature, identify:

-   trigger;
-   input signals;
-   tools/data available;
-   deterministic pre/post-processing;
-   LLM decision;
-   structured output schema;
-   fallback behaviour;
-   side effects;
-   UI consumer.

Prefer structured outputs validated with Zod or equivalent.

Do not allow an LLM to directly perform destructive DB operations
without deterministic validation and explicit architecture approval.

Do not claim an agent is data-grounded if its route uses demo/default
inputs.

Do not claim multi-agent behaviour merely because several
prompts/functions exist; verify the execution path.

## 12. API and auth rules

Reuse existing auth helpers and patterns.

Do not compare raw role strings when a normalisation helper exists.

Server/API routes that mutate student data must verify the authenticated
user and appropriate role.

Never trust client-supplied `student_id` when the authenticated user
identity can be used instead.

Do not expose secrets, service keys, prompts containing sensitive
information, or internal stack traces to the client.

## 13. Error handling

For asynchronous DB/LLM operations:

-   use appropriate try/catch/finally;
-   return safe user-facing errors;
-   log enough context server-side to diagnose failures;
-   do not hide data-integrity errors behind generic messages during
    development;
-   allow partial page rendering where independent
    analytics/recommendation sections can fail independently.

LLM failures should have deterministic or safe fallback behaviour where
the feature requires demo/runtime resilience.

## 14. Dependencies

Do not add a dependency when existing project libraries can solve the
problem adequately.

Before adding one:

-   explain why it is required;
-   check compatibility with Next.js/React/TypeScript versions;
-   ask for approval if it materially changes the stack.

## 15. Validation after changes

At minimum:

1.  run diagnostics on changed files;
2.  run the project typecheck;
3.  distinguish newly introduced errors from pre-existing errors;
4.  manually describe the critical user flow that must be smoke-tested.

Where DB behaviour changed, provide verification SQL.

Where agentic/recommendation behaviour changed, provide a concrete test
scenario and expected result.

## 16. Required implementation report

After a meaningful task, report:

-   files inspected;
-   files changed;
-   root cause or design rationale;
-   exact behaviour changed;
-   assumptions made;
-   database implications;
-   tracking/mastery/recommendation implications;
-   validation performed;
-   manual tests still required;
-   documentation files updated.

Do not report "everything works" unless it was actually validated.

## 17. Documentation maintenance rule

**Documentation is part of the implementation.**

Any important change to architecture, database behaviour, routes,
tracking, mastery, recommendations, agentic workflows, authentication,
domain semantics or major user flows must be reflected in the relevant
files under `/docs`.

At the end of every meaningful task, review:

-   `PROJECT_CONTEXT.md`
-   `DATABASE_AND_DATA_FLOW.md`
-   `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`
-   `CODING_AGENT_RULES.md`

and update whichever documents are affected.

A task that materially changes documented system behaviour is not
considered complete until the relevant documentation has been reviewed
and updated where necessary.
