// Логика интерфейса: ввод, состояния, отрисовка результата, история.
(function () {
  "use strict";

  const cfg = window.APP_CONFIG;

  // Чтобы добавить категорию, достаточно добавить сюда одну запись
  // и цвет .cat-<cls> в style.css.
  const CATEGORIES = {
    normal:     { label: "Нормальный контент",     cls: "normal",     note: "Сообщение можно публиковать." },
    toxic:      { label: "Токсичный контент",      cls: "toxic",      note: "В сообщении есть оскорбления или агрессия." },
    ad:         { label: "Рекламный контент",      cls: "ad",         note: "Сообщение похоже на рекламу или спам." },
    suspicious: { label: "Подозрительный контент", cls: "suspicious", note: "Модель не уверена в результате. Проверьте сообщение вручную." },
  };

  const $ = (id) => document.getElementById(id);
  const input = $("text");
  const counter = $("counter");
  const submit = $("submit");
  const result = $("result");
  const historyList = $("history-list");
  const clearBtn = $("clear-history");
  const dot = $("status-dot");
  const statusText = $("status-text");

  let busy = false;
  let lastText = "";

  input.maxLength = cfg.MAX_LENGTH;

  // ---------- Вспомогательные функции ----------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // textContent, а не innerHTML — защита от XSS
    return node;
  }
  const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);
  const info = (cat) =>
    CATEGORIES[cat] || { label: "Неизвестная категория: " + cat, cls: "unknown", note: "" };
  const formatTime = (ts) =>
    new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  // ---------- Форма ----------
  function updateForm() {
    counter.textContent = input.value.length + " / " + cfg.MAX_LENGTH;
    submit.disabled = busy || input.value.trim().length === 0;
    submit.textContent = busy ? "Проверяем…" : "Проверить";
  }

  // ---------- Состояния блока результата ----------
  function showIdle() {
    result.className = "panel result";
    result.replaceChildren(
      el("h2", "", "Результат"),
      el("p", "muted", "Введите сообщение слева и нажмите «Проверить».")
    );
  }

  function showLoading() {
    result.className = "panel result";
    result.replaceChildren(el("h2", "", "Результат"), el("p", "", "Проверяем сообщение…"), el("div", "pulse"));
  }

  function showError(err) {
    result.className = "panel result";
    const retry = el("button", "btn secondary", "Повторить");
    retry.type = "button";
    retry.addEventListener("click", () => run(lastText));
    const box = el("div");
    box.append(
      el("p", "error-title", "Не удалось проверить сообщение"),
      el("p", "error-text", err && err.message ? err.message : "Неизвестная ошибка."),
      retry
    );
    if (err && err.code) box.append(el("p", "muted error-code", "Код ошибки: " + err.code));
    result.replaceChildren(box);
  }

  function showResult(data) {
    const meta = info(data.category);
    const threshold = typeof data.threshold === "number" ? data.threshold : cfg.CONFIDENCE_THRESHOLD;
    result.className = "panel result cat-" + meta.cls;

    const fill = el("div", "meter-fill");
    const mark = el("div", "meter-mark");
    mark.style.left = pct(threshold) + "%";
    mark.append(el("span", "", "порог " + pct(threshold) + "%"));
    const meter = el("div", "meter");
    meter.append(fill, mark);

    const stats = el("div", "meter-stats");
    const value = el("strong", "", pct(data.confidence) + "%");
    stats.append(el("span", "", "Уверенность модели"), value);

    const nodes = [el("h2", "", "Результат"), el("p", "verdict", meta.label)];
    if (meta.note) nodes.push(el("p", "note", meta.note));

    if (data.category === "suspicious" && data.predicted_label && CATEGORIES[data.predicted_label]) {
      nodes.push(
        el("p", "muted", "Ближе всего к категории «" + CATEGORIES[data.predicted_label].label +
          "», но уверенность ниже порога.")
      );
    }
    nodes.push(meter, stats);
    result.replaceChildren(...nodes);

    // Плавное заполнение шкалы после вставки в DOM
    requestAnimationFrame(() => { fill.style.width = pct(data.confidence) + "%"; });
  }

  // ---------- История (localStorage) ----------
  const HISTORY_KEY = "moderation_history_v1";

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }
  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (_) { /* хранилище недоступно */ }
  }

  function addHistory(text, data) {
    const list = loadHistory();
    list.unshift({ text: text, category: data.category, confidence: data.confidence, at: Date.now() });
    saveHistory(list.slice(0, cfg.HISTORY_LIMIT));
    renderHistory();
  }

  function renderHistory() {
    const list = loadHistory();
    clearBtn.hidden = list.length === 0;
    if (list.length === 0) {
      historyList.replaceChildren(el("li", "empty", "Проверенные сообщения появятся здесь."));
      return;
    }
    const items = list.map((item, i) => {
      const meta = info(item.category);
      const li = el("li");
      const btn = el("button", "h-item cat-" + meta.cls);
      btn.type = "button";
      btn.dataset.index = String(i);
      btn.append(
        el("span", "tag", meta.label),
        el("span", "h-text", item.text),
        el("span", "h-meta", pct(item.confidence) + "%, " + formatTime(item.at))
      );
      li.append(btn);
      return li;
    });
    historyList.replaceChildren(...items);
  }

  // ---------- Проверка ----------
  async function run(text) {
    const clean = (text || "").trim();
    if (busy || !clean) return;
    busy = true;
    lastText = clean;
    updateForm();
    showLoading();
    try {
      const data = await window.Api.moderate(clean);
      showResult(data);
      addHistory(clean, data);
    } catch (err) {
      showError(err);
    } finally {
      busy = false;
      updateForm();
    }
  }

  // ---------- Статус сервера ----------
  async function refreshStatus() {
    if (cfg.USE_MOCK) {
      dot.className = "dot demo";
      statusText.textContent = "Демо-режим: ответы генерирует заглушка";
      return;
    }
    const ok = await window.Api.checkHealth();
    dot.className = "dot " + (ok ? "ok" : "down");
    statusText.textContent = ok ? "Сервер доступен" : "Сервер недоступен";
  }

  // ---------- События ----------
  input.addEventListener("input", updateForm);
  input.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      run(input.value);
    }
  });
  submit.addEventListener("click", () => run(input.value));

  document.querySelectorAll(".examples [data-text]").forEach((btn) => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.text;
      updateForm();
      input.focus();
    });
  });

  historyList.addEventListener("click", (e) => {
    const btn = e.target.closest(".h-item");
    if (!btn) return;
    const item = loadHistory()[Number(btn.dataset.index)];
    if (!item) return;
    input.value = item.text;
    updateForm();
    showResult({ category: item.category, confidence: item.confidence });
  });

  clearBtn.addEventListener("click", () => {
    saveHistory([]);
    renderHistory();
  });

  // ---------- Старт ----------
  updateForm();
  showIdle();
  renderHistory();
  refreshStatus();
})();
