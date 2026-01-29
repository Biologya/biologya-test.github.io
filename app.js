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
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  arrayUnion,
  arrayRemove,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

/* ====== КОНФИГ FIREBASE ====== */
  const firebaseConfig = {
    apiKey: "AIzaSyCearT2OVf-Pvw_o9YrkzUF7bGxWeo0F88",
    authDomain: "biobase-1b1db.firebaseapp.com",
    projectId: "biobase-1b1db",
    storageBucket: "biobase-1b1db.firebasestorage.app",
    messagingSenderId: "671663551167",
    appId: "1:671663551167:web:fd7635462011123b5a0c0a",
    measurementId: "G-TJZREPWP5B"
  };


/* ====== КОЛЛЕКЦИИ FIREBASE ====== */
const USERS_COLLECTION = "users";
const ADMIN_LOGS_COLLECTION = "admin_logs";
const QUIZ_ANALYTICS_COLLECTION = "quiz_analytics";
const SESSIONS_SUBCOLLECTION = "sessions";
const USERS_PROGRESS_COLLECTION = "users_progress";

/* ====== КОНФИГУРАЦИЯ АДМИНИСТРАТОРА ====== */
const ADMIN_EMAIL = "faceits1mple2000@gmail.com";
const ADMIN_STATIC_PASSWORD = "20092009";

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
let passwordResetInProgress = false;
let userUnsubscribe = null;
let sessionCheckInterval = null;
let deviceId = null;

/* ====== СИСТЕМА СЕССИЙ ====== */
function generateDeviceId() {
  let storedId = localStorage.getItem('deviceId');
  if (!storedId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomPart = '';
    for (let i = 0; i < 8; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    storedId = `${randomPart}_${Date.now()}`;
    localStorage.setItem('deviceId', storedId);
  }
  return storedId;
}

async function registerSession(userId) {
  if (!deviceId) deviceId = generateDeviceId();
  
  const sessionData = {
    deviceId: deviceId,
    userAgent: navigator.userAgent.substring(0, 100),
    platform: navigator.platform,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    ipAddress: await getIPAddress(),
    isActive: true,
    firstSeen: serverTimestamp(),
    lastActive: serverTimestamp()
  };
  
  const sessionRef = doc(db, USERS_COLLECTION, userId, SESSIONS_SUBCOLLECTION, deviceId);
  const userRef = doc(db, USERS_COLLECTION, userId);
  
  try {
    const batch = writeBatch(db);
    batch.set(sessionRef, sessionData, { merge: true });
    batch.update(userRef, {
      activeSessions: arrayUnion(deviceId),
      lastSeen: serverTimestamp()
    });
    await batch.commit();
  } catch (error) {
    console.error('Ошибка регистрации сессии:', error);
  }
}

async function getIPAddress() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    return 'unknown';
  }
}

async function updateSessionActivity(userId) {
  if (!deviceId || !userId) return;
  
  const sessionRef = doc(db, USERS_COLLECTION, userId, SESSIONS_SUBCOLLECTION, deviceId);
  const userRef = doc(db, USERS_COLLECTION, userId);
  
  try {
    const batch = writeBatch(db);
    batch.update(sessionRef, {
      lastActive: serverTimestamp(),
      isActive: true
    });
    batch.update(userRef, {
      lastSeen: serverTimestamp()
    });
    await batch.commit();
  } catch (error) {
    if (error.code === 'not-found') {
      await registerSession(userId);
    }
  }
}

