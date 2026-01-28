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
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/* ====== СБРОС ПАРОЛЯ ПРИ ДОСТУПЕ ====== */
async function resetUserPassword(user) {
  if (passwordResetInProgress) {
    console.log('Сброс пароля уже в процессе');
    return;
  }
  
  passwordResetInProgress = true;
  const uDocRef = doc(db, 'users', user.uid);
  
  console.log(`🔄 Начинаем сброс пароля для ${user.email}`);
  
  try {
    // Проверяем данные пользователя
    const userDoc = await getDoc(uDocRef);
    if (!userDoc.exists()) {
      console.error('Документ пользователя не найден');
      passwordResetInProgress = false;
      return;
    }
    
    const userData = userDoc.data();
    
    // Если пароль уже меняли недавно (менее 10 секунд назад) - пропускаем
    if (userData.lastPasswordChange) {
      const lastChangeTime = userData.lastPasswordChange.toDate().getTime();
      const now = Date.now();
      if (now - lastChangeTime < 10000) {
        console.log('Пароль уже менялся недавно, пропускаем');
        passwordResetInProgress = false;
        return;
      }
    }
    
    // Генерируем новый пароль
    const newPassword = generateNewPassword();
    console.log(`🔧 Сгенерирован пароль для ${user.email}: ${newPassword}`);
    
    try {
      // Обновляем пароль в Firebase Auth
      console.log('Обновляем пароль в Firebase Auth...');
      await updatePassword(user, newPassword);
      console.log('✅ Пароль обновлен в Firebase Auth');
      
    } catch (authError) {
      console.error('❌ Ошибка обновления пароля в Auth:', authError);
      
      if (authError.code === 'auth/requires-recent-login') {
        console.log('⚠️ Требуется повторная аутентификация');
        setStatus('Требуется повторный вход для смены пароля', true);
        passwordResetInProgress = false;
        return;
      } else {
        console.error('Неизвестная ошибка аутентификации:', authError);
        passwordResetInProgress = false;
        return;
      }
    }
    
    // Сохраняем новый пароль в Firestore
    try {
      console.log('Сохраняем пароль в Firestore...');
      
      // Обновляем документ пользователя
      await updateDoc(uDocRef, {
        passwordChanged: true,
        currentPassword: newPassword,
        lastPasswordChange: serverTimestamp(),
        lastLogin: serverTimestamp()
      });
      
      // Ярко выводим пароль в консоль
      console.log(`%c✨✨✨ НОВЫЙ ПАРОЛЬ ✨✨✨`, 
                  "color: #4CAF50; font-weight: bold; font-size: 20px; background: #000; padding: 15px; border-radius: 10px;");
      console.log(`%c📧 Email: ${user.email}`, 
                  "color: #2196F3; font-size: 16px; font-weight: bold;");
      console.log(`%c🔑 Пароль: ${newPassword}`, 
                  "color: #FF9800; font-family: 'Courier New', monospace; font-size: 22px; font-weight: bold; background: #f0f0f0; padding: 15px; border: 3px solid #FF9800; border-radius: 8px;");
      console.log(`%c⚠️ ВАЖНО: Этот пароль нужно отправить пользователю! ⚠️`, 
                  "color: #f44336; font-weight: bold; font-size: 16px;");
      
    } catch (firestoreError) {
      console.error('❌ Ошибка сохранения пароля в Firestore:', firestoreError);
    }
    
  } catch (error) {
    console.error('❌ Общая ошибка сброса пароля:', error);
  } finally {
    setTimeout(() => {
      passwordResetInProgress = false;
    }, 3000);
  }
}

