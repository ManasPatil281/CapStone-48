import os
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_postgres.vectorstores import PGVector
from dotenv import load_dotenv

load_dotenv()

# Ensure API keys exist
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "your-groq-api-key")
HF_TOKEN = os.getenv("HF_TOKEN", "your-hf-token")
CONNECTION_STRING = os.getenv("SUPABASE_DB_URL", "postgresql://postgres:password@localhost:5432/postgres")

# Groq LLM
llm = ChatGroq(
    groq_api_key=GROQ_API_KEY,
    model_name="openai/gpt-oss-120b", 
    temperature=0.3
)

# HuggingFace Embeddings
embeddings = HuggingFaceEndpointEmbeddings(
    model="sentence-transformers/all-MiniLM-L6-v2",
    huggingfacehub_api_token=HF_TOKEN
)

# PGVector Store Setup
vector_store = PGVector(
    embeddings=embeddings,
    collection_name="learning_object_embeddings",
    connection=CONNECTION_STRING,
    use_jsonb=True,
)
