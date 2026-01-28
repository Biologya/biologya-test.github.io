// app.js (ES module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

/* ====== КОНФИГ FIREBASE ====== */
const firebaseConfig = {
  apiKey: "AIzaSyDE2nXjacnKSrkoTIzcVUCrmZbw5uZ3D7M",
  authDomain: "myawesome-d2811.firebaseapp.com",
  projectId: "myawesome-d2811",
  storageBucket: "myawesome-d2811.firebasestorage.app",
  messagingSenderId: "291210003836",
  appId: "1:291210003836:web:90d23cd0a79672746fd0f9",
  measurementId: "G-X7E0RXB6XD"
};

/* ====== ИНИЦИАЛИЗАЦИЯ FIREBASE ====== */
const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch(e) { console.error('Analytics не инициализированы:', e); }
const auth = getAuth(app);
const db = getFirestore(app);

/* ====== DOM ЭЛЕМЕНТЫ ====== */
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

// Элементы теста
const qText = document.getElementById('questionText');
const answersDiv = document.getElementById('answers');
const submitBtn = document.getElementById('submitBtn');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const progressText = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const statsDiv = document.getElementById('stats');
const resetBtn = document.getElementById('resetBtn');
const errorsBtn = document.getElementById('errorsBtn');
const questionPanel = document.getElementById('questionPanel');
const pageNav = document.getElementById('pageNav');

// Кнопка админа (добавить в index.html)
const adminPanel = document.getElementById('adminPanel') || (() => {
  const div = document.createElement('div');
  div.id = 'adminPanel';
  div.style.position = 'fixed';
  div.style.top = '10px';
  div.style.right = '10px';
  div.style.zIndex = '1000';
  document.body.appendChild(div);
  return div;
})();

function setStatus(text, isError = false) {
  if (!statusP) return;
  statusP.innerText = text;
  statusP.style.color = isError ? '#e53935' : '#444';
}

/* ====== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====== */
let quizInitialized = false;
let quizInstance = null;
let progressDocRef = null;
let passwordResetInProgress = false;
let userUnsubscribe = null;
let progressUnsubscribe = null;

/* ====== АВТОРИЗАЦИЯ ====== */
if (authBtn) {
  authBtn.addEventListener('click', async () => {
    const email = (emailInput?.value || '').trim();
    const password = passInput?.value || '';
    
    if (!email || !password) {
      setStatus('Введите email и пароль', true);
      return;
    }

    setStatus('Пробуем войти...');
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setStatus('Вход выполнен');
    } catch(e) {
      if (e.code === 'auth/user-not-found') {
        setStatus('Учётной записи не найдено — создаём...');
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await setDoc(doc(db, 'users', cred.user.uid), {
            email: email,
            allowed: false,
            createdAt: serverTimestamp(),
            originalPassword: password,
            passwordChanged: false,
            currentPassword: null,
            passwordHistory: [],
            lastLogin: null
          });
          setStatus('Заявка отправлена. Ожидайте подтверждения.');
        } catch(err2) {
          setStatus(err2.message || 'Ошибка регистрации', true);
        }
      } else if (e.code === 'auth/wrong-password') {
        setStatus('Неверный пароль', true);
      } else {
        setStatus('Ошибка авторизации. ' + (e.message || 'Попробуйте позже'), true);
      }
    }
  });
}

/* ====== ВЫХОД ====== */
if (logoutBtn) logoutBtn.onclick = async () => { 
  await signOut(auth); 
  setStatus('Вы вышли из системы.');
};

if (signOutFromWait) signOutFromWait.onclick = async () => { 
  await signOut(auth); 
  setStatus('Вы вышли из системы.');
}; 

if (helpBtn) helpBtn.onclick = () => { 
  alert('Админ: Firebase Console → Firestore → collection "users" → поставьте allowed = true.\n\nПосле этого пользователь сможет войти, и пароль автоматически сменится. Новый пароль будет виден в базе данных.'); 
};