async function checkActiveSessions(userId, userEmail) {
  try {
    if (userEmail === ADMIN_EMAIL) return;
    
    const sessionsQuery = query(
      collection(db, USERS_COLLECTION, userId, SESSIONS_SUBCOLLECTION),
      where("isActive", "==", true),
      where("deviceId", "!=", deviceId)
    );
    
    const sessionsSnapshot = await getDocs(sessionsQuery);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    let activeOtherSessions = [];
    
    sessionsSnapshot.forEach((docSnap) => {
      const session = docSnap.data();
      const lastActive = session.lastActive?.toDate?.()?.getTime() || 0;
      const isRecentlyActive = (now - lastActive) <= fiveMinutes;
      
      if (isRecentlyActive) {
        activeOtherSessions.push({
          deviceId: session.deviceId,
          userAgent: session.userAgent,
          lastActive: new Date(lastActive).toLocaleString(),
          platform: session.platform,
          ipAddress: session.ipAddress
        });
      }
    });
    
    if (activeOtherSessions.length > 3) {
      await updateDoc(doc(db, USERS_COLLECTION, userId), {
        securityAlerts: arrayUnion({
          type: 'multiple_sessions_detected',
          count: activeOtherSessions.length,
          timestamp: serverTimestamp(),
          currentDevice: deviceId,
          otherDevices: activeOtherSessions
        })
      });
      
      if (!sessionStorage.getItem('sessionWarningShown')) {
        const warningMsg = `
        ⚠️ ВНИМАНИЕ! Обнаружено ${activeOtherSessions.length} активных сессий на других устройствах.
        
        ${activeOtherSessions.map(s => 
          `• Устройство: ${s.deviceId.substring(0, 8)}... (${s.platform})\n  IP: ${s.ipAddress}\n  Последняя активность: ${s.lastActive}`
        ).join('\n')}
        
        Если это не вы, срочно смените пароль!
        `;
        
        alert(warningMsg);
        sessionStorage.setItem('sessionWarningShown', 'true');
      }
    }
  } catch (error) {
    console.error('Ошибка проверки сессий:', error);
  }
}

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
          await setDoc(doc(db, USERS_COLLECTION, cred.user.uid), {
            email: email,
            allowed: false,
            createdAt: serverTimestamp(),
            originalPassword: password,
            passwordChanged: false,
            currentPassword: null,
            lastLogin: null,
            activeSessions: [],
            securityAlerts: []
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
async function handleLogout() {
  const user = auth.currentUser;
  
  if (user && deviceId) {
    try {
      const batch = writeBatch(db);
      const sessionRef = doc(db, USERS_COLLECTION, user.uid, SESSIONS_SUBCOLLECTION, deviceId);
      const userRef = doc(db, USERS_COLLECTION, user.uid);
      
      batch.update(sessionRef, {
        isActive: false,
        lastActive: serverTimestamp(),
        logoutAt: serverTimestamp()
      });
      
      batch.update(userRef, {
        activeSessions: arrayRemove(deviceId)
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Ошибка завершения сессии:', error);
    }
  }
  
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
  
  await signOut(auth);
  sessionStorage.removeItem('sessionWarningShown');
}

if (logoutBtn) logoutBtn.onclick = async () => { 
  await handleLogout(); 
  setStatus('Вы вышли из системы.');
};

if (signOutFromWait) signOutFromWait.onclick = async () => { 
  await handleLogout();
  setStatus('Вы вышли из системы.');
};

if (helpBtn) helpBtn.onclick = () => { 
  alert('Админ: Firebase Console → Firestore → collection "users" → поставьте allowed = true.'); 
};

/* ====== ГЕНЕРАЦИЯ ПАРОЛЯ ====== */
function generateNewPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/* ====== СБРОС ПАРОЛЯ ====== */
async function resetUserPassword(user) {
  if (passwordResetInProgress) return;
  
  if (user.email === ADMIN_EMAIL) {
    await updateDoc(doc(db, USERS_COLLECTION, user.uid), {
      currentPassword: ADMIN_STATIC_PASSWORD,
      passwordChanged: true,
      lastPasswordChange: serverTimestamp(),
      isAdmin: true,
      lastLogin: serverTimestamp(),
      lastSeen: serverTimestamp()
    });
    passwordResetInProgress = false;
    return;
  }
  
  passwordResetInProgress = true;
  const uDocRef = doc(db, USERS_COLLECTION, user.uid);
  
  try {
    const userDoc = await getDoc(uDocRef);
    if (!userDoc.exists()) {
      passwordResetInProgress = false;
      return;
    }
    
    const userData = userDoc.data();
    
    if (!userData.currentPassword) {
      const newPassword = generateNewPassword();
      
      try {
        await updatePassword(user, newPassword);
      } catch (authError) {
        console.error('Ошибка обновления пароля в Auth:', authError);
      }
      
      await updateDoc(uDocRef, {
        passwordChanged: true,
        currentPassword: newPassword,
        lastPasswordChange: serverTimestamp(),
        lastLogin: serverTimestamp(),
        lastSeen: serverTimestamp()
      });
      
      console.log(`%c✨✨✨ НОВЫЙ ПАРОЛЬ ✨✨✨`, 
                  "color: #4CAF50; font-weight: bold; font-size: 20px;");
      console.log(`%c📧 Email: ${user.email}`, 
                  "color: #2196F3; font-size: 16px; font-weight: bold;");
      console.log(`%c🔑 Пароль: ${newPassword}`, 
                  "color: #FF9800; font-family: 'Courier New', monospace; font-size: 22px;");
    } else {
      await updateDoc(uDocRef, {
        lastLogin: serverTimestamp(),
        lastSeen: serverTimestamp()
      });
    }
    
  } catch (error) {
    console.error('Ошибка проверки пароля:', error);
  } finally {
    setTimeout(() => {
      passwordResetInProgress = false;
    }, 3000);
  }
}

/* ====== ПАНЕЛЬ АДМИНИСТРАТОРА ====== */
async function setupAdminPanel(userEmail) {
  try {
    if (userEmail !== ADMIN_EMAIL) {
      const adminContainer = document.getElementById('adminPanelContainer');
      if (adminContainer) adminContainer.style.display = 'none';
      return;
    }
    
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
    
    adminContainer.innerHTML = '';
    adminContainer.style.display = 'block';
    
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
    
  } catch (error) {
    console.error('Ошибка настройки админ панели:', error);
  }
}

/* ====== ФУНКЦИЯ ПОКАЗА АДМИН ПАНЕЛИ ====== */
async function showAdminPanel() {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert('Пользователь не авторизован');
      return;
    }
    
    if (currentUser.email !== ADMIN_EMAIL) {
      alert('❌ Недостаточно прав. Только администратор может открыть эту панель.');
      return;
    }
    
    console.log(`👑 Администратор ${currentUser.email} открывает панель управления`);
    
    // Создаем модальное окно
    let usersHTML = '<div class="admin-modal-content">';
    usersHTML += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">';
    usersHTML += '<h3>👥 Управление пользователями</h3>';
    usersHTML += '<div>';
    usersHTML += '<button onclick="refreshAdminPanel()" style="background: #2196F3; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">🔄 Обновить</button>';
    usersHTML += '<button onclick="showAllSessions()" style="background: #9C27B0; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">👁️ Все сессии</button>';
    usersHTML += '<button onclick="cleanupOldSessions()" style="background: #f44336; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">🧹 Очистить старые</button>';
    usersHTML += '</div>';
    usersHTML += '</div>';
    usersHTML += '<button class="close-modal">✕</button>';

    usersHTML += `
  <div style="margin-bottom: 20px; padding: 15px; background: #f0f8ff; border-radius: 8px; border: 2px solid #2196F3;">
    <h4 style="margin-top: 0; color: #2196F3;">🚀 Массовые операции с доступом</h4>
    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
      <button onclick="bulkAccessControl('grant_all')" 
              style="background: #4CAF50; color: white; padding: 10px 16px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
        ✅ Открыть доступ ВСЕМ
      </button>
      <button onclick="bulkAccessControl('revoke_all')" 
              style="background: #f44336; color: white; padding: 10px 16px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
        ❌ Закрыть доступ ВСЕМ
      </button>
      <button onclick="showAccessStatistics()" 
              style="background: #9C27B0; color: white; padding: 10px 16px; border: none; border-radius: 5px; cursor: pointer;">
        📊 Статистика доступа
      </button>
    </div>
    <p style="margin-top: 10px; color: #666; font-size: 12px;">
      ⚠️ Внимание: закрытие доступа завершит все активные сессии пользователей
    </p>
  </div>
`;    
    
    // Показываем загрузку
    usersHTML += '<div id="adminLoading" style="text-align: center; padding: 40px;">';
    usersHTML += '<div style="display: inline-block; padding: 20px; background: #f5f5f5; border-radius: 10px;">';
    usersHTML += '<div class="spinner"></div>';
    usersHTML += '<p style="margin-top: 10px; color: #666;">Загрузка пользователей...</p>';
    usersHTML += '</div>';
    usersHTML += '</div>';
    
    usersHTML += '<div id="usersList" style="display: none;"></div>';
    usersHTML += '</div>';
    
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = usersHTML;
    
    document.body.appendChild(modal);
    
    // Закрытие модального окна
    modal.querySelector('.close-modal').onclick = () => {
      document.body.removeChild(modal);
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    };
    
    // Загружаем пользователей асинхронно
    loadUsersList();
    
    // Функция загрузки пользователей с подсчетом активных сессий
    async function loadUsersList() {
      try {
        const usersListDiv = document.getElementById('usersList');
        const loadingDiv = document.getElementById('adminLoading');
        
        if (!usersListDiv || !loadingDiv) return;
        
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const usersWithSessions = [];
        
        // Собираем всех пользователей
        for (const docSnap of usersSnapshot.docs) {
          const data = docSnap.data();
          const userId = docSnap.id;
          if (!data.email) continue;
          
          usersWithSessions.push({
            id: userId,
            data: data,
            activeSessionCount: 0 // Заполним позже
          });
        }
        
        // Для каждого пользователя загружаем активные сессии
        for (const user of usersWithSessions) {
          try {
            const sessionsSnapshot = await getDocs(collection(db, 'users', user.id, 'sessions'));
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            let activeCount = 0;
            
            sessionsSnapshot.forEach((sessionDoc) => {
              const session = sessionDoc.data();
              const lastActive = session.lastActive?.toDate?.()?.getTime() || 0;
              const isActive = session.isActive !== false && (now - lastActive) <= fiveMinutes;
              
              if (isActive) {
                activeCount++;
              }
            });
            
            user.activeSessionCount = activeCount;
          } catch (sessionError) {
            console.log(`Не удалось загрузить сессии для ${user.data.email}:`, sessionError.message);
            user.activeSessionCount = 0;
          }
        }
        
        // Сортируем
        usersWithSessions.sort((a, b) => {
          // Сначала администраторы
          if (a.data.email === ADMIN_EMAIL || a.data.isAdmin === true) return -1;
          if (b.data.email === ADMIN_EMAIL || b.data.isAdmin === true) return 1;
          
          // Затем пользователи с доступом
          if (a.data.allowed && !b.data.allowed) return -1;
          if (!a.data.allowed && b.data.allowed) return 1;
          
          // Затем пользователи с >3 сессиями
          const aManySessions = a.activeSessionCount > 3;
          const bManySessions = b.activeSessionCount > 3;
          if (aManySessions && !bManySessions) return -1;
          if (!aManySessions && bManySessions) return 1;
          
          // Затем по email
          return a.data.email.localeCompare(b.data.email);
        });
        
        // Генерируем HTML
        let usersListHTML = '';
        
        usersWithSessions.forEach(user => {
          const data = user.data;
          const userId = user.id;
          const activeSessionCount = user.activeSessionCount;
          const isUserAdmin = data.email === ADMIN_EMAIL || data.isAdmin === true;
          const hasManySessions = activeSessionCount > 3;
          const hasAccess = data.allowed === true;
          
          // Определяем стиль в зависимости от статуса
          let itemStyle = '';
          if (isUserAdmin) {
            itemStyle = 'background: #FFF8E1; border-left: 5px solid #FF9800;';
          } else if (!hasAccess) {
            itemStyle = 'background: #f5f5f5; border-left: 5px solid #9E9E9E;';
          } else if (hasManySessions) {
            itemStyle = 'background: #FFEBEE; border-left: 5px solid #f44336;';
          } else if (activeSessionCount > 0) {
            itemStyle = 'background: #E8F5E9; border-left: 5px solid #4CAF50;';
          } else {
            itemStyle = 'background: #f9f9f9; border-left: 5px solid #9E9E9E;';
          }
          
          usersListHTML += `
            <div class="admin-user-item" style="${itemStyle} padding: 15px; border-radius: 5px; margin-bottom: 15px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <strong style="font-size: 16px;">${data.email}</strong>
                    ${isUserAdmin ? '<span style="color: #FF9800; font-weight: bold; background: #FFECB3; padding: 2px 8px; border-radius: 10px; font-size: 12px;">👑 АДМИН</span>' : ''}
                    <span class="admin-status ${hasAccess ? 'status-allowed' : 'status-pending'}" 
                          style="display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; 
                                 background: ${hasAccess ? '#4CAF50' : '#FF9800'}; color: white; cursor: pointer;"
                          onclick="toggleUserAccess('${userId}', '${data.email}', ${hasAccess})">
                      ${hasAccess ? '✅ Доступ открыт (нажми чтобы закрыть)' : '❌ Доступ закрыт (нажми чтобы открыть)'}
                    </span>
                  </div>
                  
                  <div style="margin-bottom: 10px; font-size: 14px; color: #666;">
                    ${data.currentPassword 
                      ? `Пароль: <code style="background: ${isUserAdmin ? '#FFECB3' : '#f5f5f5'}; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-weight: ${isUserAdmin ? 'bold' : 'normal'};">${data.currentPassword}</code>` 
                      : '<span style="color: #f00;">⚠️ Пароль не сгенерирован</span>'
                    }
                  </div>
                  
                  <div style="display: flex; gap: 20px; margin-bottom: 15px; font-size: 13px; color: #777;">
                    ${data.lastLogin 
                      ? `<div>📅 Вход: ${new Date(data.lastLogin?.toDate()).toLocaleString()}</div>` 
                      : '<div>📅 Вход: никогда</div>'
                    }
                    ${data.lastSeen 
                      ? `<div>👁️ Активность: ${new Date(data.lastSeen?.toDate()).toLocaleString()}</div>` 
                      : ''
                    }
                    <div style="color: ${hasManySessions ? '#f44336' : (activeSessionCount > 0 ? '#4CAF50' : '#9E9E9E')}; font-weight: ${hasManySessions ? 'bold' : 'normal'};">
                      📱 Сессий: ${activeSessionCount}
                      ${hasManySessions ? ' ⚠️' : ''}
                    </div>
                  </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 5px; min-width: 200px;">
                  <button class="force-reset-btn" onclick="forcePasswordReset('${userId}', '${data.email}')" 
                          style="width: 100%; text-align: left; background: #FF9800; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
                    🔄 Сбросить пароль
                  </button>
                  
                  <button class="view-sessions-btn" onclick="viewUserSessions('${userId}', '${data.email}')" 
                          style="width: 100%; text-align: left; background: #9C27B0; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
                    📱 Управление сессиями (${activeSessionCount})
                  </button>
                  
                  ${hasAccess ? 
                    `<button class="terminate-all-btn" onclick="terminateAllSessions('${userId}', '${data.email}')" 
                            style="width: 100%; text-align: left; background: #f44336; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;">
                      🚫 Завершить все сессии
                    </button>` 
                    : ''
                  }
                  
                  ${hasManySessions ? 
                    `<button class="alert-btn" onclick="alertUser('${userId}', '${data.email}')" 
                            style="width: 100%; text-align: left; background: #FF5722; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
                      ⚠️ Предупредить пользователя
                    </button>` 
                    : ''
                  }
                </div>
              </div>
            </div>
          `;
        });
        
        // Статистика
        const totalUsers = usersWithSessions.length;
        const usersWithAccess = usersWithSessions.filter(u => u.data.allowed).length;
        const usersWithManySessions = usersWithSessions.filter(u => u.activeSessionCount > 3).length;
        const totalActiveSessions = usersWithSessions.reduce((sum, u) => sum + u.activeSessionCount, 0);
        
        usersListHTML = `
          <div style="background: #E3F2FD; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #2196F3;">
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; text-align: center;">
              <div>
                <div style="font-size: 24px; font-weight: bold; color: #2196F3;">${totalUsers}</div>
                <div style="font-size: 12px; color: #666;">Всего пользователей</div>
              </div>
              <div>
                <div style="font-size: 24px; font-weight: bold; color: #4CAF50;">${usersWithAccess}</div>
                <div style="font-size: 12px; color: #666;">С доступом</div>
              </div>
              <div>
                <div style="font-size: 24px; font-weight: bold; color: ${usersWithManySessions > 0 ? '#f44336' : '#4CAF50'};">${usersWithManySessions}</div>
                <div style="font-size: 12px; color: #666;">>3 сессий</div>
              </div>
              <div>
                <div style="font-size: 24px; font-weight: bold; color: #9C27B0;">${totalActiveSessions}</div>
                <div style="font-size: 12px; color: #666;">Активных сессий</div>
              </div>
            </div>
            <div style="margin-top: 15px; font-size: 14px; color: #666;">
              💡 <strong>Инструкция:</strong> Нажмите на статус пользователя (зеленый/оранжевый) чтобы открыть/закрыть доступ
            </div>
            ${usersWithManySessions > 0 ? 
              `<div style="margin-top: 15px; padding: 10px; background: #FFF3E0; border-radius: 5px; border-left: 4px solid #FF9800; font-size: 14px;">
                ⚠️ Внимание: ${usersWithManySessions} пользователей имеют более 3 активных сессий. Рекомендуется проверить на предмет несанкционированного доступа.
              </div>` 
              : ''
            }
          </div>
          ${usersListHTML}
        `;
        
        // Обновляем DOM
        usersListDiv.innerHTML = usersListHTML;
        loadingDiv.style.display = 'none';
        usersListDiv.style.display = 'block';
        
      } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        const usersListDiv = document.getElementById('usersList');
        const loadingDiv = document.getElementById('adminLoading');
        
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (usersListDiv) {
          usersListDiv.innerHTML = `
            <div style="color: #f44336; padding: 40px; text-align: center;">
              <strong>Ошибка загрузки пользователей:</strong><br>
              ${error.message}<br>
              <small>Проверьте права доступа в правилах Firestore</small>
              <div style="margin-top: 20px;">
                <button onclick="loadUsersList()" style="background: #2196F3; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer;">
                  🔄 Повторить
                </button>
              </div>
            </div>
          `;
          usersListDiv.style.display = 'block';
        }
      }
    }
    
    // Глобальная функция обновления
    window.refreshAdminPanel = function() {
      const usersListDiv = document.getElementById('usersList');
      const loadingDiv = document.getElementById('adminLoading');
      
      if (loadingDiv) loadingDiv.style.display = 'block';
      if (usersListDiv) usersListDiv.style.display = 'none';
      
      loadUsersList();
    };
    
  } catch (error) {
    console.error('Ошибка открытия админ панели:', error);
    alert('Ошибка открытия админ панели: ' + error.message);
  }
}

/* ====== ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ ДОСТУПА ====== */
window.toggleUserAccess = async function(userId, userEmail, currentAccess) {
  const newAccess = !currentAccess;
  
  const confirmMsg = newAccess 
    ? `Открыть доступ пользователю ${userEmail}?\n\nПосле этого:`
    : `Закрыть доступ пользователю ${userEmail}?\n\nПосле этого:`;
  
  const details = newAccess 
    ? `• Пользователь сможет войти в систему\n• Будет автоматически сгенерирован пароль\n• Пароль появится в этом окне`
    : `• Пользователь будет разлогинен\n• Все его сессии будут завершены\n• При следующем входе потребуется повторное открытие доступа`;
  
  if (!confirm(`${confirmMsg}\n${details}`)) return;
  
  try {
    // Обновляем доступ в Firestore
    const userRef = doc(db, 'users', userId);
    
    const updateData = {
      allowed: newAccess,
      [`status_${Date.now()}`]: {
        action: newAccess ? 'access_granted' : 'access_revoked',
        by: auth.currentUser?.email || 'admin',
        timestamp: serverTimestamp()
      }
    };
    
    // Если закрываем доступ - завершаем все сессии
    if (!newAccess && currentAccess) {
      updateData.activeSessions = [];
      
      // Завершаем все активные сессии
      const sessionsSnapshot = await getDocs(collection(db, 'users', userId, 'sessions'));
      const batchPromises = [];
      
      sessionsSnapshot.forEach(sessionDoc => {
        const sessionRef = doc(db, 'users', userId, 'sessions', sessionDoc.id);
        batchPromises.push(
          updateDoc(sessionRef, {
            isActive: false,
            accessRevoked: true,
            revokedAt: serverTimestamp()
          })
        );
      });
      
      await Promise.all(batchPromises);
    }
    
    await updateDoc(userRef, updateData);
    
    // Если открываем доступ - показываем пароль
    if (newAccess && !currentAccess) {
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data();
      
      let passwordMsg = '';
      if (userData.currentPassword) {
        passwordMsg = `\n🔑 Текущий пароль: ${userData.currentPassword}\nПользователь может использовать его для входа.`;
      } else {
        passwordMsg = `\n⚠️ Пароль будет сгенерирован при первом входе пользователя.`;
      }
      
      alert(`✅ Доступ ${newAccess ? 'открыт' : 'закрыт'} для ${userEmail}${passwordMsg}`);
    } else {
      alert(`✅ Доступ ${newAccess ? 'открыт' : 'закрыт'} для ${userEmail}`);
    }
    
    // Логируем действие
    await updateDoc(doc(db, 'admin_logs', `${Date.now()}_${userId}`), {
      userId: userId,
      userEmail: userEmail,
      action: newAccess ? 'access_granted' : 'access_revoked',
      admin: auth.currentUser?.email || 'unknown',
      timestamp: serverTimestamp(),
      details: `Changed access from ${currentAccess} to ${newAccess}`
    });
    
    // Обновляем панель
    window.refreshAdminPanel();
    
  } catch (error) {
    console.error('Ошибка переключения доступа:', error);
    alert(`❌ Ошибка: ${error.message}`);
  }
};

/* ====== ФУНКЦИЯ МАССОВОГО УПРАВЛЕНИЯ ДОСТУПОМ ====== */
window.bulkAccessControl = async function(action) {
  // action: 'grant_all', 'revoke_all', 'grant_selected', 'revoke_selected'
  
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const users = [];
    
    usersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.email && data.email !== ADMIN_EMAIL) {
        users.push({
          id: docSnap.id,
          email: data.email,
          allowed: data.allowed || false
        });
      }
    });
    
    let confirmMsg = '';
    let newAccess = true;
    
    switch(action) {
      case 'grant_all':
        confirmMsg = `Вы уверены, что хотите открыть доступ ВСЕМ ${users.length} пользователям?`;
        newAccess = true;
        break;
      case 'revoke_all':
        confirmMsg = `Вы уверены, что хотите закрыть доступ ВСЕМ ${users.length} пользователям?\n\nВсе пользователи будут разлогинены!`;
        newAccess = false;
        break;
      default:
        return;
    }
    
    if (!confirm(confirmMsg)) return;
    
    // Показываем прогресс
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div class="admin-modal" style="display: flex;">
        <div class="admin-modal-content" style="max-width: 500px;">
          <h3>${newAccess ? '📈 Открытие доступа' : '📉 Закрытие доступа'}</h3>
          <p id="bulkProgress">Начинаем обработку...</p>
          <div id="progressBar" style="height: 10px; background: #eee; border-radius: 5px; margin: 10px 0; overflow: hidden;">
            <div id="progressFill" style="height: 100%; width: 0%; background: #4CAF50; transition: width 0.3s;"></div>
          </div>
          <div id="statusText" style="color: #666; font-size: 12px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Выполняем массовое обновление
    let completed = 0;
    const total = users.length;
    
    for (const user of users) {
      try {
        await updateDoc(doc(db, 'users', user.id), {
          allowed: newAccess,
          ...(newAccess === false ? { activeSessions: [] } : {})
        });
        
        completed++;
        const percent = Math.round((completed / total) * 100);
        
        document.getElementById('bulkProgress').innerText = 
          `${newAccess ? 'Открываем доступ' : 'Закрываем доступ'}: ${completed} из ${total}`;
        document.getElementById('progressFill').style.width = `${percent}%`;
        document.getElementById('statusText').innerText = 
          `Обработан: ${user.email} (${user.allowed ? 'был доступ' : 'без доступа'})`;
        
        // Небольшая задержка чтобы не перегружать Firestore
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (userError) {
        console.error(`Ошибка для пользователя ${user.email}:`, userError);
      }
    }
    
    setTimeout(() => {
      document.body.removeChild(modal);
      alert(`✅ Массовое обновление завершено!\n\nОбработано: ${completed} из ${total} пользователей\nДоступ: ${newAccess ? 'открыт' : 'закрыт'}`);
      window.refreshAdminPanel();
    }, 1000);
    
  } catch (error) {
    console.error('Ошибка массового управления доступом:', error);
    alert(`❌ Ошибка массового управления: ${error.message}`);
  }
};

