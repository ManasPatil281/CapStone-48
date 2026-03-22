import uvicorn
from fastapi import FastAPI
from dotenv import load_dotenv

from api.ai import router as ai_router
from api.admin import router as admin_router

load_dotenv()

app = FastAPI(title="Adaptive Learning AI Engine", version="1.0.0")

# Register modular routers
app.include_router(ai_router)
app.include_router(admin_router)

# Healthcheck 
@app.get("/")
def read_root():
    return {"message": "Welcome to the Adaptive Learning AI Engine API!"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
