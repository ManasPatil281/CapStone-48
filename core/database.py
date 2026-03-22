import os
import re
import asyncio
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("SUPABASE_DB_URL")

def convert_query(query: str) -> str:
    """
    Converts SQLAlchemy-style named parameters (:param) to 
    psycopg2-style named parameters (%(param)s).
    """
    return re.sub(r':([a-zA-Z0-9_]+)', r'%(\1)s', query)

def _fetch_sync(query: str, params: dict):
    if not DATABASE_URL:
        raise ValueError("SUPABASE_DB_URL is not set.")
    
    psql_query = convert_query(query)
    
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(psql_query, params)
            return cur.fetchall()

def _execute_sync(query: str, params: dict):
    if not DATABASE_URL:
        raise ValueError("SUPABASE_DB_URL is not set.")
        
    psql_query = convert_query(query)
    
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(psql_query, params)
        conn.commit()
    return True

async def fetch_from_db(query: str, params: dict = {}):
    """
    Executes a SELECT query asynchronously by running the synchronous 
    psycopg2 call inside a thread pool to avoid blocking FastAPI's event loop.
    """
    print(f"📡 DB FETCH: {query} with params {params}")
    return await asyncio.to_thread(_fetch_sync, query, params)

async def execute_db(query: str, params: dict = {}):
    """
    Executes an INSERT/UPDATE/DELETE query asynchronously.
    """
    print(f"📡 DB WRITE: {query} with params {params}")
    return await asyncio.to_thread(_execute_sync, query, params)
