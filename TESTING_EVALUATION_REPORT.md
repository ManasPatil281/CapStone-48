# Pathfinder - Testing and Evaluation Results

Prepared for: Capstone Project-II Blackbook, Chapter 6 (Testing) and Chapter 7 (Results and Discussion)
Repository commit tested: `ae5cdde` (branch `main`)
Test date: 31 October 2026
Environment: Windows 11, Node.js v22.16.0, Next.js 14.2.3 dev server (localhost:3000), Vitest 2.1.9, TypeScript (`tsc --noEmit`)

> **How to use this file.** Everything below was actually executed on the date above, and the numbers come from real runs (raw output is reproducible with the commands in section 7). Nothing is estimated. Please copy only what is relevant into the blackbook.
>
> **No application code was changed** to produce these results. Only test files, a Vitest config and the `vitest` dev-dependency were added.

---

## 1. Summary

| Item | Result |
|---|---|
| Automated tests (Vitest) | **81 run, 81 passed, 0 failed** (6 files, about 3 s total) |
| Mutation sanity check | 4 of 5 deliberately injected bugs were caught immediately; the 5th exposed a gap that was then closed by an extra test (section 3.2) |
| TypeScript type check | **0 errors** (`tsc --noEmit`) |
| ESLint (`next lint`) | **1 error, 3 warnings** (section 6) |
| Live API probe, no login (16 routes + 4 pages) | 10 routes enforce authentication; **6 routes do not** (section 5) |
| Recommendation endpoint, 30 sequential requests | 30/30 HTTP 200 (0% error), p50 **89 ms**, p95 **6369 ms**; LLM answer used in only 1/30 because of the Groq rate limit (section 4) |

**One-paragraph takeaway for the report:** the deterministic core (mastery, roadblock detection, candidate ranking, prerequisite ordering, schema validation) behaves exactly as documented across 81 automated checks, and the AI layer degrades safely to deterministic fallbacks when the model fails, times out, returns invalid output or is rate-limited. Testing also surfaced real weaknesses: six API routes have no authentication check, the free-tier LLM quota is exhausted after about five recommendation requests per minute. These are reported as findings, not hidden.

---

## 2. Test approach and scope

| Level | What it covers | How |
|---|---|---|
| Unit | Mastery formula, roadblock rules, learning-path ordering, Zod output schemas, JSON-repair and rate-limit helpers | Vitest, pure functions, no network |
| Integration (mocked dependencies) | Candidate ranking (fake Supabase), Diagnostic Agent, Pedagogical Planner, Learning Router (fake LLM that can succeed, throw, time out, return garbage or return hallucinated ids) | Vitest `vi.mock` |
| API / security | Every route under `/api` called **without a session**, plus protected pages | Node script against the running dev server |
| Performance / reliability | 30 sequential calls to `/api/ai/recommend` | Node script, latency measured client-side |
| Static analysis | Types and lint | `tsc`, `next lint` |

Why the LLM is mocked in the unit and integration tests: model output is non-deterministic and rate-limited, so correctness of *our* validation, grounding and fallback logic has to be tested with controlled model behaviour. The live LLM was exercised separately in the benchmark (section 4).

---

## 3. Automated test results

### 3.1 Results by suite

| Suite (file) | Area | Requirement | Tests | Passed |
|---|---|---|---|---|
| `agents.test.ts` | AI agents with mocked LLM (integration) | FR-09, FR-13, FR-14 | 16 | 16 |
| `mastery.test.ts` | Mastery engine (unit) | FR-06 | 20 | 20 |
| `path.test.ts` | Learning path / prerequisite ordering (unit) | FR-04 | 6 | 6 |
| `ranking.test.ts` | Deterministic candidate ranking (integration, DB mocked) | FR-07, FR-10 | 7 | 7 |
| `roadblock.test.ts` | Roadblock evidence extraction (unit) | FR-10 | 17 | 17 |
| `schemas.test.ts` | LLM output schema validation and fallback helpers (unit) | FR-13 | 15 | 15 |
| **Total** | | | **81** | **81** |

### 3.2 Test quality check (mutation sanity test)

