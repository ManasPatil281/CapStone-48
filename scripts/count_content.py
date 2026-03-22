import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def count_content():
    url = os.getenv("SUPABASE_DB_URL")
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM learning_object_content WHERE delivery_type_id = (SELECT id FROM delivery_type WHERE code = 'TEXT')")
    count = cur.fetchone()[0]
    print(f"TEXT Content Count: {count}")
    cur.close()
    conn.close()

if __name__ == '__main__':
    count_content()