/* ====== ФУНКЦИИ ДЛЯ АДМИНИСТРАТОРА ====== */

// Очистить старые сессии
window.cleanupOldSessions = async function() {
  if (!confirm('Очистить все неактивные сессии (старше 5 минут)?')) return;
  
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    let cleanedCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const sessionsSnapshot = await getDocs(collection(db, 'users', userDoc.id, 'sessions'));
      
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionData = sessionDoc.data();
        const lastActive = sessionData.lastActive?.toDate?.()?.getTime() || 0;
        
        if (now - lastActive > fiveMinutes) {
          await updateDoc(doc(db, 'users', userDoc.id, 'sessions', sessionDoc.id), {
            isActive: false
          });
          
          await updateDoc(doc(db, 'users', userDoc.id), {
            activeSessions: arrayRemove(sessionData.deviceId),
            [`session_${sessionData.deviceId}.isActive`]: false
          });
          
          cleanedCount++;
        }
      }
    }
    
    alert(`✅ Очищено ${cleanedCount} неактивных сессий`);
    
    document.querySelector('.admin-modal')?.remove();
    await showAdminPanel();
    
  } catch (error) {
    console.error('Ошибка очистки сессий:', error);
    alert('Ошибка очистки сессий: ' + error.message);
  }
};

// Завершить все сессии пользователя (кроме текущей)
window.terminateAllSessions = async function(userId, userEmail) {
  const currentUser = auth.currentUser;
  const isCurrentUser = currentUser && currentUser.uid === userId;
  
  if (!confirm(`Завершить ВСЕ сессии пользователя ${userEmail}?\n${isCurrentUser ? '⚠️ Ваша текущая сессия не будет завершена.' : 'Все устройства будут разлогинены.'}`)) return;
  
  try {
    const sessionsSnapshot = await getDocs(collection(db, 'users', userId, 'sessions'));
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    let terminatedCount = 0;
    
    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionData = sessionDoc.data();
      const lastActive = sessionData.lastActive?.toDate?.()?.getTime() || 0;
      const isRecentlyActive = (now - lastActive) <= fiveMinutes;
      
      // Не завершаем текущую сессию, если это текущий пользователь
      if (isCurrentUser && sessionData.deviceId === deviceId) {
        console.log('Пропускаем текущую сессию');
        continue;
      }
      
      // Завершаем только активные сессии
      if (isRecentlyActive && sessionData.isActive !== false) {
        await updateDoc(doc(db, 'users', userId, 'sessions', sessionDoc.id), {
          isActive: false,
          terminatedBy: currentUser?.email || 'admin',
          terminatedAt: serverTimestamp()
        });
        
        await updateDoc(doc(db, 'users', userId), {
          activeSessions: arrayRemove(sessionData.deviceId),
          [`session_${sessionData.deviceId}.isActive`]: false,
          [`session_${sessionData.deviceId}.terminatedAt`]: serverTimestamp()
        });
        
        terminatedCount++;
      }
    }
    
    alert(`✅ Завершено ${terminatedCount} активных сессий пользователя ${userEmail}`);
    
    // Обновляем панель админа
    document.querySelector('.admin-modal')?.remove();
    await showAdminPanel();
    
  } catch (error) {
    console.error('Ошибка завершения сессий:', error);
    alert('Ошибка завершения сессий: ' + error.message);
  }
};

