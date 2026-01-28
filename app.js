// app.js (ES module) — Firebase + ваш тест (внутри initQuiz)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

/* ====== CONFIG: вставь свой конфиг если нужно ====== */
const firebaseConfig = {
  apiKey: "AIzaSyDE2nXjacnKSrkoTIzcVUCrmZbw5uZ3D7M",
  authDomain: "myawesome-d2811.firebaseapp.com",
  projectId: "myawesome-d2811",
  storageBucket: "myawesome-d2811.firebasestorage.app",
  messagingSenderId: "291210003836",
  appId: "1:291210003836:web:90d23cd0a79672746fd0f9",
  measurementId: "G-X7E0RXB6XD"
};

/* ====== Firebase init ====== */
const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch(e){ }
const auth = getAuth(app);
const db = getFirestore(app);

/* ====== DOM элементы (overlay и пр. должны быть в index.html) ====== */
const authOverlay = document.getElementById('authOverlay');
const waitOverlay = document.getElementById('waitOverlay');
const appDiv = document.getElementById('app');
const authBtn = document.getElementById('authBtn');
const statusP = document.getElementById('authStatus');
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');
const logoutBtn = document.getElementById('logoutBtn');
const helpBtn = document.getElementById('helpBtn');
const signOutFromWait = document.getElementById('signOutFromWait');
const userEmailSpan = document.getElementById('userEmail');

function setStatus(text, isError=false){
  if (!statusP) return;
  statusP.innerText = text;
  statusP.style.color = isError ? '#e53935' : '#444';
}

/* ====== Авторизация: кнопка входа/регистрации ====== */
if (authBtn) {
  authBtn.addEventListener('click', async ()=>{
    const email = (emailInput?.value||'').trim();
    const password = passInput?.value||'';
    if (!email || !password){ setStatus('Введите email и пароль', true); return; }
    setStatus('Пробуем войти...');

    try {
      await signInWithEmailAndPassword(auth,email,password);
      setStatus('Вход выполнен');
    } catch(e){
      if (e.code==='auth/user-not-found'){
        setStatus('Учётной записи не найдено — создаём...');
        try {
          const cred = await createUserWithEmailAndPassword(auth,email,password);
          await setDoc(doc(db,'users',cred.user.uid),{
            email: email,
            allowed: false,
            createdAt: serverTimestamp()
          });
          setStatus('Заявка отправлена. Ожидайте подтверждения.');
        } catch(err2){
          setStatus(err2.message||'Ошибка регистрации',true);
        }
      } else if (e.code==='auth/wrong-password'){
        setStatus('Неверный пароль',true);
      } else {
        setStatus(e.message||'Ошибка авторизации',true);
      }
    }
  });
}

/* ====== Выход ====== */
if (logoutBtn) logoutBtn.onclick = async ()=>{ await signOut(auth); location.reload(); };
if (signOutFromWait) signOutFromWait.onclick = async ()=>{ await signOut(auth); location.reload(); };
if (helpBtn) helpBtn.onclick = ()=>{ alert('Админ: Firebase Console → Firestore → collection "users" → поставьте allowed = true.'); };

/* ====== Глобальные флаги ====== */
quizInitialized = true; // присваиваем, не объявляем 
let quizInstance = null;      // экземпляр теста
let progressDocRef = null;    // ссылка на прогресс в Firestore
let passwordResetDone = false; // сброс пароля один раз

/* ====== Когда изменился аутентифицированный юзер ====== */