/* ====== ПАНЕЛЬ АДМИНИСТРАТОРА ====== */
async function setupAdminPanel(userEmail) {
  // Email админа - ЗАМЕНИТЕ НА СВОЙ EMAIL
  const adminEmail = "ваш_email@gmail.com"; // ⬅️ ИЗМЕНИТЕ НА ВАШ EMAIL
  
  // Создаем контейнер для админ панели, если его нет
  let adminContainer = document.getElementById('adminPanelContainer');
  if (!adminContainer) {
    adminContainer = document.createElement('div');
    adminContainer.id = 'adminPanelContainer';
    adminContainer.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 1000;
    `;
    document.body.appendChild(adminContainer);
  }
  
  // Очищаем контейнер
  adminContainer.innerHTML = '';
  
  // Проверяем, является ли пользователь админом
  if (userEmail !== adminEmail) {
    return; // Не админ - не показываем панель
  }
  
  console.log(`👑 Пользователь ${userEmail} является администратором`);
  
  // Создаем кнопку админа
  const adminBtn = document.createElement('button');
  adminBtn.innerHTML = '👑 Админ';
  adminBtn.style.cssText = `
    background: #FF9800;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    font-size: 14px;
  `;
  
  adminBtn.onclick = async () => {
    await showAdminPanel();
  };
  
  adminContainer.appendChild(adminBtn);
}

/* ====== ПОКАЗАТЬ ПАНЕЛЬ АДМИНИСТРАТОРА ====== */
async function showAdminPanel() {
  try {
    // Загружаем всех пользователей
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let usersHTML = '<div class="admin-modal-content">';
    usersHTML += '<h3>👥 Управление пользователями</h3>';
    usersHTML += '<button class="close-modal">✕</button>';
    
    let hasUsers = false;
    
    usersSnapshot.forEach(doc => {
      hasUsers = true;
      const data = doc.data();
      const lastChange = data.lastPasswordChange ? 
        new Date(data.lastPasswordChange.toDate()).toLocaleString() : 
        'Никогда';
      
      usersHTML += `
        <div class="admin-user-item">
          <strong>${data.email}</strong>
          <span class="admin-status ${data.allowed ? 'status-allowed' : 'status-pending'}">
            ${data.allowed ? '✅ Доступ открыт' : '❌ Ожидает'}
          </span>
          <br>
          ${data.currentPassword 
            ? `Текущий пароль: <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${data.currentPassword}</code><br>`
            : '<span style="color: #f00;">⚠️ Пароль не сгенерирован</span><br>'
          }
          Последняя смена пароля: ${lastChange}<br>
          <button class="force-reset-btn" onclick="forcePasswordReset('${doc.id}', '${data.email}')">
            🔄 Сбросить пароль
          </button>
        </div>
        <hr>
      `;
    });
    
    if (!hasUsers) {
      usersHTML += '<p>Пользователи не найдены</p>';
    }
    
    usersHTML += '</div>';
    
    // Показываем модальное окно
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = usersHTML;
    
    document.body.appendChild(modal);
    
    // Кнопка закрытия
    modal.querySelector('.close-modal').onclick = () => {
      document.body.removeChild(modal);
    };
    
    // Закрытие по клику вне модального окна
    modal.onclick = (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    };
    
  } catch (error) {
    console.error('Ошибка загрузки пользователей:', error);
    alert('Ошибка загрузки данных');
  }
}

/* ====== ФУНКЦИЯ ПРИНУДИТЕЛЬНОГО СБРОСА ПАРОЛЯ ====== */
window.forcePasswordReset = async function(userId, userEmail) {
  if (!confirm(`Сбросить пароль для ${userEmail}?\nНовый пароль будет сгенерирован.`)) return;
  
  try {
    // Генерируем новый пароль
    const newPassword = generateNewPassword();
    
    console.log(`🔧 Админ: генерируем пароль для ${userEmail}: ${newPassword}`);
    
    // Обновляем в Firestore
    await updateDoc(doc(db, 'users', userId), {
      currentPassword: newPassword,
      passwordChanged: true,
      lastPasswordChange: serverTimestamp()
    });
    
    alert(`✅ Пароль сброшен!\n\nEmail: ${userEmail}\nНовый пароль: ${newPassword}\n\nОтправьте этот пароль пользователю.`);
    
    console.log(`%c🔧 АДМИН: Принудительный сброс пароля`, 
                "color: #FF9800; font-weight: bold; font-size: 16px;");
    console.log(`%c📧 Email: ${userEmail}`, 
                "color: #2196F3; font-size: 14px;");
    console.log(`%c🔑 Пароль: ${newPassword}`, 
                "color: #FF9800; font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold;");
    
    // Закрываем модальное окно и открываем заново для обновления данных
    document.querySelector('.admin-modal')?.remove();
    await showAdminPanel();
    
  } catch (error) {
    console.error('Ошибка принудительного сброса:', error);
    alert('Ошибка сброса пароля: ' + error.message);
  }
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
    
    // Убираем админ панель при выходе
    const adminContainer = document.getElementById('adminPanelContainer');
    if (adminContainer) {
      adminContainer.innerHTML = '';
    }
    return;
  }

  // Пользователь вошёл
  if (authOverlay) {
    authOverlay.setAttribute('inert', '');
    authOverlay.style.display = 'none';
  }
  
  if (userEmailSpan) userEmailSpan.innerText = user.email || '';
  
  // Настройка панели админа
  await setupAdminPanel(user.email);

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
        lastLogin: null
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
        // Проверяем условия для сброса пароля:
        let shouldReset = false;
        let reason = '';
        
        if (!data.passwordChanged) {
          shouldReset = true;
          reason = 'пароль никогда не менялся';
        } else if (!data.currentPassword) {
          shouldReset = true;
          reason = 'текущий пароль отсутствует в базе';
        } else if (data.lastPasswordChange) {
          const lastChangeTime = data.lastPasswordChange.toDate().getTime();
          const now = Date.now();
          const oneMinute = 60 * 1000;
          if (now - lastChangeTime > oneMinute) {
            shouldReset = true;
            reason = 'прошло больше 1 минуты с последней смены';
          }
        }
        
        if (shouldReset && !passwordResetInProgress) {
          console.log(`🔄 Запуск сброса пароля (${reason})...`);
          // Даем время для загрузки интерфейса
          setTimeout(async () => {
            await resetUserPassword(user);
          }, 1000);
        } else if (passwordResetInProgress) {
          console.log('Сброс пароля уже в процессе...');
        } else {
          console.log('✅ Пароль уже актуален, сброс не требуется');
        }
      } catch (error) {
        console.error('Ошибка при проверке сброса пароля:', error);
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
                console.log('📥 Загрузка прогресса с сервера...');
                // Сохраняем текущий индекс и тип очереди
                const currentIndex = state.index;
                const currentQueueType = state.queueType;
                
                // Обновляем состояние
                Object.assign(state, savedState);
                state.lastSyncTimestamp = remoteTime;
                
                // Восстанавливаем текущую позицию если это возможно
                const queueLength = state.queueType === "main" ? 
                  (state.mainQueue?.length || 0) : 
                  (state.errorQueue?.length || 0);
                
                if (currentQueueType === state.queueType) {
                  state.index = Math.min(currentIndex, Math.max(0, queueLength - 1));
                }
                
                console.log('✅ Прогресс синхронизирован с сервером');
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
          email: auth.currentUser?.email || '',
          lastSync: Date.now()
        });
        console.log('📝 Создан новый документ прогресса');
      }
    } catch (e) { 
      console.error('Ошибка загрузки прогресса:', e); 
    }
    
    // Загружаем вопросы после загрузки прогресса
    loadQuestions();
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
      }).then(() => {
        console.log('💾 Прогресс сохранен в Firestore');
      }).catch(err => {
        console.error('Ошибка сохранения прогресса:', err);
      });
    }
  }

  // Shuffle функция
  function shuffleArray(arr) {
    const newArr = [...arr];
    for (let i = newArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
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
          mainQueue = shuffleArray(mainQueue);
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
          const shuffledFloating = shuffleArray(floating);
          freeIndexes.forEach((pos, i) => mainQueue[pos] = shuffledFloating[i]);
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
            order = shuffleArray(order);
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
        console.error('Ошибка загрузки вопросов:', err);
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

    const btnNumber = parseInt(btn.innerText) - 1;
    if (state.index === btnNumber) {
      btn.style.border = "2px solid #2196F3";
      btn.style.boxShadow = "0 0 8px rgba(33,150,243,0.7)";
    } else {
      btn.style.border = btn.style.borderColor ? `1px solid ${btn.style.borderColor}` : "1px solid #ccc";
      btn.style.boxShadow = "none";
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
      const resetState = {
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
      
      localStorage.removeItem("bioState");
      
      if (progressRef) {
        updateDoc(progressRef, {
          progress: JSON.stringify(resetState),
          updatedAt: serverTimestamp()
        }).then(() => {
          location.reload();
        }).catch(err => {
          console.error('Ошибка сброса:', err);
          location.reload();
        });
      } else {
        location.reload();
      }
    }
  };

  return {
    saveState,
    loadQuestions,
    render,
    unsubscribe: () => {
      if (progressUnsubscribe) {
        progressUnsubscribe();
      }
    }
  };
}

// Инициализация overlays
if (authOverlay) authOverlay.style.display = 'flex';
if (waitOverlay) waitOverlay.style.display = 'none';

// Сделать initQuiz доступным глобально
window.initQuiz = initQuiz;
