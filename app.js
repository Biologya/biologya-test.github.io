// ================== STATE ==================

const state = JSON.parse(localStorage.getItem("bioState")) || {
  queueType: "main",
  index: 0,
  mainIndex: 0,
  stats: { correct: 0, wrong: 0 },
  errors: [],
  history: {},
  order: null // фиксированный порядок вопросов
};

let questions = [];
let mainQueue = [];
let errorQueue = [];

let selected = new Set();
let checked = false;

// ================== UI ==================

const qText = document.getElementById("questionText");
const answersDiv = document.getElementById("answers");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const statsDiv = document.getElementById("stats");

const submitBtn = document.getElementById("submitBtn");
const nextBtn = document.getElementById("nextBtn");
const resetBtn = document.getElementById("resetBtn");
const prevBtn = document.getElementById("prevBtn");

const questionPanel = document.getElementById("questionPanel");
const pageNav = document.getElementById("pageNav");

// ================== EXIT ERRORS BUTTON ==================

const exitErrorsBtn = document.createElement("button");
exitErrorsBtn.innerText = "Выйти из режима ошибок";
exitErrorsBtn.className = "secondary";
exitErrorsBtn.style.display = "none";

exitErrorsBtn.onclick = () => {
  state.queueType = "main";
  state.index = state.mainIndex;
  saveState();
  render();
};

document.querySelector(".controls").appendChild(exitErrorsBtn);

// ================== SHUFFLE ==================

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ================== LOAD QUESTIONS ==================

function loadQuestions() {

  fetch("questions.json")
    .then(r => r.json())
    .then(data => {

      questions = data;

      // ---------- фиксируем порядок вопросов ОДИН РАЗ ----------

      if (!state.order) {
        state.order = Array.from({ length: questions.length }, (_, i) => i);
        shuffleArray(state.order); // стартовый shuffle
        saveState();
      }

      mainQueue = [...state.order];
      errorQueue = state.errors || [];

      // ---------- восстанавливаем ответы ----------

      questions.forEach((q, i) => {

        const h = state.history[i];

        // если отвечен — возвращаем как было
        if (h?.checked && h.answers && h.correct) {

          q.answers = [...h.answers];
          q.correct = [...h.correct];

        } else {

          // только новые мешаем
          const original = q.answers.map((a, idx) => ({
            text: a,
            index: idx
          }));

          shuffleArray(original);

          q.answers = original.map(a => a.text);

          if (Array.isArray(q.correct)) {
            q.correct = q.correct.map(c =>
              original.findIndex(a => a.index === c)
            );
          } else {
            q.correct = original.findIndex(a => a.index === q.correct);
          }
        }
      });

      render();
    })
    .catch(err => {
      console.error(err);
      qText.innerText = "Ошибка загрузки ❌";
    });
}

// ================== QUEUE ==================

function currentQueue() {
  return state.queueType === "main" ? mainQueue : errorQueue;
}

function allChecked() {
  return currentQueue().every(id => state.history[id]?.checked);
}

// ================== PANEL ==================

function renderQuestionPanel() {

  const queue = currentQueue();
  const perPage = 50;

  const page = Math.floor(state.index / perPage);
  const start = page * perPage;
  const end = Math.min(start + perPage, queue.length);

  questionPanel.innerHTML = "";

  for (let i = start; i < end; i++) {

    const qId = queue[i];

    const btn = document.createElement("button");
    btn.innerText = i + 1;

    if (state.history[qId]?.checked) {

      const sel = state.history[qId].selected;
      const corr = questions[qId].correct;

      const ok =
        corr.every(c => sel.includes(c)) &&
        sel.length === corr.length;

      btn.style.background = ok ? "#4caf50" : "#e53935";
      btn.style.color = "#fff";

    } else {

      btn.style.background = "#fff";
      btn.style.color = "#000";
    }

    if (i === state.index) {
      btn.style.border = "2px solid blue";
    }

    btn.onclick = () => {
      state.index = i;
      render();
    };

    questionPanel.appendChild(btn);
  }
}

// ================== HIGHLIGHT ==================

function highlightAnswers(qId) {

  const correct = questions[qId].correct;
  const selectedSaved = state.history[qId]?.selected || [];

  [...answersDiv.children].forEach((el, i) => {

    el.classList.remove("correct", "wrong");

    if (correct.includes(i)) el.classList.add("correct");
    if (selectedSaved.includes(i) && !correct.includes(i))
      el.classList.add("wrong");
  });
}

// ================== RENDER ==================

function render() {

  const queue = currentQueue();

  exitErrorsBtn.style.display =
    state.queueType === "errors" ? "inline-block" : "none";

  if (!queue.length) {
    qText.innerText = "Вопросов нет";
    return;
  }

  const qId = queue[state.index];
  const q = questions[qId];

  qText.innerText = q.text;
  answersDiv.innerHTML = "";

  checked = !!state.history[qId]?.checked;
  selected = new Set(state.history[qId]?.selected || []);

  q.answers.forEach((text, i) => {

    const el = document.createElement("div");
    el.className = "answer";
    el.innerHTML = `<span>${text}</span>`;

    if (selected.has(i)) el.classList.add("selected");

    el.onclick = () => {

      if (checked || state.queueType === "errors") return;

      selected.clear();
      selected.add(i);

      checkAnswers();
      render();
    };

    answersDiv.appendChild(el);
  });

  if (checked || state.queueType === "errors") {
    highlightAnswers(qId);
  }

  renderQuestionPanel();
  updateUI();
}

// ================== CHECK ==================

function checkAnswers() {

  const qId = currentQueue()[state.index];
  const q = questions[qId];

  const correct = new Set(q.correct);

  if (!state.history[qId]) state.history[qId] = {};

  state.history[qId].selected = [...selected];
  state.history[qId].answers = [...q.answers];
  state.history[qId].correct = [...q.correct];
  state.history[qId].checked = true;

  const ok =
    [...correct].every(c => selected.has(c)) &&
    selected.size === correct.size;

  if (!state.history[qId].counted && state.queueType === "main") {
    ok ? state.stats.correct++ : state.stats.wrong++;
    state.history[qId].counted = true;
  }

  if (!ok && !state.errors.includes(qId)) {
    state.errors.push(qId);
  }

  saveState();
}

// ================== NAV ==================

nextBtn.onclick = () => {

  const queue = currentQueue();

  if (state.index < queue.length - 1) {
    state.index++;
  }

  render();
};

prevBtn.onclick = () => {
  if (state.index > 0) {
    state.index--;
    render();
  }
};

// ================== ERRORS MODE ==================

document.getElementById("errorsBtn").onclick = () => {

  if (!state.errors.length) return alert("Ошибок нет");

  state.mainIndex = state.index;
  state.queueType = "errors";
  state.index = 0;

  saveState();
  render();
};

// ================== UI ==================

function updateUI() {

  const queue = currentQueue();

  progressText.innerText =
    `Вопрос ${state.index + 1} из ${queue.length}`;

  progressFill.style.width =
    `${((state.index + 1) / queue.length) * 100}%`;

  statsDiv.innerText =
    `✔ ${state.stats.correct} ✖ ${state.stats.wrong}`;
}

// ================== SAVE ==================

function saveState() {
  localStorage.setItem("bioState", JSON.stringify(state));
}

// ================== RESET ==================

resetBtn.onclick = () => {

  if (!confirm("Сбросить прогресс?")) return;

  localStorage.removeItem("bioState");

  location.reload();
};

// ================== INIT ==================

loadQuestions();