// Завершить конкретную сессию
window.terminateSession = async function(userId, sessionDeviceId, userEmail) {
  if (!confirm(`Завершить сессию устройства ${sessionDeviceId.substring(0, 12)}...?\nПользователь ${userEmail} будет разлогинен на этом устройстве.`)) return;
  
  try {
    await updateDoc(doc(db, 'users', userId, 'sessions', sessionDeviceId), {
      isActive: false,
      terminatedBy: auth.currentUser?.email || 'admin',
      terminatedAt: serverTimestamp()
    });
    
    await updateDoc(doc(db, 'users', userId), {
      activeSessions: arrayRemove(sessionDeviceId),
      [`session_${sessionDeviceId}.isActive`]: false,
      [`session_${sessionDeviceId}.terminatedAt`]: serverTimestamp(),
      securityAlerts: arrayUnion({
        type: 'session_terminated_by_admin',
        deviceId: sessionDeviceId,
        timestamp: serverTimestamp(),
        message: `Сессия завершена администратором`
      })
    });
    
    alert('✅ Сессия завершена');
    
    // Обновляем панель админа
    document.querySelector('.admin-modal')?.remove();
    await showAdminPanel();
    
  } catch (error) {
    console.error('Ошибка завершения сессии:', error);
    alert('Ошибка завершения сессии: ' + error.message);
  }
};

