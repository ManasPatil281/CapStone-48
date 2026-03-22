import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables (if you have a .env file)
load_dotenv()

# Replace with your actual Supabase Database Connection URI
# Found in Supabase Dashboard -> Project Settings -> Database -> Connection string -> URI
DATABASE_URL = os.getenv("SUPABASE_DB_URL", "postgresql://postgres.qyhdcegblikhlroogtsu:Bd8m8sf?26K5?7V@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres")

# The SQL schema you provided
SUPABASE_SQL_SCHEMA = """
-- Enable UUID extension (Usually enabled by default in Supabase, but good practice)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 📘 A. LEARNING STRUCTURE TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS learning_object (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    difficulty_level INT CHECK (difficulty_level BETWEEN 1 AND 5),
    estimated_time_minutes INT,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_object_prerequisite (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_object_id UUID REFERENCES learning_object(id) ON DELETE CASCADE,
    prerequisite_lo_id UUID REFERENCES learning_object(id) ON DELETE CASCADE,
    UNIQUE(learning_object_id, prerequisite_lo_id) -- Prevent duplicate edges
);
-- Index for graph traversal
CREATE INDEX IF NOT EXISTS idx_lo_prereq_lo_id ON learning_object_prerequisite(learning_object_id);
CREATE INDEX IF NOT EXISTS idx_lo_prereq_prereq_id ON learning_object_prerequisite(prerequisite_lo_id);

-- ==============================================================================
-- 📘 B. DELIVERY SYSTEM
-- ==============================================================================

CREATE TABLE IF NOT EXISTS delivery_type (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL, -- FLOWCHART, EXAMPLE, VIDEO, TEXT, etc.
    name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_object_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_object_id UUID REFERENCES learning_object(id) ON DELETE CASCADE,
    delivery_type_id UUID REFERENCES delivery_type(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    content_json JSONB NOT NULL, -- Extremely flexible (holds video URLs, markdown, node graphs)
    sequence_order INT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ==============================================================================
-- 📘 C. ASSESSMENT ENGINE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS lo_assessment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_object_id UUID REFERENCES learning_object(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    pass_percentage DECIMAL(5,2) DEFAULT 80.00,
    max_attempts INT DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lo_question (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID REFERENCES lo_assessment(id) ON DELETE CASCADE,
    question_type VARCHAR(50) NOT NULL, -- MCQ, TRUE_FALSE, CODE, SHORT
    question_text TEXT NOT NULL,
    metadata_json JSONB, -- For hints, explanations, code boilerplates
    marks INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lo_question_option (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID REFERENCES lo_question(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT false
);

-- ==============================================================================
-- 📘 D. USER PERSONALIZATION + TRACKING 
-- Note: Assuming you use Supabase Auth. 'auth.users' is the built-in user table.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS user_learning_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    learning_object_id UUID REFERENCES learning_object(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'MASTERED')),
    completion_percentage DECIMAL(5,2) DEFAULT 0.00,
    mastery_score DECIMAL(5,2) DEFAULT 0.00,
    first_started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, learning_object_id)
);

CREATE TABLE IF NOT EXISTS user_lo_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    learning_object_id UUID REFERENCES learning_object(id) ON DELETE CASCADE,
    delivery_type_id UUID REFERENCES delivery_type(id) ON DELETE CASCADE,
    time_spent_seconds INT DEFAULT 0,
    interactions_count INT DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_assessment_attempt (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    assessment_id UUID REFERENCES lo_assessment(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,
    score INT DEFAULT 0,
    percentage DECIMAL(5,2) DEFAULT 0.00,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    is_passed BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS user_question_response (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID REFERENCES user_assessment_attempt(id) ON DELETE CASCADE,
    question_id UUID REFERENCES lo_question(id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES lo_question_option(id) ON DELETE SET NULL,
    answer_text TEXT, -- For Short Answer / Code questions
    is_correct BOOLEAN,
    marks_awarded INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_delivery_preference (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    delivery_type_id UUID REFERENCES delivery_type(id) ON DELETE CASCADE,
    preference_score DECIMAL(5,2) DEFAULT 0.00, -- e.g., 0.8 means 80% preference
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, delivery_type_id)
);

-- Function to Auto-Update 'updated_at' timestamps
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for learning_object
DROP TRIGGER IF EXISTS update_lo_modtime ON learning_object;
CREATE TRIGGER update_lo_modtime
BEFORE UPDATE ON learning_object
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- ==============================================================================
-- 📘 E. AI INSIGHTS & SUMMARIES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS user_ai_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- e.g., 'DAILY', 'WEEKLY', 'MILESTONE'
    summary_type VARCHAR(50) NOT NULL CHECK (summary_type IN ('DAILY', 'WEEKLY', 'MILESTONE')), 
    
    -- The actual time period this summary covers
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    
    -- The generated AI text (e.g., "You did great on Time Complexity, but struggled with Loops...")
    ai_summary_text TEXT NOT NULL,
    
    -- Storing actionable next steps in JSON so the frontend can render them as buttons
    -- e.g.,[{"action": "review_lo", "lo_id": "123", "reason": "Low quiz score"}]
    recommended_actions JSONB, 
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index to quickly pull the latest summary for a specific user
CREATE INDEX IF NOT EXISTS idx_user_ai_summary_user_id ON user_ai_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ai_summary_created_at ON user_ai_summary(created_at DESC);
"""

def setup_database():
    """Connects to Supabase PostgreSQL and executes the setup SQL schema."""
    conn = None
    try:
        if "YOUR-PASSWORD" in DATABASE_URL or "YOUR-PROJECT-REF" in DATABASE_URL:
            # If default placeholders are found, throw an informative error.
            print("❌ Error: Please update the DATABASE_URL variable with your actual Supabase connection string.")
            print("   You can find it in Supabase Dashboard -> Project Settings -> Database -> Connection string -> URI.")
            return

        print("🔌 Connecting to Supabase database...")
        # Connecting to the database
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False # Using transaction
        
        # Creating a cursor
        cur = conn.cursor()
        
        print("🛠️  Executing schema deployment. This may take a few seconds...")
        cur.execute(SUPABASE_SQL_SCHEMA)
        
        # Commit the transaction
        conn.commit()
        
        print("✅ Success! The Supabase schema has been set up correctly.")
        
        # Closing the cursor
        cur.close()
        
    except psycopg2.OperationalError as e:
        print(f"❌ Connection Error! Could not connect to Supabase: {e}")
    except (Exception, psycopg2.DatabaseError) as error:
        print(f"❌ Error while executing SQL: {error}")
        if conn is not None:
            conn.rollback()
    finally:
        if conn is not None:
            conn.close()
            print("🔌 Database connection closed.")

if __name__ == "__main__":
    setup_database()
