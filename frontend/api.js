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
    if (cfg.USE_MOCK) {
      try {
        return await window.mockModerate(text);
      } catch (e) {
        throw new ApiError(e.message, e.code || "mock_error");
      }
    }

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
        (payload && payload.error) || "Сервер вернул ошибку " + res.status + ".",
        (payload && payload.code) || "http_" + res.status
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
    if (cfg.USE_MOCK) return true;
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

  window.Api = { moderate, checkHealth, ApiError };
})();