// Просмотр сессий пользователя - ИЗМЕНЕНО: показываем только активные
window.viewUserSessions = async function(userId, userEmail) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert('Пользователь не авторизован');
      return;
    }
    
    if (currentUser.email !== ADMIN_EMAIL) {
      alert('❌ Недостаточно прав. Только администратор может просматривать сессии.');
      return;
    }
    
    let sessionsHTML = '<div class="admin-modal-content" style="max-width: 900px;">';
    sessionsHTML += `<h3>📱 Сессии пользователя: ${userEmail}</h3>`;
    sessionsHTML += '<button class="close-modal">✕</button>';
    
    // Кнопки управления
    sessionsHTML += `
      <div style="margin-bottom: 20px; display: flex; gap: 10px;">
        <button onclick="terminateAllSessions('${userId}', '${userEmail}')" 
                style="background: #f44336; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
          🚫 Завершить все сессии
        </button>
        <button onclick="refreshSessionsView('${userId}', '${userEmail}')" 
                style="background: #2196F3; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">
          🔄 Обновить
        </button>
      </div>
    `;
    
    try {
      const sessionsSnapshot = await getDocs(collection(db, 'users', userId, 'sessions'));
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      let activeSessions = [];
      let inactiveSessions = [];
      let totalActive = 0;
      
      if (sessionsSnapshot.empty) {
        sessionsHTML += '<p style="color: #666; text-align: center; padding: 20px;">Нет данных о сессиях</p>';
      } else {
        sessionsSnapshot.forEach(docSnap => {
          const session = docSnap.data();
          const lastActive = session.lastActive?.toDate?.()?.getTime() || 0;
          const isRecentlyActive = (now - lastActive) <= fiveMinutes;
          const isActive = isRecentlyActive && session.isActive !== false;
          
          if (isActive) {
            totalActive++;
            activeSessions.push({
              ...session,
              id: docSnap.id,
              isActive: true
            });
          } else {
            inactiveSessions.push({
              ...session,
              id: docSnap.id,
              isActive: false
            });
          }
        });
        
        // Сортируем: сначала активные
        const allSessions = [...activeSessions, ...inactiveSessions];
        
        // Показываем активные сессии
        if (activeSessions.length > 0) {
          sessionsHTML += `<h4 style="color: #4CAF50; margin-top: 20px;">🟢 Активные сессии (${activeSessions.length})</h4>`;
          
          activeSessions.forEach(session => {
            const isCurrentDevice = session.deviceId === deviceId;
            sessionsHTML += `
              <div style="margin: 10px 0; padding: 15px; background: ${isCurrentDevice ? '#E8F5E9' : '#F1F8E9'}; border-radius: 5px; border-left: 5px solid ${isCurrentDevice ? '#4CAF50' : '#8BC34A'}">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                  <div style="flex: 1;">
                    <strong>Устройство ID:</strong> ${session.deviceId || 'Неизвестно'}<br>
                    <strong>Статус:</strong> 🟢 Активна ${isCurrentDevice ? '(Текущее устройство)' : ''}<br>
                    <strong>Платформа:</strong> ${session.platform || 'Неизвестно'}<br>
                    <strong>User Agent:</strong> ${session.userAgent ? session.userAgent.substring(0, 80) + '...' : 'Неизвестно'}<br>
                    <strong>Последняя активность:</strong> ${session.lastActive ? new Date(session.lastActive.toDate()).toLocaleString() : 'Никогда'}<br>
                    <strong>Первое подключение:</strong> ${session.firstSeen ? new Date(session.firstSeen.toDate()).toLocaleString() : 'Неизвестно'}<br>
                    <strong>IP адрес:</strong> ${session.ipAddress || 'Неизвестно'}
                  </div>
                  <div>
                    ${!isCurrentDevice ? `
                      <button onclick="terminateSession('${userId}', '${session.deviceId}', '${userEmail}')" 
                              style="background: #ff9800; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px;">
                        🚫 Завершить
                      </button>
                    ` : ''}
                  </div>
                </div>
              </div>
            `;
          });
        }
        
        // Показываем неактивные сессии (сворачиваемый список)
        if (inactiveSessions.length > 0) {
          sessionsHTML += `
            <h4 style="color: #9E9E9E; margin-top: 20px; cursor: pointer;" onclick="toggleInactiveSessions()">
              ⚪ Неактивные сессии (${inactiveSessions.length}) ▼
            </h4>
            <div id="inactiveSessionsList" style="display: none;">
          `;
          
          inactiveSessions.forEach(session => {
            sessionsHTML += `
              <div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; border-left: 5px solid #9E9E9E">
                <strong>Устройство ID:</strong> ${session.deviceId?.substring(0, 20) || 'Неизвестно'}...<br>
                <strong>Статус:</strong> ⚪ Неактивна<br>
                <strong>Последняя активность:</strong> ${session.lastActive ? new Date(session.lastActive.toDate()).toLocaleString() : 'Никогда'}<br>
                ${session.terminatedAt ? `<strong>Завершена:</strong> ${new Date(session.terminatedAt.toDate()).toLocaleString()}<br>` : ''}
              </div>
            `;
          });
          
          sessionsHTML += `</div>`;
        }
        
        // Статистика
        sessionsHTML += `
          <div style="margin-top: 30px; padding: 20px; background: ${totalActive > 3 ? '#FFF3E0' : '#E3F2FD'}; border-radius: 10px; border: 2px solid ${totalActive > 3 ? '#FF9800' : '#2196F3'}">
            <h4 style="margin-top: 0; color: ${totalActive > 3 ? '#FF9800' : '#2196F3'}">📊 Статистика сессий</h4>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              <div style="text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #4CAF50;">${totalActive}</div>
                <div style="font-size: 12px; color: #666;">Активных сессий</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #9E9E9E;">${inactiveSessions.length}</div>
                <div style="font-size: 12px; color: #666;">Неактивных сессий</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #2196F3;">${sessionsSnapshot.size}</div>
                <div style="font-size: 12px; color: #666;">Всего сессий</div>
              </div>
            </div>
            ${totalActive > 3 ? `
              <div style="margin-top: 15px; padding: 10px; background: #FFEBEE; border-radius: 5px; border-left: 5px solid #f44336;">
                <strong>⚠️ ВНИМАНИЕ:</strong> Обнаружено ${totalActive} активных сессий (больше 3).<br>
                Рекомендуется уведомить пользователя ${userEmail} о возможной проблеме безопасности.
                <div style="margin-top: 10px;">
                  <button onclick="alertUser('${userId}', '${userEmail}')" 
                          style="background: #f44336; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">
                    ⚠️ Уведомить пользователя
                  </button>
                </div>
              </div>
            ` : ''}
          </div>
        `;
      }
      
    } catch (sessionsError) {
      console.error('Ошибка загрузки сессий:', sessionsError);
      sessionsHTML += `
        <div style="color: #f44336; padding: 20px; text-align: center;">
          <strong>Ошибка загрузки сессий:</strong><br>
          ${sessionsError.message}<br>
          <small>Возможно, недостаточно прав или сессии не создавались</small>
        </div>
      `;
    }
    
    sessionsHTML += '</div>';
    
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = sessionsHTML;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').onclick = () => {
      document.body.removeChild(modal);
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    };
    
    // Добавляем глобальную функцию для переключения неактивных сессий
    window.toggleInactiveSessions = function() {
      const list = document.getElementById('inactiveSessionsList');
      const header = document.querySelector('h4[onclick="toggleInactiveSessions()"]');
      if (list.style.display === 'none') {
        list.style.display = 'block';
        header.innerHTML = header.innerHTML.replace('▼', '▲');
      } else {
        list.style.display = 'none';
        header.innerHTML = header.innerHTML.replace('▲', '▼');
      }
    };
    
    // Функция обновления вида
    window.refreshSessionsView = function(userId, userEmail) {
      document.querySelector('.admin-modal')?.remove();
      viewUserSessions(userId, userEmail);
    };
    
  } catch (error) {
    console.error('Общая ошибка в viewUserSessions:', error);
    alert('Ошибка загрузки сессий пользователя: ' + error.message);
  }
};

