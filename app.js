// ================== Состояние ==================
const state = JSON.parse(localStorage.getItem("bioState")) || {
  queueType: "main",
  index: 0,
  mainIndex: 0,
  stats: { correct: 0, wrong: 0 },
  errors: [],
  errorAttempts: {},
  history: {}
};

let questions = [], mainQueue = [], errorQueue = [];
let selected = new Set(), checked = false;

// ================== Элементы UI ==================
const qText = document.getElementById("questionText");
const answersDiv = document.getElementById("answers");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const statsDiv = document.getElementById("stats");

const submitBtn = document.getElementById("submitBtn");
const nextBtn = document.getElementById("nextBtn");
const resetBtn = document.getElementById("resetBtn");

// ================== Кнопка выхода из режима ошибок ==================
const exitErrorsBtn = document.createElement("button");
exitErrorsBtn.innerText = "Выйти из режима ошибок";
exitErrorsBtn.className = "secondary";
exitErrorsBtn.style.marginLeft = "10px";
exitErrorsBtn.style.display = "none";
exitErrorsBtn.onclick = () => {
  state.queueType = "main";
  state.index = state.mainIndex;
  saveState();
  render();
};
document.querySelector(".controls").appendChild(exitErrorsBtn);

// ================== Панель вопросов ==================
const questionPanel = document.getElementById("questionPanel");
const pageNav = document.getElementById("pageNav");
let currentPanelPage = 0;
let currentPanelPageErrors = 0;
questionPanel.style.overflowY = "auto";

// ================== Функция перемешивания ==================
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ================== Загрузка и перемешивание вопросов ==================
// ================== Загрузка и перемешивание вопросов ==================
function loadQuestions() {
  fetch("questions.json")
    .then(r => r.json())
    .then(data => {
      questions = data;

      // Очередь всех вопросов
      mainQueue = questions.map((_, i) => i);

      questions.forEach((q, i) => {
        const h = state.history[i];

        // ===================== ОТВЕЧЕННЫЕ ВОПРОСЫ =====================
        if (h?.checked && h.answers && h.correct) {
          q.answers = [...h.answers];
          q.correct = Array.isArray(h.correct) ? [...h.correct] : [h.correct];
        } 
        // ===================== НЕОТВЕЧЕННЫЕ, НО УЖЕ ПРОСМОТРЕННЫЕ =====================
        else if (h?.answers && h?.correct && !h.checked) {
          // Сохраняем прошлый порядок (статично)
          q.answers = [...h.answers];
          q.correct = Array.isArray(h.correct) ? [...h.correct] : [h.correct];
        } 
        // ===================== НОВЫЕ ВОПРОСЫ =====================
        else {
          const original = q.answers.map((a, idx) => ({ text: a, index: idx }));
          shuffleArray(original);
          q.answers = original.map(a => a.text);

          const newCorrect = Array.isArray(q.correct)
            ? q.correct.map(c => original.findIndex(a => a.index === c))
            : original.findIndex(a => a.index === q.correct);

          q.correct = Array.isArray(newCorrect) ? newCorrect : [newCorrect];

          // Сохраняем в историю, чтобы больше не перемешивать
          if (!state.history[i]) state.history[i] = {};
          state.history[i].answers = [...q.answers];
          state.history[i].correct = Array.isArray(newCorrect) ? [...newCorrect] : [newCorrect];
          // Убираем checked и selected, чтобы вопрос считался новым
          delete state.history[i].checked;
          delete state.history[i].selected;
        }
      });

      // Очередь ошибок чистая
      errorQueue = state.errors || [];

      render();
    })
    .catch(e => {
      console.error(e);
      qText.innerText = "Ошибка загрузки ❌";
    });
}

// ================== Очередь ==================
function currentQueue() {
  return state.queueType === "main" ? mainQueue : errorQueue;
}

function allChecked() {
  return currentQueue().every(qId => state.history[qId]?.checked);
}

// ================== Кнопка ПРЕДЫДУЩИЙ ==================
const prevBtn = document.getElementById("prevBtn");
prevBtn.onclick = () => {
  if (state.index > 0) {
    state.index--;
    render();
  }
};

