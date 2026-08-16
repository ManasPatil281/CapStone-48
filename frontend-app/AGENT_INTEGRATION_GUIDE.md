# Comprehensive Agent Integration & Architecture Guide

This document presents a complete technical reference for all agentic AI features, tools, state graphs, API routes, and frontend overlays implemented in the **CapStone-48 Adaptive Learning Platform**.

---

## 1. Overview of AI Architecture

The system has transitioned from basic single-shot fetch prompts to a multi-tiered, agentic AI architecture powered by **LangChain**, **LangGraph**, and **Groq LLM (`llama-3.1-8b-instant`)**.

```
+-------------------------------------------------------------------------------+
|                             GLOBAL AGENT MODE HUD                             |
|      (Pulsing ambient overlay, page-aware diagnostics, platform auto-nav)     |
+-------------------------------------------------------------------------------+
                                       |
    +----------------------------------+----------------------------------+
    |                                  |                                  |
    v                                  v                                  v
+───────────────────────+  +───────────────────────+  +───────────────────────+
|     TUTOR AGENT       |  |  SOCRATIC COACH &     |  |   LEARNING ROUTER &   |
|   (LangGraph ReAct)   |  |   MULTI-AGENT DEBATE  |  |   STRUGGLE DETECTOR   |
+───────────────────────+  +───────────────────────+  +───────────────────────+
    |                          |                          |
    | (Tool Calling)           | (State Graph)            | (Signals Reasoning)
    v                          v                          v
+─────────────────────────────────────────────────────────────────────────────+
|                          DATABASE & TOOLS LAYER                             |
|  - fetch_prerequisites   - get_quiz_weakness   - get_mastery_status         |
|  - get_content_block     - Supabase Tables & Edge Graph                     |
+─────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Agent Inventory & Functional Details

### A. ReAct Tutor Agent (`tutor-agent.ts`)
* **Framework**: `createReactAgent` from `@langchain/langgraph/prebuilt`.
* **Purpose**: Serves as an interactive in-page assistant for Learning Objects.
* **Tools Accessible**:
  * `fetch_prerequisites`: Resolves curriculum prerequisite DAG edges.
  * `get_quiz_weakness`: Fetches student performance on recent quizzes.
  * `get_content_block`: Queries deep content text for specific teaching blocks.
  * `get_mastery_status`: Fetches calculated mastery scores (0–100%).
* **Endpoint**: `POST /api/chat`

---

### B. Socratic Coaching Agent & Multi-Agent Debate (`feynman-coach.ts` & `multi-agent-evaluator.ts`)
* **Framework**: LangGraph `StateGraph` state machine + Multi-Agent Consensus.
* **Purpose**: Evaluates student explanations using the Feynman technique.
* **Graph Flow**: `evaluate_explanation` → `detect_misconception` → `ask_followup` → `final_grade`.
* **Multi-Agent Debate Sub-Agents**:
  * **Defender Agent**: Formulates arguments supporting valid student intuition.
  * **Strict Evaluator Agent**: Looks for technical inaccuracies and missing edge cases.
  * **Judge Agent**: Synthesizes opposing arguments into a balanced final score.
* **Endpoint**: `POST /api/feynman/evaluate`

---

### C. Autonomous Content Remediation Agent (`remediation-agent.ts`)
* **Purpose**: Triggered when a student struggles or scores below threshold (< 60%).
* **Output**: Tailored 3-card micro-lesson (Misconception Fix, Mental Model, Check Question).
* **Endpoint**: `POST /api/ai/remediate`
* **Frontend Component**: `RemediationModal.tsx`

---

### D. Instructor Course Analytics Agent (`course-analytics-agent.ts`)
* **Purpose**: Analyzes class-wide mastery drop-off points, idle ratios, and average quiz scores.
* **Output**: `courseHealthScore` and `flaggedInsights` with suggested fixes.
* **Endpoint**: `POST /api/teacher/analytics-agent`
* **Frontend Component**: `TeacherAnalyticsAgentPanel.tsx` on `/teacher`.

---

### E. Spaced Repetition Scheduler Agent (`spaced-repetition-agent.ts`)
* **Purpose**: Models memory retention decay (Ebbinghaus curve adapted with engagement metrics).
* **Frontend Component**: `SpacedRepetitionWidget.tsx` on `/recommendations`.

---

### F. Global "Agent Mode" Co-Pilot Overlay (`AgentModeOverlay.tsx`)
* **Hotkey**: Press **`Ctrl + J`** (or `Cmd + J`) anywhere in the application.
* **Features**: Floating HUD toggle, page-aware diagnostics, platform auto-navigation.