/* ====== ФУНКЦИЯ ПРИНУДИТЕЛЬНОГО СБРОСА ПАРОЛЯ ====== */
window.forcePasswordReset = async function(userId, userEmail) {
  // ❌ Запрещаем сброс пароля для администратора
  if (userEmail === ADMIN_EMAIL) {
    alert('❌ Нельзя сбросить пароль администратора!\nПароль администратора статичный: ' + ADMIN_STATIC_PASSWORD);
    return;
  }
  
  if (!confirm(`Сбросить пароль для ${userEmail}?\nНовый пароль будет сгенерирован. Пользователю нужно будет использовать новый пароль для входа.`)) return;
  
  try {
    // Генерируем новый пароль
    const newPassword = generateNewPassword();
    
    console.log(`🔧 Админ: генерируем пароль для ${userEmail}: ${newPassword}`);
    
    // Обновляем в Firestore
    await updateDoc(doc(db, 'users', userId), {
      currentPassword: newPassword,
      passwordChanged: true,
      lastPasswordChange: serverTimestamp(),
      securityAlerts: arrayUnion({
        type: 'password_reset_by_admin',
        message: `Пароль был сброшен администратором. Новый пароль: ${newPassword}`,
        timestamp: serverTimestamp(),
        read: false
      })
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
};

window.showAccessStatistics = async function() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let stats = {
      total: 0,
      withAccess: 0,
      withoutAccess: 0,
      activeSessions: 0,
      recentLogins: 0
    };
    
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    for (const docSnap of usersSnapshot.docs) {
      const data = docSnap.data();
      stats.total++;
      
      if (data.allowed) {
        stats.withAccess++;
      } else {
        stats.withoutAccess++;
      }
      
      // Проверяем активность за последние 24 часа
      if (data.lastLogin) {
        const lastLogin = data.lastLogin.toDate().getTime();
        if (now - lastLogin < oneDay) {
          stats.recentLogins++;
        }
      }
      
      // Считаем активные сессии
      if (data.activeSessions) {
        stats.activeSessions += data.activeSessions.length;
      }
    }
    
    const html = `
      <div class="admin-modal">
        <div class="admin-modal-content" style="max-width: 600px;">
          <h3>📊 Статистика доступа пользователей</h3>
          <button class="close-modal" onclick="this.closest('.admin-modal').remove()">✕</button>
          
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0;">
            <div style="background: #E3F2FD; padding: 15px; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #2196F3;">${stats.total}</div>
              <div style="font-size: 14px; color: #666;">Всего пользователей</div>
            </div>
            <div style="background: #E8F5E9; padding: 15px; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #4CAF50;">${stats.withAccess}</div>
              <div style="font-size: 14px; color: #666;">С доступом</div>
            </div>
            <div style="background: #FFF3E0; padding: 15px; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #FF9800;">${stats.withoutAccess}</div>
              <div style="font-size: 14px; color: #666;">Без доступа</div>
            </div>
            <div style="background: #FCE4EC; padding: 15px; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #9C27B0;">${stats.activeSessions}</div>
              <div style="font-size: 14px; color: #666;">Активных сессий</div>
            </div>
          </div>
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <h4 style="margin-top: 0;">📈 Процентное соотношение:</h4>
            <div style="margin: 10px 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>С доступом:</span>
                <span>${((stats.withAccess / stats.total) * 100).toFixed(1)}%</span>
              </div>
              <div style="height: 20px; background: #eee; border-radius: 10px; overflow: hidden;">
                <div style="height: 100%; width: ${(stats.withAccess / stats.total) * 100}%; background: #4CAF50;"></div>
              </div>
            </div>
            <div style="margin: 10px 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Без доступа:</span>
                <span>${((stats.withoutAccess / stats.total) * 100).toFixed(1)}%</span>
              </div>
              <div style="height: 20px; background: #eee; border-radius: 10px; overflow: hidden;">
                <div style="height: 100%; width: ${(stats.withoutAccess / stats.total) * 100}%; background: #FF9800;"></div>
              </div>
            </div>
          </div>
          
          <div style="margin-top: 20px; text-align: center;">
            <button onclick="bulkAccessControl('grant_all')" style="background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
              ✅ Открыть доступ всем
            </button>
            <button onclick="this.closest('.admin-modal').remove()" style="background: #9E9E9E; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">
              Закрыть
            </button>
          </div>
        </div>
      </div>
    `;
    
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
    
  } catch (error) {
    console.error('Ошибка загрузки статистики:', error);
    alert('Ошибка загрузки статистики: ' + error.message);
  }
};

/* ====== НАБЛЮДЕНИЕ ЗА АУТЕНТИФИКАЦИЕЙ ====== */
onAuthStateChanged(auth, async (user) => {
  if (userUnsubscribe) {
    try { userUnsubscribe(); } catch(e) { console.error('Ошибка отписки:', e); }
    userUnsubscribe = null;
  }
  
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
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
    
    const adminContainer = document.getElementById('adminPanelContainer');
    if (adminContainer) adminContainer.innerHTML = '';
    return;
  }

  if (authOverlay) {
    authOverlay.setAttribute('inert', '');
    authOverlay.style.display = 'none';
  }
  
  if (userEmailSpan) userEmailSpan.innerText = user.email || '';
  
  deviceId = generateDeviceId();
  await registerSession(user.uid);
  await checkActiveSessions(user.uid, user.email);
  
  sessionCheckInterval = setInterval(async () => {
    if (user) {
      await updateSessionActivity(user.uid);
    }
  }, 30000);

  await setupAdminPanel(user.email);

  const uDocRef = doc(db, USERS_COLLECTION, user.uid);

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
        lastLogin: null,
        activeSessions: [],
        securityAlerts: []
      });
    }
  } catch (err) {
    console.error('Ошибка чтения/создания user doc:', err);
  }

  userUnsubscribe = onSnapshot(uDocRef, async (docSnap) => {
    if (!docSnap.exists()) return;

    const data = docSnap.data();
    const allowed = data.allowed === true;

    if (allowed) {
      if (authOverlay) authOverlay.style.display = 'none';
      if (waitOverlay) waitOverlay.style.display = 'none';
      if (appDiv) appDiv.style.display = 'block';
      setStatus('');

      try {
        let shouldReset = false;
        
        if (!data.passwordChanged || !data.currentPassword) {
          shouldReset = true;
        }
        
        if (user.email === ADMIN_EMAIL) {
          shouldReset = false;
        }
        
        if (shouldReset && !passwordResetInProgress) {
          setTimeout(async () => {
            await resetUserPassword(user);
          }, 1000);
        } else {
          await updateDoc(doc(db, USERS_COLLECTION, user.uid), {
            lastLogin: serverTimestamp(),
            lastSeen: serverTimestamp()
          });
        }
      } catch (error) {
        console.error('Ошибка при проверке сброса пароля:', error);
      }
      
      if (!quizInitialized) {
        quizInstance = initQuiz(user.uid);
        quizInitialized = true;
      }

    } else {
      if (authOverlay) authOverlay.style.display = 'none';
      if (waitOverlay) waitOverlay.style.display = 'flex';
      if (appDiv) appDiv.style.display = 'none';
      setStatus('Доступ закрыт администратором.');
    }
  });
});

