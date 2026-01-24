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
function loadQuestions() {
  fetch("questions.json")
    .then(r => r.json())
    .then(data => {
      questions = data;

      mainQueue = Array.from({ length: questions.length }, (_, i) => i);
      shuffleArray(mainQueue);

      mainQueue.forEach(qId => {
        const q = questions[qId];
        const originalAnswers = q.answers.map((a, i) => ({ text: a, index: i }));
        shuffleArray(originalAnswers);
        q.answers = originalAnswers.map(a => a.text);

        if (Array.isArray(q.correct)) {
          q.correct = q.correct.map(c => originalAnswers.findIndex(a => a.index === c));
        } else {
          q.correct = originalAnswers.findIndex(a => a.index === q.correct);
        }
      });

      errorQueue = state.errors || [];
      render();
    })
    .catch(err => {
      console.error(err);
      qText.innerText = "Не удалось загрузить вопросы ❌";
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

// ================== Рендер панели вопросов ==================
function renderQuestionPanel(page = 0) {
  const queue = currentQueue();
  const questionsPerPage = 50;
  const start = page * questionsPerPage;
  const end = Math.min(start + questionsPerPage, queue.length);

  questionPanel.innerHTML = "";

  for (let idx = start; idx < end; idx++) {
    const qId = queue[idx];
    const btn = document.createElement("button");
    btn.innerText = idx + 1;

    if (state.history[qId]?.checked) {
      const sel = state.history[qId].selected || [];
      const corr = Array.isArray(questions[qId].correct) ? questions[qId].correct : [questions[qId].correct];
      const ok = corr.every(c => sel.includes(c)) && sel.length === corr.length;
      btn.style.background = ok ? "green" : "red";
      btn.style.color = "#fff";
    } else {
      btn.style.background = "#eee";
      btn.style.color = "#000";
    }

    btn.onclick = () => {
      state.index = idx;
      render();
    };

    questionPanel.appendChild(btn);
  }

  pageNav.innerHTML = "";
  const totalPages = Math.ceil(queue.length / questionsPerPage);
  for (let p = 0; p < totalPages; p++) {
    const navBtn = document.createElement("button");
    navBtn.innerText = p + 1;
    const activePage = state.queueType === "main" ? currentPanelPage : currentPanelPageErrors;
    navBtn.className = p === activePage ? "active" : "";
    navBtn.onclick = () => {
      if (state.queueType === "main") currentPanelPage = p;
      else currentPanelPageErrors = p;
      renderQuestionPanel(p);
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

    // Зеленый для правильного ответа
    if (correctIndexes.includes(i)) el.classList.add("correct");

    // Красный для выбранного неправильного
    if (state.history[qId]?.selected?.includes(i) && !correctIndexes.includes(i)) {
      el.classList.add("wrong");
    }
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
  const multi = Array.isArray(q.correct) ? q.correct.length > 1 : false;

  qText.innerText = q.text;
  answersDiv.innerHTML = "";

  // Показываем кнопку submit только для множественного выбора
   submitBtn.style.display = multi ? "inline-block" : "none";
  submitBtn.disabled = false;

  renderQuestionPanel(state.queueType === "main" ? currentPanelPage : currentPanelPageErrors);

  nextBtn.innerText = allChecked() ? "Следующий" : "Следующий (пропустить)";

  checked = !!state.history[qId]?.checked;
  selected = new Set(state.history[qId]?.selected || []);

  // ======= Создаем варианты ответа =======
q.answers.forEach((text, i) => {
  const el = document.createElement("div");
  el.className = "answer";
  el.innerHTML = `<span>${text}</span><span class="icon"></span>`;

  // Убираем серый фон при наведении/отведении
  // el.onmouseover и el.onmouseout больше не нужны

  if (selected.has(i)) el.classList.add("selected");

  el.onclick = () => {
    // Блокировка после ответа
    if (state.queueType === "errors" || checked) return;

    if (!multi) {
      // одиночный выбор — сразу проверяем и блокируем
      selected.clear();
      selected.add(i);
      checkAnswers();
      render();
    } else {
      // множественный выбор — можно выбрать/снять до нажатия submit
      selected.has(i) ? selected.delete(i) : selected.add(i);
      el.classList.toggle("selected");
    }
  };

  answersDiv.appendChild(el);
});

  // Подсветка сразу, если в режиме ошибок или вопрос уже проверен
  if (checked || state.queueType === "errors") highlightAnswers(qId);

  // Блокируем клик на submit, если уже проверено
  submitBtn.disabled = checked;

  updateUI();
}
// ================== Проверка ответа (для кнопки submit и режима ошибок) ==================
submitBtn.onclick = () => {
  if (checked) return; // блокировка повторного нажатия
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

  // Проверка полного совпадения выбранных с правильными
  const selectedSet = new Set(selected);
  const isCorrect = [...correct].every(c => selectedSet.has(c)) && selectedSet.size === correct.size;

  // Подсветка ответов сразу
  highlightAnswers(qId);

  // Добавляем в ошибки только если есть неверные или пропущенные правильные
  if (!isCorrect) {
    if (!state.errors.includes(qId)) state.errors.push(qId);
  }

  // Подсчет очков только в основном режиме
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

// ================== Работа над ошибками ==================
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
