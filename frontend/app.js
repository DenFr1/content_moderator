// Логика интерфейса: ввод сообщения, отображение результата и история проверок.
(function () {
  "use strict";

  const config = window.APP_CONFIG;
  const api = window.Api;

  // В localStorage хранится только id последней записи, скрытой кнопкой «Очистить историю».
  // Сами записи остаются в базе данных.
  const HIDDEN_UP_TO_ID_KEY = "moderation.history.hiddenUpToId";

  const CATEGORY_META = {
    normal:     { label: "Нормальный контент",     cssClass: "normal",     note: "Сообщение можно публиковать." },
    toxic:      { label: "Токсичный контент",      cssClass: "toxic",      note: "В сообщении есть оскорбления или агрессия." },
    ad:         { label: "Рекламный контент",      cssClass: "ad",         note: "Сообщение похоже на рекламу или спам." },
    suspicious: { label: "Подозрительный контент", cssClass: "suspicious", note: "Модель не уверена в результате. Проверьте сообщение вручную." },
  };

  // ---------- Элементы страницы ----------
  const byId = (id) => document.getElementById(id);

  const messageInput = byId("text");
  const charCounter = byId("counter");
  const submitButton = byId("submit");
  const resultPanel = byId("result");
  const historyList = byId("history-list");
  const clearHistoryButton = byId("clear-history");
  const statusDot = byId("status-dot");
  const statusLabel = byId("status-text");

  // ---------- Состояние ----------
  let isSubmitting = false;
  let lastSubmittedText = "";
  let visibleHistory = [];
  let latestRecordId = 0;

  // ---------- Вспомогательные функции ----------
  function createNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // textContent, а не innerHTML: защита от XSS
    return node;
  }

  function toPercent(value) {
    return Math.round(Math.max(0, Math.min(1, value)) * 100);
  }

  function getCategoryMeta(category) {
    return (
      CATEGORY_META[category] || {
        label: "Неизвестная категория: " + category,
        cssClass: "unknown",
        note: "",
      }
    );
  }

  // ---------- Форма ----------
  function syncFormState() {
    charCounter.textContent = messageInput.value.length + " / " + config.MAX_LENGTH;
    submitButton.disabled = isSubmitting || messageInput.value.trim().length === 0;
    submitButton.textContent = isSubmitting ? "Проверяем…" : "Проверить";
  }

  // ---------- Панель результата ----------
  function renderIdle() {
    resultPanel.className = "panel result";
    resultPanel.replaceChildren(
      createNode("h2", "", "Результат"),
      createNode("p", "muted", "Введите сообщение слева и нажмите «Проверить».")
    );
  }

  function renderLoading() {
    resultPanel.className = "panel result";
    resultPanel.replaceChildren(
      createNode("h2", "", "Результат"),
      createNode("p", "", "Проверяем сообщение…"),
      createNode("div", "pulse")
    );
  }

  function renderError(error) {
    resultPanel.className = "panel result";

    const retryButton = createNode("button", "btn secondary", "Повторить");
    retryButton.type = "button";
    retryButton.addEventListener("click", () => submitMessage(lastSubmittedText));

    const container = createNode("div");
    container.append(
      createNode("p", "error-title", "Не удалось проверить сообщение"),
      createNode("p", "error-text", error && error.message ? error.message : "Неизвестная ошибка."),
      retryButton
    );
    if (error && error.code) {
      container.append(createNode("p", "muted error-code", "Код ошибки: " + error.code));
    }
    resultPanel.replaceChildren(container);
  }

  function renderResult(data) {
    const meta = getCategoryMeta(data.category);
    const threshold = typeof data.threshold === "number" ? data.threshold : config.CONFIDENCE_THRESHOLD;
    resultPanel.className = "panel result cat-" + meta.cssClass;

    const meterFill = createNode("div", "meter-fill");
    const thresholdMark = createNode("div", "meter-mark");
    thresholdMark.style.left = toPercent(threshold) + "%";
    thresholdMark.append(createNode("span", "", "порог " + toPercent(threshold) + "%"));

    const meter = createNode("div", "meter");
    meter.append(meterFill, thresholdMark);

    const stats = createNode("div", "meter-stats");
    stats.append(
      createNode("span", "", "Уверенность модели"),
      createNode("strong", "", toPercent(data.confidence) + "%")
    );

    const nodes = [createNode("h2", "", "Результат"), createNode("p", "verdict", meta.label)];
    if (meta.note) nodes.push(createNode("p", "note", meta.note));

    const predicted = CATEGORY_META[data.predicted_label];
    if (data.category === "suspicious" && predicted) {
      nodes.push(
        createNode(
          "p",
          "muted",
          "Ближе всего к категории «" + predicted.label + "», но уверенность ниже порога."
        )
      );
    }

    nodes.push(meter, stats);
    resultPanel.replaceChildren(...nodes);

    // Ширина задаётся после вставки в DOM, чтобы сработала анимация шкалы
    requestAnimationFrame(() => {
      meterFill.style.width = toPercent(data.confidence) + "%";
    });
  }

  // ---------- История проверок ----------
  function readHiddenUpToId() {
    try {
      return Number(localStorage.getItem(HIDDEN_UP_TO_ID_KEY)) || 0;
    } catch (_) {
      return 0; // localStorage может быть недоступен (например, в приватном режиме)
    }
  }

  function writeHiddenUpToId(recordId) {
    try {
      localStorage.setItem(HIDDEN_UP_TO_ID_KEY, String(recordId));
    } catch (_) {
      // Без хранилища история просто вернётся после перезагрузки страницы
    }
  }

  function renderHistoryMessage(text) {
    historyList.replaceChildren(createNode("li", "empty", text));
  }

  function renderHistory() {
    clearHistoryButton.hidden = visibleHistory.length === 0;

    if (visibleHistory.length === 0) {
      renderHistoryMessage("Проверенные сообщения появятся здесь.");
      return;
    }

    const rows = visibleHistory.map((record, index) => {
      const meta = getCategoryMeta(record.category);

      const rowButton = createNode("button", "h-item cat-" + meta.cssClass);
      rowButton.type = "button";
      rowButton.dataset.index = String(index);
      rowButton.append(
        createNode("span", "tag", meta.label),
        createNode("span", "h-text", record.text),
        createNode("span", "h-meta", toPercent(record.confidence) + "%, " + record.created_at)
      );

      const row = createNode("li");
      row.append(rowButton);
      return row;
    });

    historyList.replaceChildren(...rows);
  }

  // Загружает историю с сервера и обновляет список на странице.
  async function refreshHistory() {
    let records;
    try {
      records = await api.getHistory();
    } catch (_) {
      clearHistoryButton.hidden = true;
      renderHistoryMessage("Не удалось загрузить историю с сервера.");
      return;
    }

    latestRecordId = records.reduce((maxId, record) => Math.max(maxId, record.id), 0);
    const hiddenUpToId = readHiddenUpToId();

    visibleHistory = records
      .filter((record) => record.id > hiddenUpToId)
      .sort((a, b) => b.id - a.id) // новые записи сверху
      .slice(0, config.HISTORY_LIMIT);

    renderHistory();
  }

  // Скрывает записи только в интерфейсе. В базе данных они остаются.
  function clearHistoryView() {
    writeHiddenUpToId(latestRecordId);
    visibleHistory = [];
    renderHistory();
  }

  function openHistoryRecord(index) {
    const record = visibleHistory[index];
    if (!record) return;

    messageInput.value = record.text;
    syncFormState();
    renderResult({ category: record.category, confidence: record.confidence });
  }

  // ---------- Проверка сообщения ----------
  async function submitMessage(text) {
    const message = (text || "").trim();
    if (isSubmitting || !message) return;

    isSubmitting = true;
    lastSubmittedText = message;
    syncFormState();
    renderLoading();

    try {
      const data = await api.moderate(message);
      renderResult(data);
      refreshHistory();
    } catch (error) {
      renderError(error);
    } finally {
      isSubmitting = false;
      syncFormState();
    }
  }

  // ---------- Статус сервера ----------
  async function refreshServerStatus() {
    const isAvailable = await api.checkHealth();
    statusDot.className = "dot " + (isAvailable ? "ok" : "down");
    statusLabel.textContent = isAvailable ? "Сервер доступен" : "Сервер недоступен";
  }

  // ---------- Обработчики событий ----------
  function bindEvents() {
    messageInput.addEventListener("input", syncFormState);

    messageInput.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        submitMessage(messageInput.value);
      }
    });

    submitButton.addEventListener("click", () => submitMessage(messageInput.value));

    document.querySelectorAll(".examples [data-text]").forEach((exampleButton) => {
      exampleButton.addEventListener("click", () => {
        messageInput.value = exampleButton.dataset.text;
        syncFormState();
        messageInput.focus();
      });
    });

    historyList.addEventListener("click", (event) => {
      const rowButton = event.target.closest(".h-item");
      if (rowButton) openHistoryRecord(Number(rowButton.dataset.index));
    });

    clearHistoryButton.addEventListener("click", clearHistoryView);
  }

  // ---------- Запуск ----------
  function init() {
    messageInput.maxLength = config.MAX_LENGTH;
    bindEvents();
    syncFormState();
    renderIdle();
    refreshHistory();
    refreshServerStatus();
  }

  init();
})();