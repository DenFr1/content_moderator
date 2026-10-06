from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prepocessing import preprocess

app = FastAPI()

# Подключаем CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Welcome to AI moderation system"}


@app.post("/moderate")
def moderate_test(data: dict):
    data["text"] = preprocess(data["text"])
    print(data)
    return {
        "category": "normal",
        "confidence": 0.87
    }



@app.get("/health")
def check_server_status():
    return {"status": "Aok"}