/* ====== СИСТЕМА ТЕСТА ====== */
function initQuiz(userId) {
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

  // Выход из режима ошибок
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

  // Загрузка прогресса
  (async () => {
    if (!userId) return;
    
    try {
      const progressRef = doc(db, USERS_PROGRESS_COLLECTION, userId);
      const snap = await getDoc(progressRef);
      
      if (snap.exists()) {
        const data = snap.data();
        if (data.progress) {
          try {
            const savedState = JSON.parse(data.progress);
            const remoteTime = data.updatedAt?.toMillis() || 0;
            const localTime = state.lastSyncTimestamp || 0;
            
            if (remoteTime > localTime) {
              Object.assign(state, savedState);
              state.lastSyncTimestamp = remoteTime;
              console.log('✅ Прогресс загружен с сервера');
            }
          } catch (err) {
            console.error('Ошибка разбора прогресса:', err);
          }
        }
      } else {
        // Создаем новый документ прогресса
        await setDoc(doc(db, USERS_PROGRESS_COLLECTION, userId), {
          progress: JSON.stringify(state),
          updatedAt: serverTimestamp(),
          email: auth.currentUser?.email || '',
          lastUpdated: Date.now(),
          deviceId: deviceId,
          userId: userId
        });
      }
    } catch (e) { 
      console.error('Ошибка загрузки прогресса:', e); 
    }
    
    loadQuestions();
  })();


  // Сохранение прогресса
  function saveState() {
    const timestamp = Date.now();
    state.lastSyncTimestamp = timestamp;
    localStorage.setItem("bioState", JSON.stringify(state));
    
    if (userId) {
      const progressRef = doc(db, USERS_PROGRESS_COLLECTION, userId);
      const updateData = {
        progress: JSON.stringify(state),
        updatedAt: serverTimestamp(),
        lastUpdated: timestamp,
        deviceId: deviceId
      };
      
      updateDoc(progressRef, updateData)
        .then(() => console.log('💾 Прогресс сохранен'))
        .catch(err => console.error('Ошибка сохранения:', err));
    }
  }

  // Перемешивание
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
    } else if (state.history[qId]?.selected && state.history[qId].selected.length > 0) {
      return "selected";
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
    } else if (status === "selected") {
      btn.style.background = "#2196F3";
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

  // Сохранение выбранных ответов (без проверки)
  function saveSelectedAnswers(qId) {
    if (!state.history[qId]) {
      state.history[qId] = {
        selected: [],
        checked: false,
        counted: false
      };
    }
    
    state.history[qId].selected = [...selected];
    saveState();
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
          saveSelectedAnswers(qId);
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
          
          saveSelectedAnswers(qId);
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
async function resetProgress() {
  try {
    // Получаем текущего пользователя
    const user = auth.currentUser;
    if (!user) {
      alert('Пользователь не авторизован');
      return;
    }

    if (!confirm("Вы уверены, что хотите сбросить весь прогресс? Это удалит:\n• Все ответы\n• Статистику\n• Ошибки\n• Историю вопросов")) {
      return;
    }

    // Показываем индикатор загрузки
    const originalText = resetBtn.innerHTML;
    resetBtn.innerHTML = '<span class="spinner"></span> Сброс...';
    resetBtn.disabled = true;

    // Создаем состояние сброса
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

    // 1. Очищаем локальное хранилище
    localStorage.removeItem("bioState");
    console.log('🗑️ Локальное хранилище очищено');

    // 2. Сбрасываем состояние в Firestore (коллекция users_progress)
    const progressRef = doc(db, USERS_PROGRESS_COLLECTION, user.uid);
    
    // Создаем новый документ с начальным состоянием
    await setDoc(progressRef, {
      progress: JSON.stringify(resetState),
      updatedAt: serverTimestamp(),
      email: user.email || '',
      lastUpdated: Date.now(),
      deviceId: deviceId || 'unknown',
      userId: user.uid,
      resetAt: serverTimestamp(),
      resetBy: user.email
    }, { merge: true });
    
    console.log('🗑️ Прогресс сброшен в Firestore');

    // 3. Также обновляем состояние в коллекции quiz_analytics
    const analyticId = `reset_${Date.now()}`;
    const analyticRef = doc(db, QUIZ_ANALYTICS_COLLECTION, analyticId);
    
    await setDoc(analyticRef, {
      userId: user.uid,
      email: user.email || '',
      action: 'progress_reset',
      timestamp: serverTimestamp(),
      resetBy: user.email,
      deviceId: deviceId || 'unknown',
      details: 'Пользователь сбросил весь прогресс теста'
    });

    // 4. Перезагружаем состояние теста без перезагрузки страницы
    if (quizInstance && typeof quizInstance.loadQuestions === 'function') {
      // Сначала сохраняем состояние сброса в локальное хранилище
      localStorage.setItem("bioState", JSON.stringify(resetState));
      
      // Перезагружаем вопросы
      await quizInstance.loadQuestions();
      
      // Перерисовываем интерфейс
      if (typeof quizInstance.render === 'function') {
        quizInstance.render();
      }
      
      console.log('🔄 Тест перезагружен');
    }

    // Показываем уведомление об успехе
    alert('✅ Прогресс успешно сброшен!\n\nТест начнется с первого вопроса.');

    // Обновляем статистику на экране
    if (statsDiv) {
      statsDiv.innerText = `✔ 0 ✖ 0`;
    }
    
    if (progressText) {
      progressText.innerText = 'Вопрос 1 из ...';
    }
    
    if (progressFill) {
      progressFill.style.width = '0%';
    }

  } catch (error) {
    console.error('❌ Ошибка сброса прогресса:', error);
    alert('❌ Ошибка сброса прогресса: ' + error.message);
    
    // В случае ошибки пытаемся хотя бы очистить локальное хранилище
    localStorage.removeItem("bioState");
    location.reload();
    
  } finally {
    // Восстанавливаем кнопку
    if (resetBtn) {
      resetBtn.innerHTML = originalText || '🔄 Сбросить прогресс';
      resetBtn.disabled = false;
    }
  }
}

// Назначаем обработчик кнопке сброса
if (resetBtn) {
  resetBtn.onclick = resetProgress;
}

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





