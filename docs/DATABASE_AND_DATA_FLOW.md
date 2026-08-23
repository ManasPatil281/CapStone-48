> Documentation status
>
> This document describes the current Pathfinder database schema supplied from Supabase and the data flows observed in the current codebase/context.
> Do not treat planned or proposed functionality as implemented unless it is explicitly labelled as implemented.
> When code and documentation disagree, inspect the code and live database and notify the user rather than silently choosing one interpretation.
>
> Important: the supplied schema explicitly states that it is "for context only and is not meant to be run". It should therefore be used as a structural reference, not as an executable migration.

# Pathfinder database and data flow

## 1. Purpose

This document is the primary persistence/data-flow reference for coding agents working on Pathfinder.

Before any schema-sensitive task:

1. Read this document.
2. Inspect the actual query/update code involved.
3. If a constraint, index, default, row-level security policy, trigger, or live production value is not represented here, ask the user for a precise Supabase SQL inspection query rather than assuming.

For overall project architecture, refer to `PROJECT_CONTEXT.md`.

For mastery, recommendations and agentic logic, refer to `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`.

For implementation safety rules, refer to `CODING_AGENT_RULES.md`.

## 2. Database platform

Pathfinder uses Supabase/PostgreSQL.

Authentication users live in `auth.users`.

Application-facing identity/role data lives in `public.user_profile`.

### Critical auth identity rule

`user_profile.id` is both:

- the primary key of `public.user_profile`; and
- a foreign key to `auth.users(id)`.

Therefore:

> `user_profile.id` is the authenticated user's UUID.

Do not invent or use a `user_profile.user_id` column.

Current role values are constrained to:

- `ADMIN`
- `TEACHER`
- `STUDENT`

Do not compare role values using unverified casing. Reuse existing role-normalisation helpers in application code.


## 2.1 Live database verification snapshot

The following details were independently verified from live Supabase inspection queries:

### Confirmed unique indexes

- `course(slug)`
- `course_learning_object(course_id, learning_object_id)`
- `delivery_type(code)`
- `learning_object(slug)`
- `student_content_block_time(student_id, submission_id, content_id)`
- `student_submission_mastery(student_id, submission_id)`
- `teacher_lo_submission_edge(submission_id, source_lo_id, target_lo_id)`

These uniqueness rules are important application contracts.

### Confirmed foreign-key deletion behaviour

Most historical student tracking FKs use `NO ACTION`, including:

- `student_content_block_time → teacher_lo_submission_content`
- `student_quiz_attempt → teacher_lo_submission_assessment`
- `student_submission_visit → teacher_lo_submission`
- `student_submission_mastery → teacher_lo_submission`

This is why tracked content/assessments/submissions cannot be casually hard-deleted.

Important curriculum deletion behaviour includes:

- `course_learning_object → course/learning_object`: `ON DELETE CASCADE`
- `teacher_lo_submission → course`: `ON DELETE SET NULL`
- `teacher_lo_submission → learning_object`: `ON DELETE CASCADE`
- `teacher_lo_submission → teacher/user_profile`: `ON DELETE CASCADE`
- assessment/content/edge/question/option child relationships use `ON DELETE CASCADE` as listed in the live FK inspection.
- `teacher_lo_submission_course_prerequisite → teacher_lo_submission/course`: `ON DELETE CASCADE` (both directions), added for course-level prerequisites — see §5.

### Row-level security

Live inspection currently reports `rowsecurity = false` for all reviewed public application tables.

No public RLS policies were returned by `pg_policies`.

This is a significant security TODO before production deployment. Application-layer guards are currently especially important.

### Triggers and public functions

The supplied inspection returned no public triggers and no public functions/RPCs.

Do not assume this remains true after future migrations; re-run inspection after significant database changes.

### Current prototype data volume

Approximate live application rows at the time of inspection included:

- `student_submission_visit`: ~153
- `student_submission_mastery`: ~25
- `student_content_block_time`: ~23
- `student_quiz_attempt`: ~11
- `teacher_lo_submission`: ~7
- `teacher_lo_submission_assessment`: ~7
- `teacher_lo_submission_content`: ~10
- `teacher_lo_submission_edge`: ~8

These are prototype counts only and must not be used as application logic.


## 3. Core curriculum tables

### 3.1 `course`

Purpose: top-level course entity.

Columns:

- `id uuid` PK
- `title varchar` NOT NULL
- `slug varchar` NOT NULL UNIQUE
- `description text` nullable
- `status varchar` default `draft`
- `created_at timestamptz`
- `updated_at timestamptz`

Allowed status values:

- `draft`
- `published`
- `archived`

### 3.2 `learning_object`

Purpose: master topic/concept independent of a particular teacher submission.

Columns:

- `id uuid` PK
- `title varchar` NOT NULL
- `slug varchar` NOT NULL UNIQUE
- `description text`
- `difficulty_level integer` constrained to 1–5
- `estimated_time_minutes integer`
- `status varchar` default `draft`
- `created_at`
- `updated_at`

Allowed status values:

- `draft`
- `published`
- `archived`

### 3.3 `course_learning_object`

Purpose: maps an LO into a course.

Columns:

- `id uuid` PK
- `course_id uuid` FK → `course.id`
- `learning_object_id uuid` FK → `learning_object.id`
- `sequence_order integer` default 1
- `is_core boolean` default true
- `created_at`

Semantics:

- The LO is the master concept.
- This table states that the concept belongs to a course.
- Teacher submissions are separate entities and may be multiple-per-LO.

Do not delete course-to-LO mappings merely because one teacher submission is deleted/archived unless explicitly requested.

## 4. Teacher submission tables

### 4.1 `teacher_lo_submission`

Purpose: actual teacher-created learning submission for a master LO.

Columns:

- `id uuid` PK
- `teacher_id uuid` FK → `user_profile.id`
- `course_id uuid` FK → `course.id`, nullable
- `learning_object_id uuid` FK → `learning_object.id`
- `title varchar` NOT NULL
- `notes text`
- `status varchar` default `submitted`
- `created_at`
- `updated_at`

Allowed statuses:

- `draft`
- `submitted`
- `approved`
- `rejected`

Current prototype convention:

New teacher submissions have been treated as immediately approved because the admin approval workflow is not the current focus.

Soft-deleted/archived prototype records may also be represented through a non-approved status and marker note in application code. Inspect the relevant query/filter before changing this convention.

### 4.2 `teacher_lo_submission_content`

Purpose: stores pedagogical content blocks belonging to a submission.

Columns:

- `id uuid` PK
- `submission_id uuid` FK → `teacher_lo_submission.id`
- `delivery_type_id uuid` FK → `delivery_type.id`
- `title varchar` NOT NULL
- `content_json jsonb` NOT NULL
- `sequence_order integer` default 1
- `is_active boolean` default true
- `created_at`
- `recommended_time_seconds integer` nullable

Important historical-data rule:

`student_content_block_time.content_id` references this table.

Therefore existing tracked content rows must not be casually deleted and recreated during edit operations.

Current safe editing pattern:

- preserve existing content row IDs;
- update existing rows in place;
- insert genuinely new blocks;
- set removed tracked blocks to `is_active = false` rather than hard deleting where historical tracking must survive.

### 4.3 `delivery_type`

Purpose: defines the pedagogical/teaching method of a content block.

Columns:

- `id uuid` PK
- `code varchar` NOT NULL UNIQUE
- `name varchar` NOT NULL

Important modelling principle:

> Delivery type represents the teaching method, while `content_json` stores the payload.

Do not unnecessarily reduce this model to media types such as "image" or "video".

For example, `VISUAL_EXPLANATION` can support an image, embedded YouTube video, direct video file, and associated explanatory text while remaining one pedagogical delivery type.

## 5. Submission roadmap edges

### `teacher_lo_submission_edge`

Columns:

- `id uuid` PK
- `submission_id uuid` FK → `teacher_lo_submission.id`
- `source_lo_id uuid` FK → `learning_object.id`
- `target_lo_id uuid` FK → `learning_object.id`
- `created_at`

### Critical semantic distinction

#### Module/submission roadmap

Edges displayed for one teacher submission must be filtered by that submission's `submission_id`.

Example:

Teacher A's Stack submission may define:

`Stack → Queue`

Teacher B's Queue submission should show Stack as a prerequisite only if Teacher B explicitly defined that relationship in Teacher B's submission.

Do not infer Teacher B's module roadmap from another teacher's submission edge.

#### Course roadmap

The course roadmap aggregates approved submission edges into the global course graph.

Therefore multiple submissions may conceptually assert the same `source_lo_id → target_lo_id` relationship.

### Confirmed edge uniqueness

Live index inspection confirms the unique index:

`teacher_lo_submission_edge(submission_id, source_lo_id, target_lo_id)`

This is the required submission-scoped rule.

Do not replace it with global uniqueness on `(source_lo_id, target_lo_id)` because that would break submission-specific module-roadmap ownership.

### `teacher_lo_submission_course_prerequisite` (implemented)

Purpose: an entire COURSE recommended as background for a submission's LO — distinct from, and additive to, `teacher_lo_submission_edge`'s LO-to-LO prerequisite edges. Advisory only: **never** a completion gate, never requires mastering the prerequisite course, never blocks access to the target LO.

Columns:

- `id uuid` PK
- `submission_id uuid` FK → `teacher_lo_submission.id`, `ON DELETE CASCADE`
- `prerequisite_course_id uuid` FK → `course.id`, `ON DELETE CASCADE`
- `created_at timestamptz` default `now()`

Unique constraint: `(submission_id, prerequisite_course_id)`.

Semantics:

- **Submission-scoped**, exactly like `teacher_lo_submission_edge` — a course prerequisite is declared per teacher submission, not per LO globally. Multiple submissions of the same LO may declare different (or no) course prerequisites.
- No `target_lo_id` column: unlike the bidirectional `teacher_lo_submission_edge`, a course is only ever a prerequisite here, never a postrequisite, so the target LO is always implicitly the declaring submission's own `learning_object_id`.
- No historical/tracking table references this row (advisory metadata only), so `ON DELETE CASCADE` in both directions is safe — the same reasoning that already applies to `teacher_lo_submission_edge`.
- Self-reference (a submission's own course as its own prerequisite) is rejected at the application layer, not via a DB constraint — same convention as the existing self-edge rejection for LO prerequisites.
- No course-level mastery is computed or stored anywhere for this relationship. `StudentLearningState.prerequisites.coursePrerequisites` exposes only the factual `{courseId, title, slug}` — see `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`.

## 6. Assessment / quiz tables

### 6.1 `teacher_lo_submission_assessment`

Purpose: quiz/assessment configuration for a submission.

Columns:

- `id uuid` PK
- `submission_id uuid` FK → `teacher_lo_submission.id`
- `title varchar`
- `pass_percentage numeric` default 80
- `max_attempts integer` default 3
- `created_at`
- `randomization_mode integer` NOT NULL default 0
- `sample_percentage integer` nullable

Randomization modes are constrained to:

- `0`
- `1`
- `2`

Current semantics:

- 0: fixed-order behaviour
- 1: shuffle all questions
- 2: sample a percentage of available questions and shuffle

`sample_percentage` is constrained to 1–99 when present.

The model intentionally prevents mode 2 from behaving like "shuffle all"; if all questions should be shown in random order, mode 1 should be used.

### 6.2 `teacher_lo_submission_question`

Columns:

- `id uuid` PK
- `assessment_id uuid` FK → assessment
- `question_type varchar`
- `question_text text`
- `metadata_json jsonb`
- `marks integer` default 1

### 6.3 `teacher_lo_submission_question_option`

Columns:

- `id uuid` PK
- `question_id uuid` FK → question
- `option_text text`
- `is_correct boolean` default false

### Historical quiz integrity

`student_quiz_attempt.assessment_id` references `teacher_lo_submission_assessment.id`.

Therefore assessment IDs with student attempts must not be deleted/recreated during edits.

Current safe principle:

- update existing assessment in place;
- preserve its ID;
- reconcile questions/options carefully;
- never delete student quiz-attempt history merely to make teacher CRUD easier.

The supplied schema does not show a unique constraint enforcing one assessment per submission. Application code currently expects a single quiz assessment per submission and should prevent duplicate assessment creation. Before adding a DB uniqueness rule, inspect live data and ask for approval.

## 7. Student behavioural tracking

### 7.1 `student_submission_visit`

Purpose: one tracked visit/session to a teacher submission.

Columns:

- `id uuid` PK
- `student_id uuid` FK → `user_profile.id`
- `course_id uuid` FK → `course.id`
- `submission_id uuid` FK → `teacher_lo_submission.id`
- `learning_object_id uuid` FK → `learning_object.id`
- `teacher_id uuid` FK → `user_profile.id`
- `started_at timestamptz`
- `ended_at timestamptz` nullable
- `active_seconds integer`
- `idle_seconds integer`
- `created_at`

This is broad submission-page session tracking.

It is not the same as content-block engagement.

A student's submission session can include time spent in areas such as content, chat, statistics and roadmaps, depending on current page-level timer semantics.

Do not use total submission-page time as the sole measure of learning.

### 7.2 `student_content_block_time`

Purpose: cumulative learning engagement at a specific teacher content block.

Columns:

- `id uuid` PK
- `student_id uuid` FK → `user_profile.id`
- `submission_id uuid` FK → `teacher_lo_submission.id`
- `content_id uuid` FK → `teacher_lo_submission_content.id`
- `delivery_type_id uuid` FK → `delivery_type.id`
- `active_seconds integer`
- `idle_seconds integer`
- `first_viewed_at`
- `last_viewed_at`

This table is used for:

- per-block engagement;
- content-vs-recommended-time mastery signal;
- delivery/teaching-method engagement preference;
- analytics.

The application has previously treated these rows as cumulative per student/submission/content combination.

Live index inspection confirms the unique key:

`student_content_block_time(student_id, submission_id, content_id)`

This supports cumulative per-student/per-submission/per-content upsert semantics.

### Tracking semantics

The current tracking implementation keeps high-frequency timer increments in memory and batches DB writes at lifecycle/flush events rather than writing every second.

The inactivity threshold used in current code is 15 seconds.

The student must explicitly resume from the inactivity prompt rather than passive mouse movement automatically resuming meaningful learning.

Tracking lifecycle and persistence code must be inspected before changes.

## 8. Quiz attempt tracking

### `student_quiz_attempt`

Purpose: persistent history of quiz attempts.

Columns:

- `id uuid` PK
- `student_id uuid` FK → `user_profile.id`
- `submission_id uuid` FK → `teacher_lo_submission.id`
- `assessment_id uuid` FK → `teacher_lo_submission_assessment.id`
- `score_percentage numeric`
- `correct_count integer`
- `total_questions integer`
- `randomization_mode integer`
- `sample_percentage integer`
- `shown_question_ids jsonb`
- `selected_answers jsonb`
- `submitted_at`
- `created_at`

Each attempt is a separate row.

Teacher analytics may group all attempts belonging to one student/submission into one student analytics row, deriving latest score, best score and attempt count.

Do not confuse "one analytics row per student" with "one DB quiz row per student".

### Confirmed shape of `selected_answers` / `shown_question_ids`

These two `jsonb` columns were previously undocumented beyond "jsonb". Verified
directly against the write path in `src/components/lo/QuizSession.tsx`
(the only code that currently writes them; as of this writing no other code
reads them back except the diagnostic agent added for roadblock diagnosis):

-   `shown_question_ids`: a plain JSON array of question ids —
    `string[]`, i.e. `teacher_lo_submission_question.id` values that were
    shown in that attempt (relevant when randomization/sampling modes are
    active, since not all questions are always shown).
-   `selected_answers`: a plain JSON object mapping question id to the
    selected option id — `Record<questionId, optionId>`, i.e.
    `{ [questionId: string]: teacher_lo_submission_question_option.id }`.
    Not an array. A question absent from this object means the student did
    not select an answer for it.

Correctness for a given answer is derived by joining the selected option id
against `teacher_lo_submission_question_option.is_correct` — there is no
separate "was this attempt/question correct" column to rely on.

Any code reconstructing question-level quiz evidence from these columns must
treat both as untrusted JSON shapes (validate they are actually an array /
plain object before use) rather than assuming the shape holds.

### `student_feynman_attempt` (implemented)

Purpose: persistent history of Feynman-explanation evaluations — one row per
attempt, mirroring `student_quiz_attempt`'s shape/conventions. Added so
Feynman evidence survives as real history instead of only the latest
attempt's summary surviving inside `student_submission_mastery.metadata_json`.

Columns:

- `id uuid` PK
- `student_id uuid` FK → `user_profile.id` (`NO ACTION`, same historical-tracking convention as `student_quiz_attempt`)
- `submission_id uuid` FK → `teacher_lo_submission.id` (`NO ACTION`)
- `explanation text` — the student's submitted explanation
- `score numeric`
- `feedback text` nullable
- `misconceptions jsonb` nullable — array of strings
- `follow_up_question text` nullable
- `submitted_at timestamptz` default `now()`

No uniqueness constraint (a student may submit multiple Feynman attempts
over time, same as quiz attempts). Non-unique index on
`(student_id, submission_id, submitted_at desc)` supports the canonical
mastery engine's recency-weighted read pattern.

Written only by `POST /api/feynman/evaluate`, immediately followed by a call
into the canonical mastery engine (`src/lib/mastery/recalculateMastery.ts`)
— this route no longer computes or writes `student_submission_mastery`
itself. See `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md` §4–§5.

## 9. Student mastery

### `student_submission_mastery`

Purpose: persistent **CURRENT** mastery state per student/submission — "how
well does the student appear to understand this submission now," not the
best they have ever demonstrated. The score can rise and fall as new
evidence arrives. See `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md` §4–§5 for the
full engine design and the audit that motivated this redefinition (the
previous engine selected the single best-ever historical quiz attempt,
which could keep a student showing as "Proficient" indefinitely after a
single old high score, even after later scoring 0% repeatedly).

Columns:

- `id uuid` PK
- `student_id uuid` FK → `user_profile.id`
- `submission_id uuid` FK → `teacher_lo_submission.id`
- `mastery_score numeric`
- `mastery_level text`
- `last_calculated_at`
- `metadata_json jsonb`

Current mastery scale (unchanged by the current-mastery redesign — only what
feeds the score changed, not the level bands):

- 0–39: Beginner
- 40–69: Developing
- 70–84: Proficient
- 85–100: Mastered

Exact deterministic formula is documented in `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`.

**No row is written when there is no knowledge evidence yet** (no quiz
attempt and no Feynman attempt) — "no evidence yet" must read as unknown,
never as a confident 0. A missing row is the correct representation of that
state; downstream readers already treat a missing row as unknown.

`metadata_json` holds the computed breakdown from the single canonical
engine (`engineVersion`, `quizCurrentScore`, `quizAttemptCountUsed`,
`feynmanCurrentScore`, `feynmanAttemptCountUsed`, `knowledgeScore`,
`engagementModifier`, `finalScore`) — it does not duplicate raw attempt
history, which already lives in `student_quiz_attempt`/`student_feynman_attempt`.

### Single canonical writer

`src/lib/mastery/recalculateMastery.ts` is the **only** code path that
writes this table. Previously two independent formulas wrote to it (the
main engine and a separate Feynman-route blend `existingMastery*0.7 +
feynmanScore*0.3`) — that second writer has been removed; the Feynman route
now persists its evidence to `student_feynman_attempt` and calls the same
canonical engine. Do not add a second writer without updating this section.

### Confirmed mastery uniqueness

Live index inspection confirms:

`student_submission_mastery(student_id, submission_id)`

Therefore there should be one persistent mastery row per student/submission pair.

## 10. Legacy/path event table

### `student_lo_path_event`

Columns:

- `id uuid` PK
- `student_id`
- `course_id`
- `from_lo_id`
- `to_lo_id`
- `created_at`

This table structurally represents explicit LO-to-LO path transitions.

However, the current popular-path implementation reviewed in the codebase derives the most frequent path from ordered `student_submission_visit` records rather than relying on this table.

Do not assume this table is the source of current popular-path analytics without checking the implementation.

## 11. Current data flows

## 11.1 Teacher submission creation

High-level flow:

1. authenticated teacher selects course;
2. selects existing LO or creates a new LO;
3. ensures LO/course mapping where required;
4. creates `teacher_lo_submission`;
5. creates content rows;
6. creates/reuses assessment and questions/options if quiz exists;
7. creates submission-scoped prerequisite/postrequisite edges;
8. creates submission-scoped course prerequisites (`teacher_lo_submission_course_prerequisite`, advisory-only, see §5);
9. submission becomes available to student flow according to current approval convention.

Because creation spans multiple dependent operations, duplicate-submit protection is important.

## 11.2 Teacher submission edit

High-level safe flow:

1. verify authenticated teacher owns the submission;
2. preload submission data;
3. preserve IDs for tracked content and assessment entities;
4. update existing content in place;
5. insert new content;
6. inactivate removed content where tracking history must survive;
7. update/reconcile quiz assessment/questions;
8. replace/reconcile this submission's edges;
9. replace/reconcile this submission's course prerequisites (same delete-then-reinsert pattern as edges — safe because this row has no historical/tracking dependents);
10. preserve historical student tracking.

Do not revert to "delete all dependents then reinsert" for tracked entities.

## 11.3 Student submission page

High-level flow:

1. resolve exact submission;
2. verify it belongs to course;
3. load LO/submission/teacher information;
4. load active content blocks in sequence;
5. load assessment/questions/options where present;
6. render content, roadmaps, chat and statistics;
7. start student-only tracking;
8. write visit/content timing in batched lifecycle events;
9. persist quiz attempts;
10. compute/update mastery through the current mastery path.

## 11.4 Mastery data flow

Current core inputs:

- content blocks and `recommended_time_seconds`;
- student per-block active/idle times;
- quiz attempts and randomization modes.

Outputs:

- `mastery_score`;
- `mastery_level`;
- component metadata;
- `last_calculated_at`.

The Feynman feature can provide an additional validated conceptual-understanding signal.

Refer to `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`.

## 11.5 Deterministic recommendations data flow

The student recommendations page reads existing student evidence and curriculum metadata.

Examples:

- recent visits + mastery → Continue learning;
- mastered source LO + graph edge → Recommended next LO;
- delivery-type active time → Preferred teaching method recommendation;
- quiz history/recency → Active recall;
- low mastery → Feynman explanation opportunity.

The recommendations page should not mutate tracking merely by being viewed.

## 11.6 Popular course path

Current source:

`student_submission_visit`

High-level process:

1. group visits by student;
2. sort by timestamp;
3. map visits to LOs;
4. collapse consecutive duplicate LO visits;
5. count observed LO-to-LO transitions;
6. constrain transitions to valid global course edges;
7. greedily follow the strongest observed transitions from a suitable root.

This produces a population-level observed path.

It is not a personalised path and does not currently use mastery weighting.

## 11.7 Agentic data flow

Agent endpoints/tools may read data such as:

- prerequisite relationships;
- quiz weaknesses;
- content blocks;
- mastery;
- recommendation signals;
- teacher analytics.

Before changing any agent, identify whether its request is:

- fully populated from live DB data;
- partially populated with live data and defaults;
- prototype/demo input.

Do not claim data grounding that the caller does not actually provide.

See `ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md`.

## 12. Relationship map

Simplified conceptual relationship:

```text
auth.users
    |
    v
user_profile
    |
    +------------------------------+
    |                              |
 teacher                        student
    |                              |
    v                              v
teacher_lo_submission        student_submission_visit
    |                              |
    +--> content ------------------+--> student_content_block_time
    |
    +--> assessment ---------------> student_quiz_attempt
    |        |
    |        +--> questions
    |               |
    |               +--> options
    |
    +--> submission edges
    |
    +-------------------------------> student_submission_mastery

course
  |
  +--> course_learning_object --> learning_object
                                  ^
                                  |
                         submission edges
```

## 13. High-risk foreign-key relationships

Treat these as guardrails:

### Content history

`student_content_block_time.content_id`
→ `teacher_lo_submission_content.id`

Consequence: tracked content should retain its ID.

### Quiz history

`student_quiz_attempt.assessment_id`
→ `teacher_lo_submission_assessment.id`

Consequence: attempted assessments should retain their ID.

### Visit history

`student_submission_visit.submission_id`
→ `teacher_lo_submission.id`

Consequence: hard-deleting a submission with visit history may fail or destroy analytics intent. Use the established safe/soft-delete approach unless explicitly redesigning deletion.

### Mastery

`student_submission_mastery.submission_id`
→ `teacher_lo_submission.id`

Consequence: submission deletion must account for mastery history.

## 14. Nullability and defaults that matter

Do not casually add NOT NULL columns to existing populated tables.

Current nullable fields intentionally include several optional signals such as:

- course/submission metadata;
- recommended time;
- sample percentage;
- ended session timestamp;
- quiz score;
- mastery metadata.

When extending the schema, prefer nullable/additive fields unless migration/backfill has been explicitly planned.

## 15. What this schema does not prove

The supplied schema does not fully describe:

- indexes;
- all UNIQUE constraints actually present live;
- row-level security policies;
- triggers/functions;
- grants;
- storage buckets;
- realtime configuration;
- whether generated TypeScript DB types are perfectly current.

Therefore any task involving those concerns must request live verification.

## 16. SQL inspection patterns for coding agents

When a column/table is uncertain:

```sql
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'YOUR_TABLE'
order by ordinal_position;
```

When constraints are uncertain:

```sql
select
  constraint_name,
  constraint_type
from information_schema.table_constraints
where table_schema = 'public'
  and table_name = 'YOUR_TABLE'
order by constraint_type, constraint_name;
```

When FK relationships are uncertain:

```sql
select
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name = 'YOUR_TABLE';
```

Always ask the user to paste the result rather than guessing.

## 17. Documentation maintenance

If a task changes:

- tables/columns;
- constraints/FKs;
- CRUD semantics;
- tracking semantics;
- mastery persistence;
- roadmap edge ownership;
- recommendation inputs;
- agent DB/tool access;

then this document must be reviewed and updated before the task is considered complete.


## 18. Supabase SQL editor result-limit note

The Supabase SQL editor/output view returned only the first 100 rows for the broad column and constraint inspection queries.

This means the uploaded outputs for those two queries are **truncated**, not complete.

The database documentation above combines:

- the supplied full schema text;
- complete FK inspection;
- complete index inspection;
- complete RLS status;
- check constraints;
- live code context;
- the first 100 rows of the broad column/constraint dumps.

For a fully auditable export, re-run broad queries in chunks rather than relying on the first 100 rows.

Recommended approach:

### Columns by table range

```sql
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name >= 'student_submission_visit'
order by table_name, ordinal_position;
```

Alternatively query one table at a time:

```sql
select
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'teacher_lo_submission_edge'
order by ordinal_position;
```

### Constraints one table at a time

```sql
select
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  kcu.ordinal_position
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.table_schema = 'public'
  and tc.table_name = 'teacher_lo_submission_edge'
order by tc.constraint_type, tc.constraint_name, kcu.ordinal_position;
```

For future context updates, targeted per-table queries are preferred over one very large result because they avoid UI truncation and make verification easier.