To make sure the tests are not vacuous, five bugs were injected into the source one at a time (and reverted with `git checkout` afterwards):

| # | Injected bug | Tests that failed | Verdict |
|---|---|---|---|
| M1 | Recency weights 5,4,3,2,1 changed to 1,1,1,1,1 | MS-04, MS-05, MS-07 | Caught |
| M2 | Quiz weight 0.6 changed to 0.5 | MS-09 | Caught |
| M3 | Engagement cap 5 changed to 9 | none | **Survived.** Cause: the two sub-penalties (2 + 3) already cap the total at 5, so the outer cap is redundant. Test MS-15b was added to pin the worst case at exactly -5. |
| M4 | Proficient threshold in roadblock rules 70 changed to 75 | RB-04 | Caught |
| M5 | "Mastered" boundary 85 changed to 90 | MS-13 | Caught |

### 3.3 Full test-case table (ready for section 6.3 of the blackbook)

Status is the real result of the run on 31 Oct 2026.

| Test ID | Suite | Description | Status |
|---|---|---|---|
| MS-01 | Mastery engine | returns null (unknown) when there is no knowledge evidence | PASS |
| MS-02 | Mastery engine | ignores attempts with null/NaN scores or missing timestamps | PASS |
| MS-03 | Mastery engine | single quiz attempt: score equals that attempt | PASS |
| MS-04 | Mastery engine | five attempts use weights 5:4:3:2:1 (newest = 5) | PASS |
| MS-05 | Mastery engine | three attempts use weights 5:4:3 normalised by 12 | PASS |
| MS-06 | Mastery engine | only the 5 most recent attempts count (old peak fades out) | PASS |
| MS-07 | Mastery engine | recent attempts weigh more than old ones (order matters) | PASS |
| MS-08 | Mastery engine | input order does not matter (sorted by timestamp internally) | PASS |
| MS-09 | Mastery engine | quiz + Feynman blend is 60:40 | PASS |
| MS-10 | Mastery engine | Feynman-only evidence is used as-is (no missing-signal penalty) | PASS |
| MS-11 | Mastery engine | randomisation multipliers 1.05 / 1.10 applied and capped at 100 | PASS |
| MS-12 | Mastery engine | final score is clamped to 0-100 | PASS |
| MS-13 | Mastery engine | level boundaries: 39/40, 69/70, 84/85 | PASS |
| MS-14 | Mastery engine | engagement modifier is never positive, even for huge active time | PASS |
| MS-15 | Mastery engine | engagement deduction is bounded at -5 | PASS |
| MS-15b | Mastery engine | worst-case engagement deduction is exactly -5 (2 under-exposure + 3 idle) | PASS |
| MS-16 | Mastery engine | time-on-page alone cannot create a mastery score | PASS |
| MS-17 | Mastery engine | under-exposure penalty max is 2; idle penalty max is 3 | PASS |
| MS-18 | Mastery engine | metadata reports engine version and components | PASS |
| MS-19 | Mastery engine | deterministic: identical input gives identical output (100 runs) | PASS |
| RB-01 | Roadblock evidence extraction | empty / no-evidence state yields no signals and no roadblock | PASS |
| RB-02 | Roadblock evidence extraction | healthy learner (mastery 90, quiz 90) yields no signals | PASS |
| RB-03 | Roadblock evidence extraction | low submission mastery <40 is HIGH severity, 40-69 is MEDIUM | PASS |
| RB-04 | Roadblock evidence extraction | mastery exactly at 70 (Proficient) emits no low-mastery signal | PASS |
| RB-05 | Roadblock evidence extraction | absence of a mastery score is never treated as a negative finding | PASS |
| RB-06 | Roadblock evidence extraction | latest quiz <40% emits QUIZ_LATEST_LOW_SCORE (high) | PASS |
| RB-07 | Roadblock evidence extraction | strong then sudden failure triggers RECENT_FAILURE_AFTER_STRONG_PERFORMANCE | PASS |
| RB-08 | Roadblock evidence extraction | 3+ attempts never reaching 70 emits NO_PROFICIENCY | PASS |
| RB-09 | Roadblock evidence extraction | high idle ratio (>1.5x) emits ENGAGEMENT_HIGH_IDLE_RATIO; 1.5x exactly does not | PASS |
| RB-10 | Roadblock evidence extraction | repeated visits (>=4) with mastery <40 emits REPEATED_VISITS_LOW_MASTERY | PASS |
| RB-11 | Roadblock evidence extraction | lots of time alone is only a LOW-severity exposure signal, never high | PASS |
| RB-12 | Roadblock evidence extraction | weak prerequisite emits PREREQUISITE_LOW_MASTERY carrying relatedLoId | PASS |
| RB-13 | Roadblock evidence extraction | prerequisite with no mastery rows is 'unavailable' and emits no signal | PASS |
| RB-14 | Roadblock evidence extraction | weak current + strong prerequisite flags a submission-specific difficulty | PASS |
| RB-15 | Roadblock evidence extraction | low Feynman (<70) and Feynman/quiz mismatch (>=20 gap) are detected | PASS |
| RB-16 | Roadblock evidence extraction | active-recall eligibility yields a LOW retention signal only with quiz evidence | PASS |
| RB-17 | Roadblock evidence extraction | extraction is a pure function: same state -> same signals; input not mutated | PASS |
| RK-01 | Deterministic candidate ranking | higher-severity candidate ranks first even if less recently active | PASS |
| RK-02 | Deterministic candidate ranking | severity weights: high=100 dominates any number of mediums | PASS |
| RK-03 | Deterministic candidate ranking | equal severity: most recent activity wins the tie-break | PASS |
| RK-04 | Deterministic candidate ranking | recent visit timestamp counts as activity for the tie-break | PASS |
| RK-05 | Deterministic candidate ranking | at most 8 candidates are considered (bounded cost) | PASS |
| RK-06 | Deterministic candidate ranking | unresolvable submissions are dropped; student with no activity gets an empty list | PASS |
| RK-07 | Deterministic candidate ranking | ranking is deterministic across 50 repeated runs | PASS |
| PA-01 | Learning path / prerequisite ordering | already-mastered prerequisites are excluded | PASS |
| PA-02 | Learning path / prerequisite ordering | ordered by depth, then difficulty; target always last | PASS |
| PA-03 | Learning path / prerequisite ordering | no prerequisites: path is just the target | PASS |
| PA-04 | Learning path / prerequisite ordering | all prerequisites mastered: path is just the target | PASS |
| PA-05 | Learning path / prerequisite ordering | same inputs (twice) produce the same path (deterministic) | PASS |
| LG-01 | Learning path / prerequisite ordering | weights 0.6/0.2/0.2 and status thresholds | PASS |
| SC-01 | LLM output schema validation and fallback helpers | Feynman: valid score/feedback accepted | PASS |
| SC-02 | LLM output schema validation and fallback helpers | Feynman: score out of range / non-integer / short feedback rejected | PASS |
| SC-03 | LLM output schema validation and fallback helpers | Diagnosis: unknown diagnosisType rejected; confidence must be within 0-1 | PASS |
| SC-04 | LLM output schema validation and fallback helpers | Planner: action restricted to the bounded 9-action enum | PASS |
| SC-05 | LLM output schema validation and fallback helpers | Planner: too many alternatives (>3) or over-long studentReason rejected | PASS |
| SC-06 | LLM output schema validation and fallback helpers | Recommendation: priority 1-5 integer, confidence 0-1, bounded section types | PASS |
| SC-07 | LLM output schema validation and fallback helpers | Intervention: unknown interventionType rejected | PASS |
| FB-01 | LLM output schema validation and fallback helpers | extracts JSON embedded in prose / markdown fences | PASS |
| FB-02 | LLM output schema validation and fallback helpers | throws when there is no JSON object | PASS |
| FB-03 | LLM output schema validation and fallback helpers | throws on malformed JSON | PASS |
| FB-04 | LLM output schema validation and fallback helpers | throws (never returns) schema-invalid data | PASS |
| FB-05 | LLM output schema validation and fallback helpers | a bare array is rejected | PASS |
| FB-06 | LLM output schema validation and fallback helpers | toTextContent handles string, content-part array and unknown | PASS |
| FB-07 | LLM output schema validation and fallback helpers | isRateLimitError recognises HTTP 429, name, message and nested body shapes | PASS |
| FB-08 | LLM output schema validation and fallback helpers | isRateLimitError is false for unrelated errors / non-objects | PASS |
| AG-01 | AI agents with mocked LLM | healthy student: deterministic short-circuit, ZERO LLM calls | PASS |
| AG-02 | AI agents with mocked LLM | roadblock + valid structured output: exactly one LLM call, output passed through | PASS |
| AG-03 | AI agents with mocked LLM | structured call throws, plain-text JSON valid: recovers via second path (2 calls) | PASS |
| AG-04 | AI agents with mocked LLM | both paths fail (invalid JSON): deterministic fallback INSUFFICIENT_EVIDENCE, no throw | PASS |
| AG-05 | AI agents with mocked LLM | plain-text output violating schema (bad enum) is rejected -> fallback | PASS |
| AG-06 | AI agents with mocked LLM | rate limit (HTTP 429): no second LLM attempt, straight to fallback (1 call) | PASS |
| AG-07 | AI agents with mocked LLM | provider timeout/network error: fallback, student copy leaks no technical detail | PASS |
| AG-08 | AI agents with mocked LLM | healthy student: no LLM call; NO_ACTION when no postrequisite exists | PASS |
| AG-09 | AI agents with mocked LLM | LLM failure: deterministic fallback returns a valid-schema action; no throw | PASS |
| AG-10 | AI agents with mocked LLM | fallback with weak prerequisite selects REVISIT_PREREQUISITE using only validated target ids | PASS |
| AG-11 | AI agents with mocked LLM | hallucinated REVISIT_PREREQUISITE target id is rejected and action downgraded | PASS |
| AG-12 | AI agents with mocked LLM | hallucinated target on a no-target action (PRACTISE) is stripped | PASS |
| AG-13 | AI agents with mocked LLM | valid grounded ADVANCE target is accepted unchanged | PASS |
| AG-14 | AI agents with mocked LLM | total LLM failure still returns a schema-valid heuristic recommendation (no throw) | PASS |
| AG-15 | AI agents with mocked LLM | fallback only recommends submission ids that exist in availableSubmissions | PASS |
| AG-16 | AI agents with mocked LLM | malformed first output is repaired on the second attempt | PASS |