onAuthStateChanged(auth, async (user)=>{
  if (!user){
    if (authOverlay) authOverlay.style.display = 'flex';
    if (waitOverlay) waitOverlay.style.display = 'none';
    if (appDiv) appDiv.style.display = 'none';
    if (userEmailSpan) userEmailSpan.innerText = '';
    return;
  }

  if (authOverlay) authOverlay.style.display = 'none';
  if (userEmailSpan) userEmailSpan.innerText = user.email||'';

  const uDocRef = doc(db,'users',user.uid);
  const progressDocRef = doc(db,'usersanswer',user.uid);

  const uDocSnap = await getDoc(uDocRef);
  if (!uDocSnap.exists()){
    await setDoc(uDocRef,{
      email: user.email||'',
      allowed:false,
      createdAt:serverTimestamp()
    });
    if (waitOverlay) waitOverlay.style.display = 'flex';
    if (appDiv) appDiv.style.display = 'none';
    setStatus('Заявка отправлена. Ожидайте подтверждения.');
  }
  
  // ===== Реальный-time слушатель =====
onSnapshot(uDocRef, async (docSnap) => {
  const data = docSnap.data();
  if (!data) return;

  if (data.allowed === true) {
    // ✅ ДОСТУП РАЗРЕШЁН
    if (waitOverlay) waitOverlay.style.display = 'none';
    if (appDiv) appDiv.style.display = 'block';
    setStatus('');

    // 🔓 разблокируем клики
    document.body.classList.remove('blocked');

    // 🔐 сброс секретного пароля ОДИН РАЗ за вход
    if (!passwordResetDone) {
      passwordResetDone = true;

      const generateSecretPassword = (length = 20) => {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let pwd = "";
        for (let i = 0; i < length; i++) {
          pwd += chars[Math.floor(Math.random() * chars.length)];
        }
        return pwd;
      };

      const newSecret = generateSecretPassword();
      console.log(
        "%cНОВЫЙ СЕКРЕТНЫЙ ПАРОЛЬ:",
        "color:lime;font-weight:bold;",
        newSecret
      );

      // ❗ ВАЖНО: updatePassword работает ТОЛЬКО если пользователь недавно вошёл
      // Поэтому просто логируем (реальный сброс — через админку или Cloud Function)
    }

    // ▶️ инициализация теста ОДИН РАЗ
    if (!quizInitialized) {
      quizInstance = initQuiz(progressDocRef);
      quizInitialized = true;
    }

  } else {
    // 🔴 ДОСТУП ЗАКРЫТ — МГНОВЕННО
    if (waitOverlay) waitOverlay.style.display = 'flex';
    if (appDiv) appDiv.style.display = 'none';
    setStatus('Доступ закрыт администратором.');

    // 🚫 блокируем ВСЕ клики
    document.body.classList.add('blocked');
  }
});

// флаг — чтобы пароль не сбрасывался бесконечно
let passwordResetDone = false;

onSnapshot(uDocRef, async (docSnap) => {
  const data = docSnap.data();
  if (!data) return;

  if (data.allowed === true) {
    // ✅ ДОСТУП РАЗРЕШЁН
    if (waitOverlay) waitOverlay.style.display = 'none';
    if (appDiv) appDiv.style.display = 'block';
    setStatus('');

    // 🔓 разблокируем клики ПРАВИЛЬНО
    document.body.classList.remove('blocked');

    // 🔐 сброс секретного пароля — ОДИН РАЗ за вход
    if (!passwordResetDone) {
      passwordResetDone = true;

      const generateSecretPassword = (length = 20) => {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let pwd = "";
        for (let i = 0; i < length; i++) {
          pwd += chars[Math.floor(Math.random() * chars.length)];
        }
        return pwd;
      };

      const newSecret = generateSecretPassword();

      // ⚠️ updatePassword часто требует re-auth — поэтому просто логируем
      console.log(
        "%cНОВЫЙ СЕКРЕТНЫЙ ПАРОЛЬ:",
        "color:lime;font-weight:bold;",
        newSecret
      );
    }

    // ▶️ инициализируем тест ОДИН РАЗ
    if (!quizInitialized) {
      quizInstance = initQuiz(progressDocRef);
      quizInitialized = true;
    }

  } else {
    // 🔴 ДОСТУП ЗАКРЫТ — МГНОВЕННО
    if (waitOverlay) waitOverlay.style.display = 'flex';
    if (appDiv) appDiv.style.display = 'none';
    setStatus('Доступ закрыт администратором.');

    // 🚫 блокируем ВСЕ клики через CSS
    document.body.classList.add('blocked');

    // визуально снимаем выбор
    const answerEls = document.querySelectorAll('#answers .answer');
    answerEls.forEach(el => el.classList.remove('selected'));
  }
});
  
/* ====== Тест с синхронизацией ====== */
function initQuiz(progressRef){
  const state = JSON.parse(localStorage.getItem("bioState"))||{
    queueType:"main", index:0, mainIndex:0, stats:{correct:0,wrong:0},
    errors:[], errorAttempts:{}, history:{}, mainQueue:null, answersOrder:{}, errorQueue:[]
  };

  let questions=[], mainQueue=[], errorQueue=[];
  let selected = new Set(), checked=false;
  
/* ===================================================================
   Ниже — ваш существующий код теста, обёрнут в функцию initQuiz().
   Я старался не менять логику — только поместил всё в scope функции.
   =================================================================== */

function initQuiz() {
  // === Состояние ===
  const state = JSON.parse(localStorage.getItem("bioState")) || {
    queueType: "main",
    index: 0,
    mainIndex: 0,
    stats: { correct: 0, wrong: 0 },
    errors: [],
    errorAttempts: {},
    history: {},
    mainQueue: null,
    answersOrder: {},
    errorQueue: []
  };

  let questions = [], mainQueue = [], errorQueue = [];
  let selected = new Set(), checked = false;

  // === Элементы UI ===
  const qText = document.getElementById("questionText");
  const answersDiv = document.getElementById("answers");
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");
  const statsDiv = document.getElementById("stats");
  const submitBtn = document.getElementById("submitBtn");
  const nextBtn = document.getElementById("nextBtn");
  const resetBtn = document.getElementById("resetBtn");

  /* ====== Подгружаем прогресс из Firestore ====== */
  (async ()=>{
    if (!progressRef) return;
    try{
      const snap = await getDoc(progressRef);
      if (snap.exists()){
        const data = snap.data();
        if (data.progress){
          const savedState = JSON.parse(data.progress);
          Object.assign(state, savedState);
        }
      }
    } catch(e){ console.error('Ошибка загрузки прогресса:',e); }
    render();
  })();

  /* ====== Функция сохранения прогресса ====== */
  function saveState(){
    localStorage.setItem("bioState",JSON.stringify(state));
    if (progressRef){
      updateDoc(progressRef,{
        progress: JSON.stringify(state),
        updatedAt: serverTimestamp()
      }).catch(err=>console.error('Ошибка сохранения прогресса:',err));
    }
  }

  // === Exit errors button (append once) ===
  let exitErrorsBtn = document.getElementById('exitErrorsBtn_custom');
  if (!exitErrorsBtn) {
    exitErrorsBtn = document.createElement("button");
    exitErrorsBtn.id = 'exitErrorsBtn_custom';
    exitErrorsBtn.innerText = "Выйти из режима ошибок";
    exitErrorsBtn.className = "secondary";
    exitErrorsBtn.style.marginLeft = "10px";
    exitErrorsBtn.style.display = "none";
    exitErrorsBtn.onclick = () => {
      state.queueType = "main";
      state.index = state.mainIndex || 0;
      saveState();
      render();
    };
    const controls = document.querySelector(".controls");
    if (controls) controls.appendChild(exitErrorsBtn);
  }

  // === Панель вопросов ===
  const questionPanel = document.getElementById("questionPanel");
  const pageNav = document.getElementById("pageNav");
  let currentPanelPage = 0;
  let currentPanelPageErrors = 0;
  if (questionPanel) questionPanel.style.overflowY = "auto";

  // === Shuffle ===
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // === Load questions ===
  function loadQuestions() {
    fetch("questions.json")
      .then(r => r.json())
      .then(data => {
        questions = data.map(q => ({
          text: q.text,
          answers: q.answers.slice(),
          correct: Array.isArray(q.correct) ? q.correct.slice() : q.correct
        }));

        state.answersOrder = state.answersOrder || {};
        state.mainQueue = state.mainQueue || null;
        state.errorQueue = state.errorQueue || [];

        if (!state.mainQueue || state.mainQueue.length !== questions.length) {
          mainQueue = [...Array(questions.length).keys()];
          shuffleArray(mainQueue);
        } else {
          mainQueue = state.mainQueue.slice();
          const freeIndexes = [];
          const floating = [];
          mainQueue.forEach((qId, pos) => {
            if (!state.history[qId]?.checked) {
              freeIndexes.push(pos);
              floating.push(qId);
            }
          });
          shuffleArray(floating);
          freeIndexes.forEach((pos, i) => mainQueue[pos] = floating[i]);
        }
        state.mainQueue = mainQueue.slice();

        mainQueue.forEach(qId => {
          const q = questions[qId];
          const original = q.answers.map((a, i) => ({ text: a, index: i }));
          const origCorrect = Array.isArray(q.correct) ? q.correct.slice() : q.correct;

          let order;
          if (state.answersOrder[qId]) {
            order = state.answersOrder[qId].slice();
          } else {
            order = original.map(a => a.index);
            shuffleArray(order);
            state.answersOrder[qId] = order.slice();
          }

          q.answers = order.map(i => original.find(a => a.index === i).text);
          q.correct = Array.isArray(origCorrect)
            ? origCorrect.map(c => order.indexOf(c))
            : order.indexOf(origCorrect);
          q._currentOrder = order.slice();
        });

        errorQueue = state.errorQueue && state.errorQueue.length
          ? state.errorQueue.slice()
          : (state.errors ? state.errors.slice() : []);
        state.errorQueue = errorQueue.slice();

        saveState();
        render();
      })
      .catch(err => {
        console.error(err);
        if (qText) qText.innerText = "Не удалось загрузить вопросы ❌";
      });
  }

  // === Queue helpers ===
  function currentQueue() { return state.queueType === "main" ? mainQueue : errorQueue; }
  function allChecked() { return currentQueue().every(qId => state.history[qId]?.checked); }

  // === Prev button (bind if exists) ===
  const prevBtn = document.getElementById("prevBtn");
  if (prevBtn) prevBtn.onclick = () => {
    if (state.index > 0) { state.index--; render(); }
  };

  // === Render question panel with pagination ===
  function renderQuestionPanel() {
    const queue = currentQueue();
    const questionsPerPage = 50;
    const currentPage = Math.floor(state.index / questionsPerPage);
    if (state.queueType === "main") currentPanelPage = currentPage;
    else currentPanelPageErrors = currentPage;
    const page = state.queueType === "main" ? currentPanelPage : currentPanelPageErrors;
    const start = page * questionsPerPage;
    const end = Math.min(start + questionsPerPage, queue.length);

    if (!questionPanel) return;
    questionPanel.innerHTML = "";

    const pageQuestions = queue.slice(start, end);

    pageQuestions.forEach((qId, idx) => {
      const btn = document.createElement("button");
      btn.innerText = start + idx + 1;

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

      if (qId === queue[state.index]) {
        btn.style.border = "2px solid blue";
        btn.style.boxShadow = "0 0 8px rgba(0,0,255,0.7)";
      }

      btn.onclick = () => {
        state.index = queue.indexOf(qId);
        render();
      };

      questionPanel.appendChild(btn);
    });

    // page nav
    if (!pageNav) return;
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

  // === Highlight answers ===
  function highlightAnswers(qId) {
    const q = questions[qId];
    const correctIndexes = Array.isArray(q.correct) ? q.correct : [q.correct];
    const answerEls = answersDiv ? [...answersDiv.children] : [];
    answerEls.forEach((el, i) => {
      el.classList.remove("correct", "wrong");
      if (correctIndexes.includes(i)) el.classList.add("correct");
      if (state.history[qId]?.selected?.includes(i) && !correctIndexes.includes(i)) el.classList.add("wrong");
    });
  }

  // === Render question ===
  function render() {
    const queue = currentQueue();
    exitErrorsBtn.style.display = state.queueType === "errors" ? "inline-block" : "none";

    if (!qText) return;
    if (!answersDiv) return;

    if (queue.length === 0) {
      qText.innerText = "Вопросов нет 😎";
      answersDiv.innerHTML = "";
      if (submitBtn) submitBtn.style.display = nextBtn.style.display = "none";
      return;
    }

    if (state.index >= queue.length) {
      if (state.queueType === "errors") {
        exitErrorsBtn.click();
        return;
      }
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
    if (submitBtn) {
      submitBtn.style.display = multi ? "inline-block" : "none";
      submitBtn.disabled = false;
    }

    renderQuestionPanel();

    if (nextBtn) nextBtn.innerText = allChecked() ? "Следующий" : "Следующий (пропустить)";
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
    if (submitBtn) submitBtn.disabled = checked;
    updateUI();
  }

  // === Check answers ===
  if (submitBtn) submitBtn.onclick = () => {
    if (checked) return;
    checkAnswers();
    render();
  };

  function checkAnswers() {
    const queue = currentQueue();
    const qId = queue[state.index];
    const q = questions[qId];

    const correctSet = new Set(Array.isArray(q.correct) ? q.correct : [q.correct]);
    const selectedSet = new Set(selected);

    checked = true;
    if (submitBtn) submitBtn.disabled = true;

    state.history[qId] = state.history[qId] || {};

    if (!state.answersOrder[qId] && q._currentOrder) {
      state.answersOrder[qId] = q._currentOrder.slice();
    }

    state.history[qId].selected = [...selected];
    state.history[qId].checked = true;

    const isCorrect =
      [...correctSet].every(c => selectedSet.has(c)) &&
      selectedSet.size === correctSet.size;

    if (!isCorrect) {
      if (!state.errors.includes(qId)) state.errors.push(qId);
      if (!state.errorQueue.includes(qId)) state.errorQueue.push(qId);
    } else {
      state.errors = state.errors.filter(id => id !== qId);
      state.errorQueue = state.errorQueue.filter(id => id !== qId);
    }

    if (!state.history[qId].counted && state.queueType === "main") {
      if (isCorrect) state.stats.correct++;
      else state.stats.wrong++;
      state.history[qId].counted = true;
    }

    if (state.queueType === "errors") {
      state.errorAttempts[qId] = (state.errorAttempts[qId] || 0) + 1;
    }

    highlightAnswers(qId);

    state.mainQueue = mainQueue.slice();
    state.errorQueue = state.errorQueue.slice();
    saveState();
    renderQuestionPanel();
  }

  // === Next button ===
  if (nextBtn) nextBtn.onclick = () => {
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

  // === Errors mode ===
  const errorsBtn = document.getElementById("errorsBtn");
  if (errorsBtn) errorsBtn.onclick = () => {
    if (!state.errors.length) { alert("Ошибок пока нет 👍"); return; }
    if (state.queueType !== "errors") state.mainIndex = state.index;
    state.queueType = "errors";
    state.index = 0;
    errorQueue = state.errors.slice();
    state.errorQueue = errorQueue.slice();
    saveState();
    render();
  };

  // === UI update ===
  function updateUI() {
    const queue = currentQueue();
    if (progressText) progressText.innerText = `Вопрос ${state.index + 1} из ${queue.length}`;
    if (progressFill) progressFill.style.width = `${(queue.length ? (state.index / queue.length) * 100 : 0)}%`;
    if (statsDiv) statsDiv.innerText = `✔ ${state.stats.correct} ✖ ${state.stats.wrong}`;
  }

  // === Show result ===
  function showResult() {
    const total = state.stats.correct + state.stats.wrong;
    const correctPercent = total ? ((state.stats.correct / total) * 100).toFixed(1) : 0;
    const wrongPercent = total ? ((state.stats.wrong / total) * 100).toFixed(1) : 0;
    if (qText) qText.innerText = "Тест завершён 🎉";
    if (answersDiv) answersDiv.innerHTML = `<div>Правильные: ${state.stats.correct} (${correctPercent}%)</div><div>Неправильные: ${state.stats.wrong} (${wrongPercent}%)</div>`;
    if (submitBtn) submitBtn.style.display = nextBtn.style.display = "none";
    exitErrorsBtn.style.display = "none";
  }

  // === Reset ===
  if (resetBtn) resetBtn.onclick = () => {
    if (confirm("Вы уверены? Это удалит весь прогресс!")) {
      localStorage.removeItem("bioState");
      location.reload();
    }
  };

  // === Init: load questions and render ===
  loadQuestions();

  // return handles (optional)
  return {
    saveState,
    loadQuestions,
    render,
  };
} // end initQuiz

// Экспортируем initQuiz (если потребуется)
export { initQuiz };












