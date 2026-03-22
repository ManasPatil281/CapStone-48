# Adaptive Learning AI Engine

This is a powerful AI-driven backend for an adaptive learning platform. It uses FastAPI for the API, Supabase (PostgreSQL) for data storage, and LangChain for AI features including RAG, Socratic grading, and personalized recommendations.

## 🛠 Technology Stack
- **Framework:** FastAPI
- **Database:** Supabase PostgreSQL
- **AI Models:** Groq (LLM), Hugging Face (Embeddings)
- **Vector Store:** PGVector (via LangChain)
- **Environment:** Python 3.10+

## 📊 Database Structure

### Core Learning Tables
- `learning_object`: Stores core concepts and learning nodes (title, description, level).
- `learning_object_content`: Holds educational material in various formats (TEXT, VIDEO, FLOWCHART, etc.) linked to learning objects.
- `delivery_type`: Master list of supported content formats.
- `learning_object_prerequisite`: Manages the dependency graph between concepts.

### User & Progress Tables
- `auth.users`: Managed by Supabase for authentication.
- `user_learning_progress`: Tracks mastery status and completion for each user per topic.
- `user_lo_activity`: Captures engagement metrics like "time spent" and "interaction count".
- `user_assessment_attempt`: Stores quiz results, scores, and timestamps.
- `user_question_response`: Granular data on how students answered specific questions.
- `user_delivery_preference`: AI model for mapping student preferences to optimal delivery methods.

### AI Storage
- `user_ai_summary`: Stores the weekly analysis and recommendations generated for each student.
- `langchain_pg_collection` / `embedding`: Internal tables for the PGVector store used by the RAG Chatbot.

## 🚀 AI Endpoints & Use Cases

### User API (`/api/ai`)

1. **Weekly AI Summary** (`POST /generate-weekly-summary/{user_id}`)
   - **Use Case:** Provides a warm, encouraging reflection of the student's progress over the last 7 days with 2-3 actionable next steps.
   
2. **Just-in-Time Remediation** (`POST /remediation`)
   - **Use Case:** Triggered when a student answers a question incorrectly. Uses an LLM to explain the concept using a simple analogy.

3. **RAG Chatbot** (`POST /chat`)
   - **Use Case:** A "Tutor Chat" where students can ask questions. It uses semantic search against the knowledge base (Feature 11) to provide context-aware answers.

4. **Adaptive Router** (`POST /route/{user_id}`)
   - **Use Case:** Analyzes student history and preferences to recommend the most engaging next topic and format.

5. **Socratic Grader** (`POST /socratic-grade`)
   - **Use Case:** Subjectively grades open-ended student explanations of concepts, providing constructive feedback instead of just a score.

6. **Struggle Detection** (`POST /struggle-detection/{user_id}/{lo_id}`)
   - **Use Case:** Early warning system that triggers if a user spends too much time on a single topic without progress, offering a friendly intervention.

7. **Dynamic Flashcards** (`GET /flashcard/{user_id}`)
   - **Use Case:** Spaced repetition system that picks mastered topics from the past and generates a "difficult recall" trivia question.

8. **AI Ghost Learner** (`GET /ghost-learner/{lo_id}`)
   - **Use Case:** Social proof feature that summarizes common misconceptions among *other* students for the current topic.

### Admin API (`/api/admin/ai`)

1. **Content Variant Generator** (`POST /generate-variants/{lo_id}`)
   - **Use Case:** Automatically converts standard TEXT content into complex formats like MINDMAP_JSON or FLOWCHART.

2. **Content Gap Analyzer** (`POST /content-gap`)
   - **Use Case:** Instructional design tool that identifies low-passrate topics and suggests "bridge" topics to insert.

3. **Content Ingestion Pipeline** (`POST /ingest-all` or `POST /ingest/{lo_id}`)
   - **Use Case:** Populates the Vector Database for the Chatbot. Use `ingest-all` to sync the entire library with the RAG engine.

## 🧪 Testing
Run the PowerShell test script to verify all endpoints:
```powershell
.\test_endpoints.ps1
```

Or use the provided `test_endpoints.http` in VS Code with the REST Client extension.
