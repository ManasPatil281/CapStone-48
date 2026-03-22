import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def check_type():
    url = os.getenv("SUPABASE_DB_URL")
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute("SELECT data_type FROM information_schema.columns WHERE table_name='learning_object_content' AND column_name='content_json'")
    print(f"content_json Type: {cur.fetchone()[0]}")
    cur.close()
    conn.close()

if __name__ == '__main__':
    check_type()