// ================== Рендер панели вопросов с динамичной пагинацией ==================
function renderQuestionPanel() {
  const queue = currentQueue();
  const questionsPerPage = 50;
  const currentPage = Math.floor(state.index / questionsPerPage);

  if (state.queueType === "main") currentPanelPage = currentPage;
  else currentPanelPageErrors = currentPage;

  const page = state.queueType === "main" ? currentPanelPage : currentPanelPageErrors;
  const start = page * questionsPerPage;
  const end = Math.min(start + questionsPerPage, queue.length);

  // Панель вопросов
  questionPanel.innerHTML = "";
  for (let idx = start; idx < end; idx++) {
  const qId = queue[idx];
  const btn = document.createElement("button");
  btn.innerText = idx + 1;

  // Статус правильного/неправильного
  if (state.history[qId]?.checked) {
    const sel = state.history[qId].selected || [];
    const corr = Array.isArray(questions[qId].correct) ? questions[qId].correct : [questions[qId].correct];
    const ok = corr.every(c => sel.includes(c)) && sel.length === corr.length;

    btn.style.background = ok ? "#4caf50" : "#e53935"; // цвет фона
    btn.style.color = "#fff"; // белый текст
    btn.style.borderColor = btn.style.background; // рамка совпадает
  } else {
    btn.style.background = "#fff"; // ещё не отвечено
    btn.style.color = "#000";
    btn.style.borderColor = "#ccc";
  }

  // Подсветка текущего вопроса
  if (idx === state.index) {
    btn.style.border = "2px solid blue"; // рамка текущего
    btn.style.boxShadow = "0 0 8px rgba(0,0,255,0.7)";
  }

  btn.onclick = () => {
    state.index = idx;
    render();
  };

  questionPanel.appendChild(btn);
}

  // Панель страниц
  pageNav.innerHTML = "";
  const totalPages = Math.ceil(queue.length / questionsPerPage);
  const startPage = Math.max(page - 1, 0);
  const endPage = Math.min(page + 1, totalPages - 1);

  for (let p = startPage; p <= endPage; p++) {
    const navBtn = document.createElement("button");
    navBtn.innerText = p + 1;

    const activePage = state.queueType === "main" ? currentPanelPage : currentPanelPageErrors;
    if (p === activePage) navBtn.classList.add("active");
    else navBtn.classList.remove("active");

    navBtn.onclick = () => {
      if (state.queueType === "main") currentPanelPage = p;
      else currentPanelPageErrors = p;
      state.index = p * questionsPerPage;
      render();
    };

    pageNav.appendChild(navBtn);
  }
}

// ================== Функция подсветки всех ответов ==================
function highlightAnswers(qId) {
  const q = questions[qId];
  const correctIndexes = Array.isArray(q.correct) ? q.correct : [q.correct];
  const answerEls = [...answersDiv.children];

  answerEls.forEach((el, i) => {
    el.classList.remove("correct", "wrong");
    if (correctIndexes.includes(i)) el.classList.add("correct");
    if (state.history[qId]?.selected?.includes(i) && !correctIndexes.includes(i)) el.classList.add("wrong");
  });
}

// ================== Рендер вопроса ==================
function render() {
  const queue = currentQueue();
  exitErrorsBtn.style.display = state.queueType === "errors" ? "inline-block" : "none";

  if (queue.length === 0) {
    qText.innerText = "Вопросов нет 😎";
    answersDiv.innerHTML = "";
    submitBtn.style.display = nextBtn.style.display = "none";
    return;
  }

  if (state.index >= queue.length) {
    showResult();
    return;
  }

  const qId = queue[state.index];
  const q = questions[qId];
  const multi = Array.isArray(q.correct);

  qText.classList.remove("fade");
  answersDiv.classList.remove("fade");
  setTimeout(() => {
    qText.classList.add("fade");
    answersDiv.classList.add("fade");
  }, 10);

  qText.innerText = q.text;
  answersDiv.innerHTML = "";

  submitBtn.style.display = multi ? "inline-block" : "none";
  submitBtn.disabled = false;

  renderQuestionPanel(state.queueType === "main" ? currentPanelPage : currentPanelPageErrors);

  nextBtn.innerText = allChecked() ? "Следующий" : "Следующий (пропустить)";

  checked = !!state.history[qId]?.checked;
  selected = new Set(state.history[qId]?.selected || []);

  q.answers.forEach((text, i) => {
    const el = document.createElement("div");
    el.className = "answer";
    el.innerHTML = `<span>${text}</span><span class="icon"></span>`;
    if (selected.has(i)) el.classList.add("selected");

    el.onclick = () => {
      if (state.queueType === "errors" || checked) return;
      if (!multi) {
        selected.clear();
        selected.add(i);
        checkAnswers();
        render();
      } else {
        if (selected.has(i)) {
          selected.delete(i);
          el.classList.remove("selected");
          el.style.transition = "transform 0.2s ease";
          el.style.transform = "scale(1)";
        } else {
          selected.add(i);
          el.classList.add("selected");
          el.style.transition = "transform 0.2s ease";
          el.style.transform = "scale(1.1)";
          setTimeout(() => {
            if (selected.has(i)) el.style.transform = "scale(1.05)";
          }, 150);
        }
      }
    };

    answersDiv.appendChild(el);
  });

  if (checked || state.queueType === "errors") highlightAnswers(qId);
  submitBtn.disabled = checked;

  updateUI();
}

