from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from preprocessing import preprocess
from database import init_db, save_moderation, get_history
from model import make_prediction


app = FastAPI()

init_db()

# Путь к корню проекта
BASE_DIR = Path(__file__).resolve().parent

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")


class ModerationRequest(BaseModel):
    text: str = Field(..., max_length=1000)


@app.get("/")
def read_root():
    return FileResponse(BASE_DIR / "frontend" / "index.html")


@app.post("/moderate")
def moderate(data: ModerationRequest):
    """Preprocesses text, saves the moderation result, and returns it."""
    preprocessed_text = preprocess(data.text)

    if preprocessed_text is None:
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty"
        )

    category, prediction, confidence, threshold = make_prediction(preprocessed_text)

    save_moderation(preprocessed_text, category, confidence)

    return {
        "category": category,
        "predicted_label": prediction,
        "confidence": confidence,
        "threshold": threshold
    }


@app.get("/health")
def check_server_status():
    return {"status": "ok"}


@app.get("/history")
def get_moderation_history():
    """Returns the moderation history."""
    result = get_history()

    history = []

    for row in result:
        item = {
            "id": row[0],
            "text": row[1],
            "category": row[2],
            "confidence": row[3],
            "created_at": row[4]
        }
        history.append(item)

    return history
