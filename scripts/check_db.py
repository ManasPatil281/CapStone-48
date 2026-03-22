import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def check():
    url = os.getenv("SUPABASE_DB_URL")
    if not url:
        print("URL not found")
        return
    
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
    tables = [row[0] for row in cur.fetchall()]
    
    for table in tables:
        cur.execute(f"SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='{table}'")
        cols = cur.fetchall()
        print(f"  {table}:")
        for c in cols:
            print(f"    {c[0]}: {c[1]} (default: {c[2]})")
    
    cur.close()
    conn.close()

if __name__ == '__main__':
    check()