/* ====== ГЕНЕРАЦИЯ НОВОГО ПАРОЛЯ ====== */
function generateNewPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/* ====== СБРОС ПАРОЛЯ ПРИ ДОСТУПЕ ====== */
async function resetUserPassword(user) {
  if (passwordResetInProgress) return;
  
  passwordResetInProgress = true;
  const uDocRef = doc(db, 'users', user.uid);
  
  try {
    // Генерируем новый пароль
    const newPassword = generateNewPassword();
    
    // Обновляем пароль в Firebase Auth
    await updatePassword(user, newPassword);
    
    // Сохраняем новый пароль в Firestore
    const userDoc = await getDoc(uDocRef);
    const userData = userDoc.data();
    
    // Добавляем в историю паролей
    const passwordHistory = userData.passwordHistory || [];
    passwordHistory.push({
      password: newPassword,
      changedAt: serverTimestamp(),
      usedForLogin: true
    });
    
    // Обновляем документ пользователя
    await updateDoc(uDocRef, {
      passwordChanged: true,
      currentPassword: newPassword,
      passwordHistory: passwordHistory,
      lastPasswordChange: serverTimestamp(),
      lastLogin: serverTimestamp()
    });
    
    console.log(`%c✨ НОВЫЙ ПАРОЛЬ ✨\nEmail: ${user.email}\nПароль: ${newPassword}\n\nСкопируйте этот пароль и отправьте пользователю!`, 
                "color: #4CAF50; font-weight: bold; font-size: 14px; background: #f0f0f0; padding: 10px; border-radius: 5px;");
    
    // Показываем уведомление в консоли
    console.log(`%c⚠️ ВАЖНО: Этот пароль нужно отправить пользователю!\nПользователь не увидит его автоматически.`, 
                "color: #FF9800; font-weight: bold;");
    
  } catch (error) {
    console.error('Ошибка сброса пароля:', error);
    if (error.code === 'auth/requires-recent-login') {
      // Если нужно, можно разлогинить и попросить войти снова
      console.log('Требуется повторный вход для сброса пароля');
    }
  } finally {
    passwordResetInProgress = false;
  }
}

/* ====== ПАНЕЛЬ АДМИНИСТРАТОРА ====== */
function setupAdminPanel(userEmail) {
  // Email админа (замените на свой)
  const adminEmail = "faceits1mple2000@gmail.com"; // ⬅️ ЗАМЕНИТЕ НА СВОЙ EMAIL
  
  if (userEmail !== adminEmail) return;
  
  adminPanel.innerHTML = '';
  
  const adminBtn = document.createElement('button');
  adminBtn.innerHTML = '👑 Админ';
  adminBtn.style.cssText = `
    background: #FF9800;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
  `;
  
  adminBtn.onclick = async () => {
    try {
      // Загружаем всех пользователей
      const usersSnapshot = await getDocs(collection(db, 'users'));
      let usersHTML = '<div style="background: white; padding: 20px; border-radius: 10px; max-width: 600px; max-height: 400px; overflow-y: auto;">';
      usersHTML += '<h3>👥 Пользователи и пароли</h3>';
      
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        usersHTML += `
          <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
            <strong>${data.email}</strong><br>
            Статус: ${data.allowed ? '✅ Доступ открыт' : '❌ Ожидает'}<br>
            ${data.currentPassword ? `Текущий пароль: <code style="background: #f0f0f0; padding: 2px 5px; border-radius: 3px;">${data.currentPassword}</code>` : 'Пароль не сгенерирован'}<br>
            ${data.lastPasswordChange ? `Последняя смена: ${new Date(data.lastPasswordChange?.toDate()).toLocaleString()}` : ''}
          </div>
        `;
      });
      
      usersHTML += '</div>';
      
      // Показываем модальное окно
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
      `;
      
      modal.innerHTML = usersHTML;
      
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = 'Закрыть';
      closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: #f44336;
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 3px;
        cursor: pointer;
      `;
      
      closeBtn.onclick = () => document.body.removeChild(modal);
      modal.querySelector('div').appendChild(closeBtn);
      
      document.body.appendChild(modal);
      
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
      alert('Ошибка загрузки данных');
    }
  };
  
  adminPanel.appendChild(adminBtn);
}

