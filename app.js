// ================== STATE ==================
const state = JSON.parse(localStorage.getItem("bioState")) || {
  queueType: "main",       // main / errors
  index: 0,                // текущий вопрос
  mainIndex: 0,            // для возврата из режима ошибок
  stats: { correct: 0, wrong: 0 },
  errors: [],              // массив ID вопросов с ошибками
  errorAttempts: {},       // счетчик попыток для ошибок
  history: {}              // история выбранных ответов
};

let questions = [], mainQueue = [], errorQueue = [];
let selected = new Set();
let checked = false;

// ================== UI ELEMENTS ==================
const qText = document.getElementById("questionText");
const answersDiv = document.getElementById("answers");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const statsDiv = document.getElementById("stats");

const submitBtn = document.getElementById("submitBtn");
const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");
const resetBtn = document.getElementById("resetBtn");

// Кнопка выхода из режима ошибок
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

// Панель вопросов и навигация
const questionPanel = document.getElementById("questionPanel");
const pageNav = document.getElementById("pageNav");
questionPanel.style.overflowY = "auto";
let currentPanelPage = 0;
let currentPanelPageErrors = 0;

// ================== HELPERS ==================
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// "Умное" перемешивание вопросов
function smartShuffle(arr, history, queueType) {
  if (queueType === "errors") return arr; // статично

  const answered = [];
  const unanswered = [];

  arr.forEach((qId, idx) => {
    if (history[qId]?.checked) {
      answered.push({ qId, idx });
    } else {
      unanswered.push(qId);
    }
  });

  // Перемешиваем только неотвеченные
  for (let i = unanswered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unanswered[i], unanswered[j]] = [unanswered[j], unanswered[i]];
  }

  // Вставляем отвеченные на их позиции
  const finalArr = [];
  let uIdx = 0;
  for (let i = 0; i < arr.length; i++) {
    const fixed = answered.find(a => a.idx === i);
    if (fixed) finalArr.push(fixed.qId);
    else finalArr.push(unanswered[uIdx++]);
  }

  return finalArr;
}

function currentQueue() {
  return state.queueType === "main" ? mainQueue : errorQueue;
}

function allChecked() {
  return currentQueue().every(qId => state.history[qId]?.checked);
}

function saveState() {
  localStorage.setItem("bioState", JSON.stringify(state));
}

// ================== LOAD QUESTIONS ==================
function loadQuestions() {
  fetch("questions.json")
    .then(r => r.json())
    .then(data => {
      questions = data;

      // Создаем очередь индексов
      mainQueue = Array.from({ length: questions.length }, (_, i) => i);

      // Применяем умное перемешивание
      mainQueue = smartShuffle(mainQueue, state.history, state.queueType);

      // Перемешиваем ответы внутри вопросов
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

// ================== RENDER ==================
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

  checked = !!state.history[qId]?.checked;
  selected = new Set(state.history[qId]?.selected || []);

  qText.innerText = q.text;
  answersDiv.innerHTML = "";

  submitBtn.style.display = multi ? "inline-block" : "none";
  submitBtn.disabled = checked;

  // Отображение ответов
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
        if (selected.has(i)) selected.delete(i);
        else selected.add(i);
        render();
      }
    };

    answersDiv.appendChild(el);
  });

  if (checked || state.queueType === "errors") highlightAnswers(qId);

  renderQuestionPanel();
  updateUI();
}

// Подсветка правильных/неправильных
function highlightAnswers(qId) {
  const q = questions[qId];
  const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
  [...answersDiv.children].forEach((el, i) => {
    el.classList.remove("correct", "wrong");
    if (correct.includes(i)) el.classList.add("correct");
    if (state.history[qId]?.selected?.includes(i) && !correct.includes(i)) el.classList.add("wrong");
  });
}

// ================== CHECK ANSWERS ==================
function checkAnswers() {
  const queue = currentQueue();
  const qId = queue[state.index];
  const q = questions[qId];
  const correctSet = new Set(Array.isArray(q.correct) ? q.correct : [q.correct]);
  const selectedSet = new Set(selected);

  checked = true;
  submitBtn.disabled = true;

  state.history[qId] = state.history[qId] || {};
  state.history[qId].selected = [...selected];
  state.history[qId].checked = true;

  const isCorrect = [...correctSet].every(c => selectedSet.has(c)) && selectedSet.size === correctSet.size;

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
  renderQuestionPanel();
}

// ================== QUESTION PANEL ==================
function renderQuestionPanel() {
  const queue = currentQueue();
  const perPage = 50;
  const currentPage = Math.floor(state.index / perPage);

  if (state.queueType === "main") currentPanelPage = currentPage;
  else currentPanelPageErrors = currentPage;

  const page = state.queueType === "main" ? currentPanelPage : currentPanelPageErrors;
  const start = page * perPage;
  const end = Math.min(start + perPage, queue.length);

  questionPanel.innerHTML = "";
  for (let idx = start; idx < end; idx++) {
    const qId = queue[idx];
    const btn = document.createElement("button");
    btn.innerText = idx + 1;

    if (state.history[qId]?.checked) {
      const sel = state.history[qId].selected || [];
      const corr = Array.isArray(questions[qId].correct) ? questions[qId].correct : [questions[qId].correct];
      const ok = corr.every(c => sel.includes(c)) && sel.length === corr.length;
      btn.style.background = ok ? "#4caf50" : "#e53935";
      btn.style.color = "#fff";
      btn.style.borderColor = btn.style.background;
    } else {
      btn.style.background = "#fff";
      btn.style.color = "#000";
      btn.style.borderColor = "#ccc";
    }

    if (idx === state.index) {
      btn.style.border = "2px solid blue";
      btn.style.boxShadow = "0 0 8px rgba(0,0,255,0.7)";
    }

    btn.onclick = () => {
      state.index = idx;
      render();
    };

    questionPanel.appendChild(btn);
  }

  // Навигация страниц
  pageNav.innerHTML = "";
  const totalPages = Math.ceil(queue.length / perPage);
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
      state.index = p * perPage;
      render();
    };

    pageNav.appendChild(navBtn);
  }
}

// ================== NAVIGATION ==================
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

prevBtn.onclick = () => {
  if (state.index > 0) {
    state.index--;
    render();
  }
};

// Режим ошибок
document.getElementById("errorsBtn").onclick = () => {
  if (!state.errors.length) return alert("Ошибок пока нет 👍");
  if (state.queueType !== "errors") state.mainIndex = state.index;
  state.queueType = "errors";
  state.index = 0;
  saveState();
  render();
};

// ================== UI & PROGRESS ==================
function updateUI() {
  const queue = currentQueue();
  progressText.innerText = `Вопрос ${state.index + 1} из ${queue.length}`;
  progressFill.style.width = `${(state.index / queue.length) * 100}%`;
  statsDiv.innerText = `✔ ${state.stats.correct} ✖ ${state.stats.wrong}`;
}

// ================== SHOW RESULT ==================
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
  if (!confirm("Вы уверены? Это удалит весь прогресс!")) return;

  localStorage.removeItem("bioState");
  state.stats = { correct: 0, wrong: 0 };
  state.errors = [];
  state.history = {};
  state.index = 0;
  state.queueType = "main";

  loadQuestions();
};

// ================== INITIALIZATION ==================
loadQuestions();
