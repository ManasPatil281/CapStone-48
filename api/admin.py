import json
from fastapi import APIRouter
from pydantic import BaseModel

from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

from core.config import llm, vector_store
from core.database import fetch_from_db, execute_db
from langchain_core.documents import Document

router = APIRouter(prefix="/api/admin/ai", tags=["Admin Features"])

# ---------------------------------------------------------
# FEATURE 3: Auto-Generating Delivery Types
# ---------------------------------------------------------
@router.post("/generate-variants/{lo_id}")
async def generate_content_variants(lo_id: str, target_format: str):
    try:
        data = await fetch_from_db("""
            SELECT loc.content_json, lo.title 
            FROM learning_object_content loc
            JOIN learning_object lo ON loc.learning_object_id = lo.id
            WHERE loc.learning_object_id = :id 
            AND loc.delivery_type_id = (SELECT id FROM delivery_type WHERE code = 'TEXT')
            LIMIT 1
        """, {"id": lo_id})
        
        if not data:
            return {"status": "error", "message": f"No TEXT content found for {lo_id}"}
        
        base_text = str(data[0]['content_json'])
        lo_title = data[0]['title']
        
        prompt = PromptTemplate.from_template("""
        Convert the following educational text into a structured JSON payload for a {format} format.
        Text: {text}
        CRITICAL: Output ONLY valid JSON. No conversational text, no markdown code blocks.
        """)
        
        chain = prompt | llm | StrOutputParser()
        new_json_content = chain.invoke({"format": target_format, "text": base_text})
        
        # Strip markdown ticks if LLM included them
        clean_json = new_json_content.strip().replace("```json", "").replace("```", "").strip()
        
        # Verify it's valid JSON before trying to insert into jsonb
        try:
            parsed_content = json.loads(clean_json)
            # Re-serialize to ensure it's a clean string
            clean_json = json.dumps(parsed_content)
        except Exception as je:
            return {"status": "error", "message": f"AI generated invalid JSON: {str(je)}", "raw": clean_json}

        # Get a delivery_type_id to satisfy NO NULL constraint
        dt = await fetch_from_db("SELECT id FROM delivery_type WHERE code = ANY(ARRAY[:format, 'TEXT', 'FLOWCHART']) LIMIT 1", {"format": target_format})
        dt_id = dt[0]['id'] if dt else None

        print(f"DEBUG: Inserting with Title: {lo_title} ({target_format})")
        
        with open("log.txt", "a") as f:
            f.write(f"DEBUG: Title={lo_title}, format={target_format}\n")
        
        if dt_id:
            params = {"lo_id": lo_id, "json": clean_json, "dt_id": dt_id, "title": f"{lo_title} ({target_format})"}
            with open("log.txt", "a") as f:
                f.write(f"DEBUG: Params={json.dumps(params)}\n")
            await execute_db("""
                INSERT INTO learning_object_content (learning_object_id, content_json, delivery_type_id, title) 
                VALUES (:lo_id, :json, :dt_id, :title)
            """, params)
        else:
            params = {"lo_id": lo_id, "json": clean_json, "title": f"{lo_title} ({target_format})"}
            with open("log.txt", "a") as f:
                f.write(f"DEBUG: Params={json.dumps(params)}\n")
            await execute_db("""
                INSERT INTO learning_object_content (learning_object_id, content_json, title) 
                VALUES (:lo_id, :json, :title)
            """, params)
        
        return {"status": "generated", "format": target_format, "content": parsed_content}
    except Exception as e:
        print(f"❌ ERROR in generate_content_variants: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

# ---------------------------------------------------------
# FEATURE 10: AI Content Gap Analyzer (For Admin)
# ---------------------------------------------------------
class ContentGapRequest(BaseModel):
    lo_id: str

@router.post("/content-gap")
async def analyze_content_gaps(req: ContentGapRequest):
    data = await fetch_from_db("SELECT pass_percentage FROM lo_assessment WHERE learning_object_id = :id", {"id": req.lo_id})
    rate = data[0].get('pass_percentage', 45) if data else 45
    
    prompt = PromptTemplate.from_template("""
    Students are failing topic X (Pass rate: {rate}%). They already mastered topic W. 
    Act as an instructional designer. Suggest a 'bridge' topic that should be inserted between W and X.
    """)
    chain = prompt | llm | StrOutputParser()
    suggestion = chain.invoke({"rate": rate})
    
    return {"ai_suggestion": suggestion}

# ---------------------------------------------------------
# FEATURE 11: Content Ingestion Pipeline (For RAG)
# ---------------------------------------------------------
@router.post("/ingest-all")
async def ingest_all_content():
    """
    Fetches all TEXT content from learning_object_content and syncs with vector_store.
    """
    contents = await fetch_from_db("""
        SELECT loc.learning_object_id, lo.title, loc.content_json 
        FROM learning_object_content loc
        JOIN learning_object lo ON loc.learning_object_id = lo.id
        WHERE loc.delivery_type_id = (SELECT id FROM delivery_type WHERE code = 'TEXT')
    """)
    
    docs = []
    import json
    for row in contents:
        # Combine title and content for better context
        try:
            content_text = json.loads(row['content_json']) if isinstance(row['content_json'], str) else row['content_json']
        except:
            content_text = row['content_json']
            
        text = f"Title: {row['title']}\n\nContent: {str(content_text)}"
        docs.append(Document(page_content=text, metadata={"lo_id": str(row['learning_object_id'])}))
    
    if docs:
        vector_store.add_documents(docs)
        return {"status": "success", "message": f"Ingested {len(docs)} documents into vector store."}
    
    return {"status": "error", "message": "No TEXT content found to ingest."}

@router.post("/ingest/{lo_id}")
async def ingest_specific_content(lo_id: str):
    """
    Syncs a specific learning object's content with the vector store.
    """
    content = await fetch_from_db("""
        SELECT lo.title, loc.content_json 
        FROM learning_object_content loc
        JOIN learning_object lo ON loc.learning_object_id = lo.id
        WHERE loc.learning_object_id = :id 
        AND loc.delivery_type_id = (SELECT id FROM delivery_type WHERE code = 'TEXT')
    """, {"id": lo_id})
    
    if content:
        text = f"Title: {content[0]['title']}\n\nContent: {str(content[0]['content_json'])}"
        doc = Document(page_content=text, metadata={"lo_id": lo_id})
        vector_store.add_documents([doc])
        return {"status": "success", "message": f"Ingested content for {lo_id}"}
    
    return {"status": "error", "message": f"No TEXT content found for {lo_id}"}