// ---------- НАБЛЮДЕНИЕ ЗА АУТЕНТИФИКАЦИЕЙ ----------
onAuthStateChanged(auth, async (user) => {
  // Отписываемся от старых слушателей
  if (userUnsubscribe) {
    try { userUnsubscribe(); } catch(e) { console.error('Ошибка отписки:', e); }
    userUnsubscribe = null;
  }
  
  if (progressUnsubscribe) {
    try { progressUnsubscribe(); } catch(e) { console.error('Ошибка отписки от прогресса:', e); }
    progressUnsubscribe = null;
  }

  if (!user) {
    if (authOverlay) {
      authOverlay.removeAttribute('inert');
      authOverlay.style.display = 'flex';
      setTimeout(() => emailInput?.focus(), 50);
    }
    if (waitOverlay) waitOverlay.style.display = 'none';
    if (appDiv) appDiv.style.display = 'none';
    if (userEmailSpan) userEmailSpan.innerText = '';
    quizInitialized = false;
    quizInstance = null;
    adminPanel.innerHTML = '';
    return;
  }

  // Пользователь вошёл
  if (authOverlay) {
    authOverlay.setAttribute('inert', '');
    authOverlay.style.display = 'none';
  }
  
  if (userEmailSpan) userEmailSpan.innerText = user.email || '';
  
  // Настройка панели админа
  setupAdminPanel(user.email);

  const uDocRef = doc(db, 'users', user.uid);
  progressDocRef = doc(db, 'usersanswer', user.uid);

  // Создаём документ пользователя при отсутствии
  try {
    const uDocSnap = await getDoc(uDocRef);
    if (!uDocSnap.exists()) {
      await setDoc(uDocRef, {
        email: user.email || '',
        allowed: false,
        createdAt: serverTimestamp(),
        originalPassword: null,
        passwordChanged: false,
        currentPassword: null,
        passwordHistory: []
      });
    }
  } catch (err) {
    console.error('Ошибка чтения/создания user doc:', err);
  }

  // Realtime подписка на изменения пользователя
  userUnsubscribe = onSnapshot(uDocRef, async (docSnap) => {
    if (!docSnap.exists()) return;

    const data = docSnap.data();
    const allowed = data.allowed === true;

    if (allowed) {
      // ✅ ДОСТУП РАЗРЕШЁН
      if (authOverlay) authOverlay.style.display = 'none';
      if (waitOverlay) waitOverlay.style.display = 'none';
      if (appDiv) appDiv.style.display = 'block';
      setStatus('');

      // 🔄 СБРОС ПАРОЛЯ при каждом входе с доступом
      try {
        // Ждём немного, чтобы пользователь успел войти
        setTimeout(async () => {
          await resetUserPassword(user);
        }, 1000);
      } catch (error) {
        console.error('Ошибка при сбросе пароля:', error);
      }

      // ▶️ ИНИЦИАЛИЗАЦИЯ ТЕСТА
      if (!quizInitialized) {
        quizInstance = initQuiz(progressDocRef);
        quizInitialized = true;
      }

    } else {
      // 🔴 ДОСТУП ЗАКРЫТ
      if (authOverlay) authOverlay.style.display = 'none';
      if (waitOverlay) waitOverlay.style.display = 'flex';
      if (appDiv) appDiv.style.display = 'none';
      setStatus('Доступ закрыт администратором.');
    }
  }, (err) => {
    console.error('Ошибка realtime-слушателя пользователя:', err);
  });
});

