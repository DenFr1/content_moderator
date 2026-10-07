from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from preprocessing import preprocess
from database import init_db, save_moderation, get_history

app = FastAPI()

init_db()


# Подключаем CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ModerationRequest(BaseModel):
    text: str


@app.get("/")
def home():
    return {"message": "Welcome to AI moderation system"}


@app.post("/moderate")
def moderate(data: ModerationRequest):
    """Preprocesses text, saves the moderation result, and returns it."""
    preprocessed_text = preprocess(data.text)
    save_moderation(preprocessed_text, "normal", 0.87)
    return {
        "category": "normal",
        "confidence": 0.87
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