// ================== Проверка ответа ==================
submitBtn.onclick = () => {
  if (checked) return;
  checkAnswers();
  render();
};

function checkAnswers() {
  const queue = currentQueue();
  const qId = queue[state.index];
  const q = questions[qId];
  const correct = new Set(Array.isArray(q.correct) ? q.correct : [q.correct]);

  checked = true;
  submitBtn.disabled = true;

  state.history[qId] = state.history[qId] || {};
  state.history[qId].selected = [...selected];
  state.history[qId].checked = true;

  const selectedSet = new Set(selected);
  const isCorrect = [...correct].every(c => selectedSet.has(c)) && selectedSet.size === correct.size;

  highlightAnswers(qId);

  if (!isCorrect && !state.errors.includes(qId)) state.errors.push(qId);

  if (!state.history[qId]?.counted && state.queueType !== "errors") {
    if (isCorrect) state.stats.correct++;
    else state.stats.wrong++;
    state.history[qId].counted = true;
  }

  if (state.queueType === "errors") {
    state.errorAttempts[qId] = (state.errorAttempts[qId] || 0) + 1;
  }

  saveState();
  renderQuestionPanel(state.queueType === "main" ? currentPanelPage : currentPanelPageErrors);
}

// ================== Навигация ==================
nextBtn.onclick = () => {
  const queue = currentQueue();
  if (state.index < queue.length - 1) {
    state.index++;
    render();
  } else {
    if (allChecked()) {
      if (state.queueType === "errors") exitErrorsBtn.click();
      else showResult();
    } else {
      const nextUnanswered = queue.findIndex(qId => !state.history[qId]?.checked);
      if (nextUnanswered !== -1) state.index = nextUnanswered;
      render();
    }
  }
};

// ================== Режим ошибок ==================
document.getElementById("errorsBtn").onclick = () => {
  if (!state.errors.length) return alert("Ошибок пока нет 👍");
  if (state.queueType !== "errors") state.mainIndex = state.index;
  state.queueType = "errors";
  state.index = 0;
  saveState();
  render();
};

// ================== Сохранение состояния ==================
function saveState() {
  localStorage.setItem("bioState", JSON.stringify(state));
}

// ================== UI и прогресс ==================
function updateUI() {
  const queue = currentQueue();
  progressText.innerText = `Вопрос ${state.index + 1} из ${queue.length}`;
  progressFill.style.width = `${(state.index / queue.length) * 100}%`;
  statsDiv.innerText = `✔ ${state.stats.correct} ✖ ${state.stats.wrong}`;
}

// ================== Показ результата ==================
function showResult() {
  const total = state.stats.correct + state.stats.wrong;
  const correctPercent = total ? ((state.stats.correct / total) * 100).toFixed(1) : 0;
  const wrongPercent = total ? ((state.stats.wrong / total) * 100).toFixed(1) : 0;

  qText.innerText = "Тест завершён 🎉";
  answersDiv.innerHTML = `
    <div>Правильные: ${state.stats.correct} (${correctPercent}%)</div>
    <div>Неправильные: ${state.stats.wrong} (${wrongPercent}%)</div>
  `;
  submitBtn.style.display = nextBtn.style.display = "none";
  exitErrorsBtn.style.display = "none";
}

// ================== RESET ==================
resetBtn.onclick = () => {
  if (confirm("Вы уверены? Это удалит весь прогресс!")) {
    localStorage.removeItem("bioState");
    state.stats.correct = 0;
    state.stats.wrong = 0;
    state.errors = [];
    state.history = {};
    state.index = 0;
    state.queueType = "main";
    loadQuestions();
  }
};

// ================== Инициализация ==================
loadQuestions();