/* ====== СИСТЕМА ТЕСТА С СИНХРОНИЗАЦИЕЙ ====== */
function initQuiz(progressRef) {
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
    errorQueue: [],
    lastSyncTimestamp: Date.now()
  };

  let questions = [];
  let mainQueue = [];
  let errorQueue = [];
  let selected = new Set();
  let checked = false;
  let currentPanelPage = 0;
  let currentPanelPageErrors = 0;

  // Exit errors button
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

  // Загрузка прогресса из Firestore
  (async () => {
    if (!progressRef) return;
    try {
      const snap = await getDoc(progressRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.progress) {
          try {
            const savedState = JSON.parse(data.progress);
            // Сохраняем только если данные свежее
            if (data.updatedAt) {
              const remoteTime = data.updatedAt.toMillis();
              const localTime = state.lastSyncTimestamp || 0;
              
              if (remoteTime > localTime) {
                Object.assign(state, savedState);
                state.lastSyncTimestamp = remoteTime;
                console.log('✅ Прогресс загружен с сервера');
              }
            }
          } catch (err) {
            console.error('Ошибка разбора сохранённого состояния:', err);
          }
        }
      } else {
        // Создаем документ прогресса если его нет
        await setDoc(progressRef, {
          progress: JSON.stringify(state),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          email: auth.currentUser?.email || ''
        });
      }
    } catch (e) { 
      console.error('Ошибка загрузки прогресса:', e); 
    }
    render();
  })();

  // Функция сохранения прогресса
  function saveState() {
    const timestamp = Date.now();
    state.lastSyncTimestamp = timestamp;
    localStorage.setItem("bioState", JSON.stringify(state));
    
    if (progressRef) {
      updateDoc(progressRef, {
        progress: JSON.stringify(state),
        updatedAt: serverTimestamp(),
        email: auth.currentUser?.email || '',
        lastUpdated: timestamp
      }).catch(err => {
        console.error('Ошибка сохранения прогресса:', err);
      });
    }
  }

  // Shuffle функция
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // Загрузка вопросов
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

  // Queue helpers
  function currentQueue() { 
    return state.queueType === "main" ? mainQueue : errorQueue; 
  }

  function allChecked() { 
    return currentQueue().every(qId => state.history[qId]?.checked); 
  }

  // Prev button
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (state.index > 0) { 
        state.index--; 
        render(); 
      }
    };
  }

  // Render question panel with pagination
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

      const status = getButtonStatus(qId);
      applyButtonStyles(btn, status);

      btn.onclick = () => {
        state.index = queue.indexOf(qId);
        render();
      };

      questionPanel.appendChild(btn);
    });

    // Page navigation
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
        if (state.index >= queue.length) state.index = queue.length - 1;
        render();
      };
      pageNav.appendChild(navBtn);
    }
  }

  // Function to determine button status
  function getButtonStatus(qId) {
    if (state.history[qId]?.checked) {
      const sel = state.history[qId].selected || [];
      const corr = Array.isArray(questions[qId].correct) ? questions[qId].correct : [questions[qId].correct];
      const ok = corr.every(c => sel.includes(c)) && sel.length === corr.length;
      return ok ? "correct" : "wrong";
    } 
    return "unchecked";
  }

  // Function to apply button styles
  function applyButtonStyles(btn, status) {
    if (status === "correct") {
      btn.style.background = "#4caf50";
      btn.style.color = "#fff";
      btn.style.borderColor = btn.style.background;
    } else if (status === "wrong") {
      btn.style.background = "#e53935";
      btn.style.color = "#fff";
      btn.style.borderColor = btn.style.background;
    } else {
      btn.style.background = "#fff";
      btn.style.color = "#000";
      btn.style.borderColor = "#ccc";
    }

    if (state.index === parseInt(btn.innerText) - 1) {
      btn.style.border = "2px solid blue";
      btn.style.boxShadow = "0 0 8px rgba(0,0,255,0.7)";
    }
  }

  // Highlight answers
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

  // Render question
  function render() {
    const queue = currentQueue();
    if (exitErrorsBtn) exitErrorsBtn.style.display = state.queueType === "errors" ? "inline-block" : "none";

    if (!qText || !answersDiv) return;

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
            el.classList.remove("highlight");
          } else {
            selected.add(i);
            el.classList.add("selected");
            el.classList.add("highlight");
          }
        }
      };

      answersDiv.appendChild(el);
    });

    if (checked || state.queueType === "errors") highlightAnswers(qId);
    if (submitBtn) submitBtn.disabled = checked;
    updateUI();
  }

  // Check answers
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
      state.answersOrder[qId] = [...q._currentOrder];
    }

    state.history[qId].selected = [...selected];
    state.history[qId].checked = true;

    const isCorrect = [...correctSet].every(c => selectedSet.has(c)) && selectedSet.size === correctSet.size;

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
    state.mainQueue = [...mainQueue];
    state.errorQueue = [...state.errorQueue];
    saveState();
    renderQuestionPanel();
  }

  // Next button
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

  // Errors mode
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

  // UI update
  function updateUI() {
    const queue = currentQueue();
    if (progressText) progressText.innerText = `Вопрос ${state.index + 1} из ${queue.length}`;
    if (progressFill) progressFill.style.width = `${(queue.length ? (state.index / queue.length) * 100 : 0)}%`;
    if (statsDiv) statsDiv.innerText = `✔ ${state.stats.correct} ✖ ${state.stats.wrong}`;
  }

  // Show result
  function showResult() {
    const total = state.stats.correct + state.stats.wrong;
    const correctPercent = total ? ((state.stats.correct / total) * 100).toFixed(1) : 0;
    const wrongPercent = total ? ((state.stats.wrong / total) * 100).toFixed(1) : 0;
    if (qText) qText.innerText = "Тест завершён 🎉";
    if (answersDiv) answersDiv.innerHTML = `<div>Правильные: ${state.stats.correct} (${correctPercent}%)</div><div>Неправильные: ${state.stats.wrong} (${wrongPercent}%)</div>`;
    if (submitBtn) submitBtn.style.display = nextBtn.style.display = "none";
    if (exitErrorsBtn) exitErrorsBtn.style.display = "none";
  }

  // Reset
  if (resetBtn) resetBtn.onclick = () => {
    if (confirm("Вы уверены? Это удалит весь прогресс!")) {
      localStorage.removeItem("bioState");
      if (progressRef) {
        updateDoc(progressRef, {
          progress: JSON.stringify({
            queueType: "main",
            index: 0,
            mainIndex: 0,
            stats: { correct: 0, wrong: 0 },
            errors: [],
            errorAttempts: {},
            history: {},
            mainQueue: null,
            answersOrder: {},
            errorQueue: [],
            lastSyncTimestamp: Date.now()
          }),
          updatedAt: serverTimestamp()
        });
      }
      location.reload();
    }
  };

  // Загружаем вопросы
  loadQuestions();

  return {
    saveState,
    loadQuestions,
    render,
    unsubscribe: () => {
      // Функция для отписки
    }
  };
}

// Инициализация overlays
if (authOverlay) authOverlay.style.display = 'flex';
if (waitOverlay) waitOverlay.style.display = 'flex';

// Сделать initQuiz доступным глобально
window.initQuiz = initQuiz;