### 3.4 What the passing tests demonstrate (claims that are now evidenced)

- **No evidence stays unknown, not zero** (MS-01, MS-02, MS-16): a learner with no scored attempts gets `null`, and time-on-page alone can never create a mastery score.
- **Recency weighting works as documented** (MS-04 to MS-08): weights 5:4:3:2:1 over at most five attempts; an old peak fades out once five newer attempts exist; attempt order in the input does not matter.
- **60:40 quiz/Feynman blend, no penalty for a missing signal** (MS-09, MS-10).
- **Engagement can only subtract, at most 5 points** (MS-14, MS-15, MS-15b, MS-17).
- **Level bands** Beginner 0-39, Developing 40-69, Proficient 70-84, Mastered 85-100 verified at every boundary (MS-13).
- **Roadblock detection is deterministic and pure** (RB-17), emits nothing for healthy or evidence-free learners (RB-01, RB-02, RB-05), distinguishes severities (RB-03, RB-06, RB-07) and treats time as a low-severity exposure signal only (RB-11).
- **Ranking is deterministic and bounded** (RK-01 to RK-07): higher severity first, recency as tie-break, at most 8 candidates, identical order over 50 repeated runs.
- **The LLM is only called when needed** (AG-01, AG-08): healthy learners cause **zero** LLM calls in both the Diagnostic Agent and the Planner. This is the measurable basis of the "sustainability by design" claim.
- **Failures never break the page and never write state** (AG-04 to AG-07, AG-09, AG-14): model errors, invalid JSON, schema-invalid JSON, HTTP 429 and timeouts all return a valid deterministic result; student-facing text contains no technical error wording (AG-07). On a 429 only one LLM call is made (AG-06), so quota is not wasted on a retry.
- **Hallucinated targets are rejected** (AG-11, AG-12): if the planner invents a prerequisite or submission id that is not in the validated candidate list, the id is cleared and the action is downgraded; ids on actions that take no target are stripped. A grounded ADVANCE target passes through unchanged (AG-13).
- **Structured output is always schema-checked** (SC-01 to SC-07, FB-01 to FB-06): out-of-range scores, unknown enum values, too many alternatives and over-long text are rejected.

