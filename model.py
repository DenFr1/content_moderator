import joblib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
model = joblib.load(BASE_DIR / "models" / "model_char.joblib")


def make_prediction(preprocessed_text: str, chosen_model=model) -> tuple[str, str, float, float]:
    """Predicts category and confidence score for preprocessed text."""
    # Pipeline самостоятельно преобразует текст в TF-IDF
    prediction = chosen_model.predict([preprocessed_text])[0]

    # Получаем вероятности классов
    probabilities = model.predict_proba([preprocessed_text])[0]
    confidence = float(max(probabilities))

    # Применяем порог уверенности
    threshold = 0.70

    if confidence < threshold:
        category = "suspicious"
    else:
        category = prediction
    return category, prediction, confidence, threshold
