// Слой работы с бэкендом. Остальной код интерфейса ходит в сеть только через него.
//
// Контракт:
//   POST /api/moderate   { "text": "..." }
//     200 -> { "category": "normal" | "toxic" | "ad" | "suspicious",
//              "confidence": 0.87,
//              "predicted_label": "toxic",   // необязательно
//              "threshold": 0.6 }            // необязательно
//     4xx/5xx -> { "error": "Понятное сообщение", "code": "machine_code" }
//   GET  /api/health     -> 200, если сервер жив
(function () {
  "use strict";

  const cfg = window.APP_CONFIG;

  class ApiError extends Error {
    constructor(message, code) {
      super(message);
      this.name = "ApiError";
      this.code = code || "unknown";
    }
  }

  async function moderate(text) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.TIMEOUT_MS);
    let res;
    try {
      res = await fetch(cfg.API_URL + "/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text }),
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name === "AbortError") {
        throw new ApiError("Сервер не ответил вовремя. Попробуйте ещё раз.", "timeout");
      }
      throw new ApiError(
        "Не удалось связаться с сервером. Проверьте, что бэкенд запущен, а адрес в config.js указан верно.",
        "network"
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let payload = null;
      try { payload = await res.json(); } catch (_) { /* тело не JSON */ }
      
      throw new ApiError(
        (payload && typeof payload.detail === "string" && payload.detail) ||
          (payload && payload.error) || "Сервер вернул ошибку " + res.status + ".",
        "http_" + res.status
      );
    }

    let data;
    try {
      data = await res.json();
    } catch (_) {
      throw new ApiError("Сервер вернул ответ в неожиданном формате.", "bad_response");
    }
    if (!data || typeof data.category !== "string" || typeof data.confidence !== "number") {
      throw new ApiError("В ответе сервера нет категории или уверенности.", "bad_response");
    }
    return data;
  }

  // true — сервер отвечает. В демо-режиме проверка не нужна.
  async function checkHealth() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(cfg.API_URL + "/health", { signal: controller.signal });
      return res.ok;
    } catch (_) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

// Запрашивает историю проверок у бэкенда.
// Возвращает массив: [{id, text, category, confidence, created_at}, ...]
  async function getHistory() {
    let res;
    try {
      res = await fetch(cfg.API_URL + "/history");
    } catch (_) {
      // сервер выключен или недоступен
      throw new ApiError("Не удалось загрузить историю.", "network");
    }
    if (!res.ok) throw new ApiError("Не удалось загрузить историю.", "http_" + res.status);
    return await res.json();
  }

  window.Api = { moderate, checkHealth, getHistory, ApiError };
  
})();