---

## 4. Performance and reliability benchmark

Endpoint: `POST /api/ai/recommend` (default sample payload: 2 submissions, 1 prerequisite edge), model `openai/gpt-oss-120b` on Groq (free/on-demand tier). 30 sequential requests, 1.5 s apart, dev server (not a production build), same machine as the server, so network latency is negligible.

| Metric | Value |
|---|---|
| Requests | 30 |
| HTTP 200 | 30 (100%) |
| HTTP errors / crashes | 0 (0%) |
| Latency, all requests: p50 / p95 / min / max | 89 ms / 6369 ms / 71 ms / 6666 ms |
| Responses produced by the LLM | 1 of 30 |
| Responses produced by the deterministic fallback | 29 of 30 (97%) |
| Fallback latency, fast path (<1 s): count / mean | 22 / 96 ms |
| Fallback latency, slow path (>=1 s, includes a failed LLM attempt): count / mean | 7 / 2769 ms |
| LLM-generated response latency | 6369 ms (single sample, so no p50/p95 is claimed for the LLM path) |

**Cause of the fallbacks (from server log):** Groq returned HTTP 429, "Rate limit reached for model openai/gpt-oss-120b ... tokens per minute (TPM): Limit 8000, Used ~6700, Requested 1361". One recommendation request costs about 1,361 tokens, so the free tier allows roughly **5 LLM-backed recommendations per minute per API key**.

