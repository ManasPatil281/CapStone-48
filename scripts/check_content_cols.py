import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def check_cols():
    url = os.getenv("SUPABASE_DB_URL")
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='learning_object_content'")
    print(f"Columns: {cur.fetchall()}")
    cur.close()
    conn.close()

if __name__ == '__main__':
    check_cols()
