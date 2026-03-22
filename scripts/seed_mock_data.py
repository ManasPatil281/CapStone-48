import os
import psycopg2
import uuid
import json
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("SUPABASE_DB_URL")

def generate_mock_data():
    if not DATABASE_URL or "YOUR-PASSWORD" in DATABASE_URL:
        print("❌ Error: Invalid DATABASE_URL in environment or internal variables.")
        return

    print("🔌 Connecting to Supabase database...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        print("🧹 Cleaning up old mock data so we can start fresh...")
        # Since 'learning_object' acts as the core parent entity in your schema, deleting from it cascades down 
        # to assessments, questions, options, content, prerequisites, and user interactions.
        cur.execute("DELETE FROM learning_object")
        cur.execute("DELETE FROM delivery_type")
        # Ensure we don't have dangling preferences or summaries
        cur.execute("DELETE FROM user_delivery_preference")
        cur.execute("DELETE FROM user_ai_summary")

        print("👤 Handling genuine user (manaspatil281@gmail.com)...")
        email = "manaspatil281@gmail.com"
        # First, attempt to see if manas exists
        cur.execute("SELECT id FROM auth.users WHERE email = %s", (email,))
        user = cur.fetchone()
        
        if not user:
            print("Creating Manas in auth.users...")
            new_user_id = str(uuid.uuid4())
            try:
                # Required Supabase parameters for raw auth user creation
                cur.execute("""
                    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
                    VALUES (%s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s, 'dummy_hash', now(), now(), now())
                    RETURNING id;
                """, (new_user_id, email))
                res = cur.fetchone()
                user_id = res[0]
                print(f"👤 Created User ID: {user_id}")
            except Exception as e:
                print(f"❌ Failed to create genuine user in auth.users: {e}")
                user_id = None
        else:
            user_id = user[0]
            print(f"👤 Found User ID: {user_id}")

        print("🔄 Seeding Delivery Types...")
        delivery_types = ['TEXT', 'VIDEO', 'FLOWCHART', 'EXAMPLE', 'QUIZ']
        dt_ids = {}
        for dt in delivery_types:
            cur.execute("""
                INSERT INTO delivery_type (code, name) 
                VALUES (%s, %s) 
                ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
                RETURNING id;
            """, (dt, dt.capitalize()))
            dt_ids[dt] = cur.fetchone()[0]

        print("🔄 Seeding Genuine Advanced Computer Science Learning Objects & Prereqs...")
        topics = [
            (
                "Big O Notation: Time Complexity Basics", 
                "big-o-time-complexity", 
                "Understand the fundamentals of algorithm analysis and how to evaluate code efficiency.", 
                3, 
                25
            ),
            (
                "Hash Tables and Dictionary Implementations", 
                "hash-tables-dictionaries", 
                "Deep dive into how key-value storage works under the hood, collision resolution, and optimal usage.", 
                4, 
                35
            ),
            (
                "Graph Traversal: BFS and DFS", 
                "graph-traversal", 
                "Learn the core graph traversal techniques, Breadth-First and Depth-First Search, with real-world pathfinding applications.", 
                4, 
                45
            )
        ]
        
        # Real Content Mapping
        content_map = {
            "big-o-time-complexity": {
                "text": "Big O notation is a mathematical notation that describes the limiting behavior of a function when the argument tends towards a particular value or infinity. In computer science, it is used to classify algorithms according to how their run time or space requirements grow as the input size grows. For example, accessing an array element by index is O(1) (constant time), while searching an unsorted array is O(n) (linear time). When writing complex software, minimizing nested loops is key to avoiding O(n^2) time complexity, which can severely bottleneck performance on large datasets.",
                "q": "Which of the following time complexities represents the fastest theoretical execution for a search algorithm on an extremely large dataset?",
                "options": [("O(1)", True), ("O(N)", False), ("O(N log N)", False), ("O(N^2)", False)]
            },
            "hash-tables-dictionaries": {
                "text": "A Hash Table is a data structure that implements an associative array abstract data type, a structure that can map keys to values. It uses a hash function to compute an index, also called a hash code, into an array of buckets or slots, from which the desired value can be found. During a lookup, the key is hashed and the resulting hash indicates where the corresponding value is stored. A common issue is 'collisions', where two keys hash to the same index. This is typically resolved using chaining (linked lists) or open addressing.",
                "q": "What is the most common consequence of having a poor hash function in a Hash Table implementation?",
                "options": [("Frequent collisions leading to O(N) lookup time.", True), ("Memory leaks in the primary array.", False), ("The array will refuse to store any more values.", False), ("Keys will be automatically deleted.", False)]
            },
            "graph-traversal": {
                "text": "Breadth-First Search (BFS) explores the neighbor nodes first, before moving to the next level neighbors, making it ideal for finding the shortest path on unweighted graphs. It utilizes a Queue data structure. Depth-First Search (DFS) explores as far as possible along each branch before backtracking, utilizing a Stack (often via recursion). DFS is useful for topological sorting, finding connected components, and solving puzzles with only one solution, such as a maze.",
                "q": "If you need to find the shortest path out of a constantly shifting maze with equidistant pathways, which algorithm is strictly better suited for this and what data structure does it fundamentally rely on?",
                "options": [("BFS utilizing a Queue", True), ("DFS utilizing a Stack", False), ("BFS utilizing a Stack", False), ("DFS utilizing a Queue", False)]
            }
        }

        lo_ids = []
        for title, slug, desc, diff, mins in topics:
            cur.execute("""
                INSERT INTO learning_object (title, slug, description, difficulty_level, estimated_time_minutes, status)
                VALUES (%s, %s, %s, %s, %s, 'published')
                ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
                RETURNING id;
            """, (title, slug, desc, diff, mins))
            lo_ids.append((cur.fetchone()[0], slug))
            
        print("🔄 Linking Prerequisites...")
        for i in range(len(lo_ids) - 1):
            cur.execute("""
                INSERT INTO learning_object_prerequisite (learning_object_id, prerequisite_lo_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (lo_ids[i+1][0], lo_ids[i][0]))

        print("🔄 Seeding Genuine Learning Content, Assessments & Questions...")
        for lo_id, slug in lo_ids:
            data = content_map[slug]
            
            cur.execute("""
                INSERT INTO learning_object_content (learning_object_id, delivery_type_id, title, content_json)
                VALUES (%s, %s, %s, %s)
            """, (lo_id, dt_ids['TEXT'], f"Core Material: {slug.replace('-', ' ').title()}", json.dumps({"markdown": data["text"]})))
            
            cur.execute("""
                INSERT INTO lo_assessment (learning_object_id, title)
                VALUES (%s, %s) RETURNING id;
            """, (lo_id, "Module Knowledge Check"))
            assessment_id = cur.fetchone()[0]
            
            cur.execute("""
                INSERT INTO lo_question (assessment_id, question_type, question_text)
                VALUES (%s, %s, %s) RETURNING id;
            """, (assessment_id, "MCQ", data["q"]))
            q_id = cur.fetchone()[0]
            
            for opt_text, is_correct in data["options"]:
                cur.execute("INSERT INTO lo_question_option (question_id, option_text, is_correct) VALUES (%s, %s, %s)", (q_id, opt_text, is_correct))

        if user_id:
            print(f"🔄 Seeding User Activity, Progress & Responses for manaspatil281@gmail.com...")
            # Let's say Manas mastered the first two, and is starting the third
            mastered_los = [lo_ids[0][0], lo_ids[1][0]]
            
            for lo_id in mastered_los:
                cur.execute("""
                    INSERT INTO user_learning_progress (user_id, learning_object_id, status, completion_percentage, mastery_score)
                    VALUES (%s, %s, 'MASTERED', 100.0, 100.0)
                    ON CONFLICT(user_id, learning_object_id) DO UPDATE SET status = 'MASTERED'
                """, (user_id, lo_id))
                
                cur.execute("""
                    INSERT INTO user_lo_activity (user_id, learning_object_id, delivery_type_id, time_spent_seconds, interactions_count)
                    VALUES (%s, %s, %s, %s, %s)
                """, (user_id, lo_id, dt_ids['TEXT'], 900, 24))
                
                cur.execute("SELECT id FROM lo_assessment WHERE learning_object_id = %s LIMIT 1", (lo_id,))
                assmt = cur.fetchone()
                if assmt:
                    cur.execute("""
                        INSERT INTO user_assessment_attempt (user_id, assessment_id, attempt_number, score, percentage, is_passed)
                        VALUES (%s, %s, 1, 100, 100.0, True) RETURNING id
                    """, (user_id, assmt[0]))
                    attempt_id = cur.fetchone()[0]

                    cur.execute("SELECT id FROM lo_question WHERE assessment_id = %s", (assmt[0],))
                    questions = cur.fetchall()
                    for q in questions:
                        cur.execute("SELECT id FROM lo_question_option WHERE question_id = %s AND is_correct = true LIMIT 1", (q[0],))
                        opt = cur.fetchone()
                        if opt:
                            cur.execute("""
                                INSERT INTO user_question_response (attempt_id, question_id, selected_option_id, is_correct, marks_awarded)
                                VALUES (%s, %s, %s, %s, %s)
                            """, (attempt_id, q[0], opt[0], True, 1))

            print("🔄 Seeding Realistic User AI Summary...")
            cur.execute("""
                INSERT INTO user_ai_summary (user_id, summary_type, ai_summary_text, recommended_actions)
                VALUES (%s, 'WEEKLY', 'Manas, you are crushing the curriculum! Your grasp on Hash Maps and Time Complexity was flawless. However, I noticed you spent slightly less time reviewing collision edge cases in Hash Tables. Going forward, let us dive into Graph Traversal.', %s)
            """, (user_id, json.dumps([{"action": "Start Module", "reason": "Next chronological concept in the DAG graph.", "lo_slug": "graph-traversal"}])))

            print("🔄 Seeding User Preferences...")
            for dt, score in [('TEXT', 0.85), ('VIDEO', 0.60), ('FLOWCHART', 0.95)]:
                cur.execute("""
                    INSERT INTO user_delivery_preference (user_id, delivery_type_id, preference_score)
                    VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
                """, (user_id, dt_ids[dt], score))

        conn.commit()
        print("✅ Highly Realistic Mock Data Seeded Successfully!")
        
    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    generate_mock_data()