**How to read this honestly in the report**
- Positive: under sustained quota exhaustion the service stayed available (0% errors) and returned schema-valid recommendations in a median of 89 ms. This is direct evidence for the "safe deterministic fallback" claim (FR-14).
- Limitation: because 29/30 answers came from the fallback, this run measures **fallback resilience**, not LLM recommendation quality or LLM latency. A fair LLM-latency figure needs either a paid tier or requests spaced about 15 s apart.
- The dev server is slower than a production build; these are not production numbers.
- Only one endpoint was benchmarked. Student-page rendering time and database query time were not measured.

---

## 5. Security and access-control test (executed without a login)

Method: every API route was called with an empty JSON body and **no cookies or session**. A secured route should return 401/403 before doing any work.

### 5.1 API routes

| Route | HTTP status | Outcome |
|---|---|---|
| POST `/api/mastery/recalculate` | 401 | Denied (auth gate works) |
| POST `/api/ai/recommend-action` | 401 | Denied (auth gate works) |
| POST `/api/ai/diagnose` | 401 | Denied (auth gate works) |
| POST `/api/ai/plan` | 401 | Denied (auth gate works) |
| POST `/api/ai/remediate` | 401 | Denied (auth gate works) |
| POST `/api/ai/graph-mutate` | 401 | Denied (auth gate works) |
| POST `/api/ai/peer-match` | 401 | Denied (auth gate works) |
| POST `/api/feynman/evaluate` | 401 | Denied (auth gate works) |
| POST `/api/tracking/finalize-session` | 200 | No-op by design (returns ok, writes nothing without a session) |
| POST `/api/recommendations/focus-cache` | 401 | Denied (auth gate works) |
| POST `/api/ai/recommend` | 200 | **Served without authentication** |
| POST `/api/chat` | 400 | **Reached input validation without authentication** |
| POST `/api/ai/viva` | 200 | **Served without authentication** |
| POST `/api/ai/code-pair` | 400 | **Reached input validation without authentication** |
| POST `/api/teacher/analytics-agent` | 200 | **Served without authentication** |
| POST `/api/teacher/authoring-agent` | 200 | **Served without authentication** |

**Result: 10 of 16 routes (the student-data and mutation routes) correctly deny anonymous access. 6 do not.**

