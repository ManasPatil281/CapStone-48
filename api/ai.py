import json
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field

from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser

from core.config import llm, vector_store
from core.database import fetch_from_db, execute_db

router = APIRouter(prefix="/api/ai", tags=["AI Features"])

# ---------------------------------------------------------
# FEATURE 1: The Weekly AI Summary Generator
# ---------------------------------------------------------
class SummaryOutput(BaseModel):
    ai_summary_text: str = Field(description="A warm, encouraging paragraph summarizing their week.")
    recommended_actions: List[dict] = Field(description="List of dicts with 'action' and 'reason'")

@router.post("/generate-weekly-summary/{user_id}")
async def generate_weekly_summary(user_id: str):
    try:
        user_stats = await fetch_from_db("""
            SELECT score, percentage, is_passed 
            FROM user_assessment_attempt uaa
            WHERE uaa.user_id = :user_id AND uaa.started_at >= NOW() - INTERVAL '7 days'
        """, {"user_id": user_id})
        
        parser = JsonOutputParser(pydantic_object=SummaryOutput)
        
        prompt = PromptTemplate(
            template="Analyze this student's weekly data:\n{stats}\n\nProvide an encouraging summary and 2 actionable next steps.\n{format_instructions}",
            input_variables=["stats"],
            partial_variables={"format_instructions": parser.get_format_instructions()}
        )
        
        chain = prompt | llm | parser
        result = chain.invoke({"stats": str(user_stats)})
        
        await execute_db("""
            INSERT INTO user_ai_summary (user_id, summary_type, ai_summary_text, recommended_actions)
            VALUES (:user_id, 'WEEKLY', :text, :actions)
        """, {
            "user_id": user_id, 
            "text": result["ai_summary_text"], 
            "actions": json.dumps(result["recommended_actions"])
        })
        
        return {"status": "success", "summary": result}
    except Exception as e:
        print(f"❌ ERROR in generate_weekly_summary: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

# ---------------------------------------------------------
# FEATURE 2: Just-in-Time Remediation
# ---------------------------------------------------------
class RemediationRequest(BaseModel):
    wrong_answer: str
    question_text: str
    lo_content_text: str

@router.post("/remediation")
async def generate_remediation(req: RemediationRequest):
    prompt = PromptTemplate.from_template("""
    The student was asked: "{question}"
    They answered: "{answer}" which is incorrect.
    Based on this lesson material: "{content}"
    Explain why they are wrong using a simple analogy. Keep it under 3 sentences.
    """)
    
    chain = prompt | llm | StrOutputParser()
    explanation = chain.invoke({
        "question": req.question_text,
        "answer": req.wrong_answer,
        "content": req.lo_content_text
    })
    
    return {"remediation": explanation}

# ---------------------------------------------------------
# FEATURE 4: Semantic Search & Chatbot (RAG)
# ---------------------------------------------------------
class ChatQuery(BaseModel):
    question: str

@router.post("/chat")
async def rag_chatbot(query: ChatQuery):
    docs = vector_store.similarity_search(query.question, k=2)
    context = "\n".join([doc.page_content for doc in docs])
    
    prompt = PromptTemplate.from_template("""
    You are an AI Tutor. Answer the user's question using ONLY the context provided.
    Context: {context}
    Question: {question}
    """)
    
    chain = prompt | llm | StrOutputParser()
    answer = chain.invoke({"context": context, "question": query.question})
    
    return {"answer": answer, "sources": [doc.metadata for doc in docs]}

# ---------------------------------------------------------
# FEATURE 5: The Adaptive Routing Agent
# ---------------------------------------------------------
@router.post("/route/{user_id}")
async def adaptive_router(user_id: str, current_lo_id: str):
    next_options = await fetch_from_db("SELECT prerequisite_lo_id FROM learning_object_prerequisite WHERE learning_object_id = :id", {"id": current_lo_id})
    prefs = await fetch_from_db("SELECT delivery_type_id, preference_score FROM user_delivery_preference WHERE user_id = :uid", {"uid": user_id})
    
    prompt = PromptTemplate.from_template("""
    Based on the student's preferences: {prefs}
    And the available next concepts: {options}
    Which concept and delivery format should they see next to maximize engagement?
    Reply with a JSON containing 'recommended_lo_id' and 'recommended_delivery_type'.
    """)
    
    chain = prompt | llm | JsonOutputParser()
    try:
        recommendation = chain.invoke({"prefs": str(prefs), "options": str(next_options)})
    except Exception as e:
        recommendation = {"error": str(e)}
    
    return recommendation

# ---------------------------------------------------------
# FEATURE 6: Socratic Assessor (Subjective Grading)
# ---------------------------------------------------------
class SocraticAnswer(BaseModel):
    concept_name: str
    user_explanation: str

class SocraticGrade(BaseModel):
    score: int = Field(description="Score from 0 to 100")
    feedback: str = Field(description="What they missed or got right")
    is_mastered: bool = Field(description="True if score > 80")

@router.post("/socratic-grade")
async def socratic_grade(req: SocraticAnswer):
    parser = JsonOutputParser(pydantic_object=SocraticGrade)
    
    prompt = PromptTemplate(
        template="Grade this student's explanation of '{concept}'. \nStudent: '{explanation}'\n{format_instructions}",
        input_variables=["concept", "explanation"],
        partial_variables={"format_instructions": parser.get_format_instructions()}
    )
    
    chain = prompt | llm | parser
    grade = chain.invoke({"concept": req.concept_name, "explanation": req.user_explanation})
    
    return grade

# ---------------------------------------------------------
# FEATURE 7: Struggle Detection (Early Warning)
# ---------------------------------------------------------
@router.post("/struggle-detection/{user_id}/{lo_id}")
async def check_struggle(user_id: str, lo_id: str):
    activity = await fetch_from_db("SELECT time_spent_seconds, interactions_count FROM user_lo_activity WHERE user_id = :uid AND learning_object_id = :lo", {"uid": user_id, "lo": lo_id})
    
    time_spent = 650 
    if activity and 'time_spent_seconds' in activity[0]:
        time_spent = activity[0]['time_spent_seconds']
        
    if time_spent > 600:
        prompt = PromptTemplate.from_template("A student has spent 10 minutes stuck on {topic}. Generate a short, friendly 1-sentence message offering help.")
        chain = prompt | llm | StrOutputParser()
        msg = chain.invoke({"topic": "the current topic"})
        return {"struggling": True, "intervention_message": msg}
        
    return {"struggling": False}

# ---------------------------------------------------------
# FEATURE 8: Dynamic Spaced Repetition (AI Flashcards)
# ---------------------------------------------------------
@router.get("/flashcard/{user_id}")
async def generate_flashcard(user_id: str):
    old_lo = await fetch_from_db("SELECT title, description FROM learning_object lo JOIN user_learning_progress ulp ON lo.id = ulp.learning_object_id WHERE ulp.status = 'MASTERED' AND ulp.completed_at < NOW() - INTERVAL '7 days' LIMIT 1")
    topic = old_lo[0].get('title', 'Advanced Database Normalization') if old_lo else 'Advanced Database Normalization'
    
    prompt = PromptTemplate.from_template("Generate a quick, difficult 1-sentence trivia question to test the user's recall of this topic: {title}. Do not provide the answer.")
    chain = prompt | llm | StrOutputParser()
    question = chain.invoke({"title": topic})
    
    return {"flashcard_question": question, "topic": topic}

# ---------------------------------------------------------
# FEATURE 9: AI Ghost Learner (Social Proof)
# ---------------------------------------------------------
@router.get("/ghost-learner/{lo_id}")
async def ghost_learner_insights(lo_id: str):
    wrong_answers = await fetch_from_db("SELECT answer_text FROM user_question_response WHERE is_correct = false LIMIT 50")
    
    prompt = PromptTemplate.from_template("""
    Here are wrong answers submitted by students for this concept: {answers}
    Summarize the #1 most common misconception in one sentence, starting with 'Most students get stuck on...'
    """)
    chain = prompt | llm | StrOutputParser()
    insight = chain.invoke({"answers": str(wrong_answers)})
    
    return {"social_insight": insight}