Details of the six:

| Route | Evidence | Risk |
|---|---|---|
| `/api/ai/recommend` | 200 with a full recommendation, no auth code in the file | Anyone can spend the project's Groq quota (this is also why the benchmark hit the rate limit so quickly) |
| `/api/ai/viva` | 200, generated an interview question | Same: free LLM usage for anonymous callers |
| `/api/teacher/authoring-agent` | 200, generated a full learning-object draft | Teacher-only feature callable by anyone |
| `/api/teacher/analytics-agent` | 200, returned a course-health analysis | Teacher-only feature callable by anyone; it also queries `student_submission_mastery` through the anonymous (no-login) client |
| `/api/chat` | 400 "Message is required." | Reaches input validation without any auth check (no `getUser` in the file); a valid message was deliberately not sent to avoid spending quota |
| `/api/ai/code-pair` | 400 "Code is required" | Same as above |

Also note: the `analytics-agent` route contains hard-coded demonstration values (for example `studentCount` 28/34 and default mastery figures when no data matches). Its output must not be presented as measured learner analytics.

### 5.2 Pages and middleware

| Page (no session) | Result |
|---|---|
| `/dashboard` | 307 -> /sign-in |
| `/teacher` | 307 -> /sign-in |
| `/recommendations` | 307 -> /sign-in |
| `/sign-in` | 200 |

Middleware (`src/middleware.ts`) protects `/dashboard` and `/teacher` only. `/recommendations` also redirected to sign-in (enforced in the page itself). API routes are **not** covered by middleware, which is why each route must check authentication itself; that is exactly where the six gaps above are.

---

## 6. Static analysis

- `tsc --noEmit`: **0 type errors.**
- `next lint`: 1 error, 3 warnings.
  - **Error:** `src/components/lo/QuizSession.tsx:74` - React Hook `useMemo` is called conditionally (after an early return). This violates the Rules of Hooks and can crash or misbehave when the component re-renders.
  - Warnings: missing `useEffect`/`useMemo` dependencies (2) and an `<img>` without `alt` text in `DeliveryTypeTabs.tsx:1073` (an accessibility issue relevant to the usability/accessibility requirement).

---

## 7. Reproducing the results

```
cd frontend-app
npm install
npx vitest run            # 81 tests, about 3 s
npx tsc --noEmit          # type check
npm run lint              # lint
npm run dev               # then run the two Node probe scripts against localhost:3000
```

Files added (nothing else in the repository was modified): `frontend-app/tests/*.test.ts`, `frontend-app/tests/fixtures.ts`, `frontend-app/vitest.config.ts`, and `vitest` in `devDependencies` of `package.json` / `package-lock.json`. The two probe scripts (unauthenticated route probe and 30-request benchmark) were run from a scratch folder and are summarised in sections 4 and 5; copy them into the repo if the examiners want them.

---

## 8. Suggested wording for the blackbook

**Section 6.4 (Inference from test cases), suggested text:**
"Automated testing executed 81 test cases covering the mastery engine, roadblock-evidence extraction, deterministic candidate ranking, prerequisite path ordering, structured-output validation and the AI agents under simulated model failure. All 81 passed. The tests confirm that missing evidence remains unknown rather than zero, that recent attempts outweigh older ones, that engagement can only reduce (never raise) mastery by at most five points, that healthy learners trigger no LLM calls, and that invalid, hallucinated or unavailable model output results in a validated deterministic fallback without modifying learner state. Black-box probing of the running application without authentication showed that ten API routes deny anonymous access while six AI and teacher-assistance routes do not enforce authentication; this is recorded as an open security defect."

**Section 7.4 (Graphical and statistical output):** use the section 4 table; suggested charts are (a) bar of test counts per suite, (b) bar of route status 401 vs 200/400, (c) per-request latency line for the 30 runs coloured by LLM vs fallback. Draw them only from the numbers in this file.

**Section 7.6 (Inference):** the deterministic architecture is verified by tests; resilience to model failure is evidenced by 0% errors in 30 requests under rate limiting; the limitations are the unauthenticated AI routes, the free-tier quota and the absence of a learner study.
