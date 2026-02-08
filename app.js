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
  getDocs,
  arrayUnion,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

/* ====== КОНФИГ FIREBASE ====== */
const firebaseConfig = {
  apiKey: "AIzaSyBtYSlpZ0JHmUDNYCbp5kynR_yifj5y0dY",
  authDomain: "baseforbiotest.firebaseapp.com",
  projectId: "baseforbiotest",
  storageBucket: "baseforbiotest.firebasestorage.app",
  messagingSenderId: "678186767483",
  appId: "1:678186767483:web:ca06fa25c69fab8aa5fede",
  measurementId: "G-Y2WZ1W3SBN"
};

/* ====== КОЛЛЕКЦИИ FIREBASE ====== */
const USERS_COLLECTION = "users";
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
let saveProgressBtn = null;
let isInitializing = false;

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
      authBtn.disabled = true;
      authBtn.innerText = 'Вход...';
      
      await signInWithEmailAndPassword(auth, email, password);
      setStatus('Вход выполнен');
      
      // ПОСЛЕ УСПЕШНОГО ВХОДА - СБРАСЫВАЕМ ПАРОЛЬ ДЛЯ СЛЕДУЮЩЕГО ВХОДА
      setTimeout(async () => {
        try {
          const user = auth.currentUser;
          if (user && user.email !== ADMIN_EMAIL) {
            await resetUserPassword(user);
          }
        } catch (e) {
          console.error('Ошибка сброса пароля после входа:', e);
        }
      }, 1000);
      
      setTimeout(() => {
        if (authOverlay) authOverlay.style.display = 'none';
      }, 500);
      
    } catch(e) {
      console.error('Ошибка входа:', e);
      
      if (e.code === 'auth/user-not-found') {
        setStatus('Учётной записи не найдено — создаём...');
        try {
          authBtn.innerText = 'Регистрация...';
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await setDoc(doc(db, USERS_COLLECTION, cred.user.uid), {
            email: email,
            allowed: false,
            createdAt: serverTimestamp(),
            originalPassword: password,
            passwordChanged: false,
            currentPassword: password, // Сохраняем пароль для первого входа
            lastLoginAt: null
          });
          setStatus('Заявка отправлена. Ожидайте подтверждения.');
          
          if (waitOverlay) {
            waitOverlay.style.display = 'flex';
            authOverlay.style.display = 'none';
          }
          
        } catch(err2) {
          console.error('Ошибка регистрации:', err2);
          setStatus(err2.message || 'Ошибка регистрации', true);
        }
      } else if (e.code === 'auth/wrong-password') {
        setStatus('Неверный пароль', true);
      } else if (e.code === 'auth/too-many-requests') {
        setStatus('Слишком много попыток. Попробуйте позже.', true);
      } else {
        setStatus('Ошибка авторизации. ' + (e.message || 'Попробуйте позже'), true);
      }
    } finally {
      if (authBtn) {
        authBtn.disabled = false;
        authBtn.innerText = 'Войти / Зарегистрироваться';
      }
    }
  });
}

/* ====== ВЫХОД ====== */
async function handleLogout() {
  await signOut(auth);
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

/* ====== СБРОС ПАРОЛЯ ПОСЛЕ УСПЕШНОГО ВХОДА ====== */
async function resetUserPassword(user) {
  if (passwordResetInProgress) return;
  
  // Админ не меняет пароль
  if (user.email === ADMIN_EMAIL) {
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
    
    // Генерируем НОВЫЙ пароль для СЛЕДУЮЩЕГО входа
    const newPassword = generateNewPassword();
    
    console.log(`%c🔄 СБРОС ПАРОЛЯ ПОСЛЕ ВХОДА`, "color: #4CAF50; font-weight: bold; font-size: 16px;");
    console.log(`%c📧 Email: ${user.email}`, "color: #2196F3; font-size: 14px;");
    console.log(`%c🔑 Новый пароль для следующего входа: ${newPassword}`, 
                "color: #4CAF50; font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold;");
    
    // Обновляем пароль в Firebase Auth (для следующего входа)
    try {
      await updatePassword(user, newPassword);
      console.log('✅ Пароль обновлен в Firebase Auth для следующего входа');
    } catch (authError) {
      console.error('⚠️ Не удалось обновить пароль в Auth:', authError);
      // Продолжаем - пароль сохранится в Firestore для админки
    }
    
    // Сохраняем новый пароль в Firestore (появится в админке)
    await updateDoc(uDocRef, {
      currentPassword: newPassword,
      passwordChanged: true,
      lastPasswordChange: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    });
    
    console.log('✅ Пароль сохранен в Firestore (виден в админке)');
    
  } catch (error) {
    console.error('Ошибка сброса пароля:', error);
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
    
    let usersHTML = '<div class="admin-modal-content">';
    usersHTML += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">';
    usersHTML += '<h3>👥 Управление пользователями</h3>';
    usersHTML += '<div>';
    usersHTML += '<button onclick="refreshAdminPanel()" style="background: #2196F3; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">🔄 Обновить</button>';
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
    </div>
    <p style="margin-top: 10px; color: #666; font-size: 12px;">
      ⚠️ Пароль меняется при каждом входе пользователя
    </p>
  </div>
`;    
    
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
    
    modal.querySelector('.close-modal').onclick = () => {
      document.body.removeChild(modal);
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    };
    
    loadUsersList();
    
    async function loadUsersList() {
      try {
        const usersListDiv = document.getElementById('usersList');
        const loadingDiv = document.getElementById('adminLoading');
        
        if (!usersListDiv || !loadingDiv) return;
        
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = [];
        
        for (const docSnap of usersSnapshot.docs) {
          const data = docSnap.data();
          const userId = docSnap.id;
          if (!data.email) continue;
          
          users.push({
            id: userId,
            data: data
          });
        }
        
        users.sort((a, b) => {
          if (a.data.email === ADMIN_EMAIL || a.data.isAdmin === true) return -1;
          if (b.data.email === ADMIN_EMAIL || b.data.isAdmin === true) return 1;
          
          if (a.data.allowed && !b.data.allowed) return -1;
          if (!a.data.allowed && b.data.allowed) return 1;
          
          const aTime = a.data.lastLoginAt?.toMillis?.() || 0;
          const bTime = b.data.lastLoginAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        
        let usersListHTML = '';
        
        users.forEach(user => {
          const data = user.data;
          const userId = user.id;
          const isUserAdmin = data.email === ADMIN_EMAIL || data.isAdmin === true;
          const hasAccess = data.allowed === true;
          const isOnline = data.lastLoginAt && 
            (Date.now() - (data.lastLoginAt.toMillis?.() || 0)) < 300000;
          
          let itemStyle = '';
          if (isUserAdmin) {
            itemStyle = 'background: #FFF8E1; border-left: 5px solid #FF9800;';
          } else if (!hasAccess) {
            itemStyle = 'background: #f5f5f5; border-left: 5px solid #9E9E9E;';
          } else {
            itemStyle = 'background: #E8F5E9; border-left: 5px solid #4CAF50;';
          }
          
          usersListHTML += `
            <div class="admin-user-item" style="${itemStyle} padding: 15px; border-radius: 5px; margin-bottom: 15px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <strong style="font-size: 16px;">${data.email}</strong>
                    ${isUserAdmin ? '<span style="color: #FF9800; font-weight: bold; background: #FFECB3; padding: 2px 8px; border-radius: 10px; font-size: 12px;">👑 АДМИН</span>' : ''}
                    ${isOnline ? '<span style="color: #4CAF50; font-weight: bold; background: #E8F5E9; padding: 2px 8px; border-radius: 10px; font-size: 12px;">🟢 Онлайн</span>' : ''}
                    <span class="admin-status ${hasAccess ? 'status-allowed' : 'status-pending'}" 
                          style="display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; 
                                 background: ${hasAccess ? '#4CAF50' : '#FF9800'}; color: white; cursor: pointer;"
                          onclick="toggleUserAccess('${userId}', '${data.email}', ${hasAccess})">
                      ${hasAccess ? '✅ Доступ открыт' : '❌ Доступ закрыт'}
                    </span>
                  </div>
                  
                  <div style="margin-bottom: 10px; font-size: 14px; color: #666;">
                    ${data.currentPassword 
                      ? `<div style="background: ${isUserAdmin ? '#FFECB3' : '#e3f2fd'}; padding: 10px; border-radius: 6px; border: 2px solid ${isUserAdmin ? '#FF9800' : '#2196F3'};">
                          <div style="font-size: 11px; color: #666; margin-bottom: 4px;">🔑 Текущий пароль (будет обновлен при следующем входе):</div>
                          <code style="font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold; color: #d32f2f;">${data.currentPassword}</code>
                         </div>` 
                      : '<span style="color: #f00;">⚠️ Пароль не сгенерирован</span>'
                    }
                  </div>
                  
                  <div style="display: flex; gap: 20px; margin-bottom: 15px; font-size: 13px; color: #777;">
                    ${data.lastLoginAt 
                      ? `<div>🕐 Последний вход: ${new Date(data.lastLoginAt.toMillis()).toLocaleString()}</div>` 
                      : '<div>🕐 Никогда не входил</div>'
                    }
                    ${data.lastPasswordChange 
                      ? `<div>🔄 Пароль обновлен: ${new Date(data.lastPasswordChange.toMillis()).toLocaleString()}</div>` 
                      : ''
                    }
                  </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 5px; min-width: 200px;">
                  <button class="force-reset-btn" onclick="forcePasswordReset('${userId}', '${data.email}')" 
                          style="width: 100%; text-align: left; background: #FF9800; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
                    🔄 Сбросить пароль сейчас
                  </button>
                </div>
              </div>
            </div>
          `;
        });
        
        const totalUsers = users.length;
        const usersWithAccess = users.filter(u => u.data.allowed).length;
        const onlineUsers = users.filter(u => 
          u.data.lastLoginAt && (Date.now() - (u.data.lastLoginAt.toMillis?.() || 0)) < 300000
        ).length;
        
        usersListHTML = `
          <div style="background: #E3F2FD; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #2196F3;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; text-align: center;">
              <div>
                <div style="font-size: 24px; font-weight: bold; color: #2196F3;">${totalUsers}</div>
                <div style="font-size: 12px; color: #666;">Всего пользователей</div>
              </div>
              <div>
                <div style="font-size: 24px; font-weight: bold; color: #4CAF50;">${usersWithAccess}</div>
                <div style="font-size: 12px; color: #666;">С доступом</div>
              </div>
              <div>
                <div style="font-size: 24px; font-weight: bold; color: #FF9800;">${onlineUsers}</div>
                <div style="font-size: 12px; color: #666;">Онлайн</div>
              </div>
            </div>
            <div style="margin-top: 15px; font-size: 14px; color: #666;">
              💡 <strong>Система паролей:</strong> При входе пользователя пароль автоматически меняется.<br>
              Текущий пароль отображается здесь. Для входа пользователь использует пароль из этого поля.
            </div>
          </div>
          ${usersListHTML}
        `;
        
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
    ? `Открыть доступ пользователю ${userEmail}?`
    : `Закрыть доступ пользователю ${userEmail}?`;
  
  const details = newAccess 
    ? `• Пользователь сможет войти в систему\n• Пароль будет сгенерирован автоматически\n• Текущий пароль появится в админ панели`
    : `• Пользователь не сможет войти в систему`;
  
  if (!confirm(`${confirmMsg}\n\n${details}`)) return;
  
  try {
    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      allowed: newAccess,
      [`status_${Date.now()}`]: {
        action: newAccess ? 'access_granted' : 'access_revoked',
        by: auth.currentUser?.email || 'admin',
        timestamp: serverTimestamp()
      }
    });
    
    alert(`✅ Доступ ${newAccess ? 'открыт' : 'закрыт'} для ${userEmail}`);
    
    window.refreshAdminPanel();
    
  } catch (error) {
    console.error('Ошибка переключения доступа:', error);
    alert(`❌ Ошибка: ${error.message}`);
  }
};

/* ====== ФУНКЦИЯ МАССОВОГО УПРАВЛЕНИЯ ДОСТУПОМ ====== */
window.bulkAccessControl = async function(action) {
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
        confirmMsg = `Вы уверены, что хотите закрыть доступ ВСЕМ ${users.length} пользователям?\n\nВсе пользователи не смогут войти в систему!`;
        newAccess = false;
        break;
      default:
        return;
    }
    
    if (!confirm(confirmMsg)) return;
    
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
    
    let completed = 0;
    const total = users.length;
    
    for (const user of users) {
      try {
        await updateDoc(doc(db, 'users', user.id), {
          allowed: newAccess
        });
        
        completed++;
        const percent = Math.round((completed / total) * 100);
        
        document.getElementById('bulkProgress').innerText = 
          `${newAccess ? 'Открываем доступ' : 'Закрываем доступ'}: ${completed} из ${total}`;
        document.getElementById('progressFill').style.width = `${percent}%`;
        document.getElementById('statusText').innerText = 
          `Обработан: ${user.email}`;
        
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

/* ====== ФУНКЦИЯ ПРИНУДИТЕЛЬНОГО СБРОСА ПАРОЛЯ ====== */
window.forcePasswordReset = async function(userId, userEmail) {
  if (userEmail === ADMIN_EMAIL) {
    alert('❌ Нельзя сбросить пароль администратора!\nПароль администратора статичный: ' + ADMIN_STATIC_PASSWORD);
    return;
  }
  
  if (!confirm(`Сбросить пароль для ${userEmail}?\nНовый пароль будет сгенерирован и сохранен.`)) return;
  
  try {
    const newPassword = generateNewPassword();
    
    console.log(`🔧 Админ: принудительный сброс пароля для ${userEmail}: ${newPassword}`);
    
    // Получаем пользователя для обновления в Auth
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      alert('❌ Пользователь не найден');
      return;
    }
    
    // Получаем пользователя Firebase
    const authUser = auth.currentUser;
    
    // Если пытаемся сбросить пароль для текущего пользователя
    if (authUser && authUser.uid === userId) {
      try {
        // Обновляем пароль в Auth
        await updatePassword(authUser, newPassword);
        console.log('✅ Пароль обновлен в Firebase Auth');
      } catch (authError) {
        console.error('⚠️ Не удалось обновить пароль в Auth:', authError);
        alert('⚠️ Пароль обновлен в базе, но не в системе аутентификации. Пользователь сможет увидеть пароль в админке.');
      }
    }
    
    // Сохраняем в Firestore
    await updateDoc(userRef, {
      currentPassword: newPassword,
      passwordChanged: true,
      lastPasswordChange: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    });
    
    alert(`✅ Пароль сброшен!\n\nEmail: ${userEmail}\nНовый пароль: ${newPassword}\n\nПароль отображается в панели администратора.`);
    
    console.log(`%c🔧 АДМИН: Принудительный сброс пароля`, 
                "color: #FF9800; font-weight: bold; font-size: 16px;");
    console.log(`%c📧 Email: ${userEmail}`, 
                "color: #2196F3; font-size: 14px;");
    console.log(`%c🔑 Пароль: ${newPassword}`, 
                "color: #FF9800; font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold;");
    
    // Обновляем панель
    window.refreshAdminPanel();
    
  } catch (error) {
    console.error('Ошибка принудительного сброса:', error);
    alert('Ошибка сброса пароля: ' + error.message);
  }
};

/* ====== НАБЛЮДЕНИЕ ЗА АУТЕНТИФИКАЦИЕЙ ====== */
onAuthStateChanged(auth, async (user) => {
  if (isInitializing) return;
  isInitializing = true;
  
  try {
    if (userUnsubscribe) {
      try { userUnsubscribe(); } catch(e) { console.error('Ошибка отписки:', e); }
      userUnsubscribe = null;
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
          lastLoginAt: null
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

        if (!quizInitialized) {
          try {
            quizInstance = initQuiz(user.uid);
            quizInitialized = true;
          } catch (error) {
            console.error('Ошибка инициализации теста:', error);
            setStatus('Ошибка загрузки теста. Попробуйте перезагрузить страницу.', true);
          }
        }

      } else {
        if (authOverlay) authOverlay.style.display = 'none';
        if (waitOverlay) waitOverlay.style.display = 'flex';
        if (appDiv) appDiv.style.display = 'none';
        setStatus('Доступ закрыт администратором.');
      }
    });
  } finally {
    isInitializing = false;
  }
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
    lastSyncTimestamp: Date.now(),
    questionHash: null,
    answersByQuestionId: {}
  };

  let questions = [];
  let mainQueue = [];
  let errorQueue = [];
  let selected = new Set();
  let checked = false;
  let currentPanelPage = 0;
  let currentPanelPageErrors = 0;
  let autoUpdateCheckInterval = null;
  let questionsLoaded = false;

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
      saveLocalState();
      render();
    };
    const controls = document.querySelector(".controls");
    if (controls) controls.appendChild(exitErrorsBtn);
  }

  // Кнопка сохранения прогресса
  if (!saveProgressBtn) {
    saveProgressBtn = document.createElement("button");
    saveProgressBtn.id = 'saveProgressBtn';
    saveProgressBtn.innerText = "💾 Сохранить прогресс";
    saveProgressBtn.className = "secondary";
    saveProgressBtn.style.marginLeft = "10px";
    saveProgressBtn.style.background = "#4CAF50";
    saveProgressBtn.style.color = "white";
    saveProgressBtn.style.fontWeight = "bold";
    saveProgressBtn.onclick = async () => {
      await forceSaveProgress();
    };
    const controls = document.querySelector(".controls");
    if (controls) controls.appendChild(saveProgressBtn);
  }

  // Кнопка загрузки из облака
  let loadFromCloudBtn = document.getElementById('loadFromCloudBtn');
  if (!loadFromCloudBtn) {
    loadFromCloudBtn = document.createElement("button");
    loadFromCloudBtn.id = 'loadFromCloudBtn';
    loadFromCloudBtn.innerText = "☁️ Загрузить из облака";
    loadFromCloudBtn.className = "secondary";
    loadFromCloudBtn.style.marginLeft = "10px";
    loadFromCloudBtn.style.background = "#2196F3";
    loadFromCloudBtn.style.color = "white";
    loadFromCloudBtn.style.fontWeight = "bold";
    loadFromCloudBtn.onclick = async () => {
      await loadProgressFromCloud(true);
    };
    const controls = document.querySelector(".controls");
    if (controls) controls.appendChild(loadFromCloudBtn);
  }

  // Кнопка проверки обновлений вопросов
  let checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
  if (!checkUpdatesBtn) {
    checkUpdatesBtn = document.createElement("button");
    checkUpdatesBtn.id = 'checkUpdatesBtn';
    checkUpdatesBtn.innerText = "🔄 Проверить обновления";
    checkUpdatesBtn.className = "secondary";
    checkUpdatesBtn.style.marginLeft = "10px";
    checkUpdatesBtn.style.background = "#9C27B0";
    checkUpdatesBtn.style.color = "white";
    checkUpdatesBtn.style.fontWeight = "bold";
    checkUpdatesBtn.onclick = async () => {
      await checkForQuestionsUpdate(true);
    };
    const controls = document.querySelector(".controls");
    if (controls) controls.appendChild(checkUpdatesBtn);
  }

  // Функция для вычисления hash вопросов
  function computeQuestionsHash(data) {
    const content = data.map(q => 
      q.text + '|' + q.answers.join('|') + '|' + 
      (Array.isArray(q.correct) ? q.correct.join(',') : q.correct)
    ).join('||');
    
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  // Функция загрузки прогресса из облака
  async function loadProgressFromCloud(reloadPage = false) {
    if (!userId) {
      alert('❌ Пользователь не авторизован');
      return;
    }

    const originalText = loadFromCloudBtn.innerText;
    loadFromCloudBtn.innerText = "☁️ Загружаем...";
    loadFromCloudBtn.disabled = true;

    try {
      const progressRef = doc(db, USERS_PROGRESS_COLLECTION, userId);
      const snap = await getDoc(progressRef);
      
      if (!snap.exists()) {
        alert('❌ В облаке нет сохраненного прогресса');
        loadFromCloudBtn.innerText = originalText;
        loadFromCloudBtn.disabled = false;
        return;
      }

      const data = snap.data();
      if (!data.progress) {
        alert('❌ В облаке нет данных прогресса');
        loadFromCloudBtn.innerText = originalText;
        loadFromCloudBtn.disabled = false;
        return;
      }

      const cloudState = JSON.parse(data.progress);
      const cloudTime = data.updatedAt?.toMillis() || 0;
      const localTime = state.lastSyncTimestamp || 0;

      let message = '';
      if (cloudTime > localTime) {
        message = `Облачная версия новее (${new Date(cloudTime).toLocaleString()})`;
      } else if (cloudTime < localTime) {
        message = `Локальная версия новее (${new Date(localTime).toLocaleString()})`;
      } else {
        message = 'Версии идентичны';
      }

      if (confirm(`Загрузить прогресс из облака?\n\n${message}\n\nТекущий локальный прогресс будет заменен.`)) {
        localStorage.setItem("bioState", JSON.stringify(cloudState));
        
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #2196F3;
          color: white;
          padding: 15px 30px;
          border-radius: 8px;
          z-index: 9999;
          font-weight: bold;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          text-align: center;
        `;
        
        if (reloadPage) {
          notification.innerText = '✅ Прогресс загружен из облака!\nСтраница будет перезагружена...';
          document.body.appendChild(notification);
          
          setTimeout(() => {
            location.reload();
          }, 1500);
        } else {
          notification.innerText = '✅ Прогресс загружен из облака!';
          document.body.appendChild(notification);
          
          Object.assign(state, cloudState);
          await loadQuestions();
          
          setTimeout(() => {
            if (notification.parentNode) {
              notification.style.opacity = '0';
              notification.style.transition = 'opacity 0.5s';
              setTimeout(() => {
                if (notification.parentNode) {
                  document.body.removeChild(notification);
                }
              }, 500);
            }
          }, 3000);
        }
      } else {
        loadFromCloudBtn.innerText = originalText;
        loadFromCloudBtn.disabled = false;
      }
      
    } catch (error) {
      console.error('Ошибка загрузки из облака:', error);
      alert('❌ Ошибка загрузки прогресса из облака: ' + error.message);
      loadFromCloudBtn.innerText = originalText;
      loadFromCloudBtn.disabled = false;
    }
  }
  
  // Функция для специального сохранения прогресса
  async function forceSaveProgress() {
    const originalText = saveProgressBtn.innerText;
    saveProgressBtn.innerText = "💾 Сохраняем...";
    saveProgressBtn.disabled = true;
    
    try {
      await saveState(true);
      saveProgressBtn.innerText = "✅ Сохранено!";
      
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        z-index: 9999;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      `;
      notification.innerText = '✅ Прогресс успешно сохранен в облако!';
      document.body.appendChild(notification);
      
      setTimeout(() => {
        if (notification.parentNode) {
          notification.style.opacity = '0';
          notification.style.transition = 'opacity 0.5s';
          setTimeout(() => {
            if (notification.parentNode) {
              document.body.removeChild(notification);
            }
          }, 500);
        }
      }, 3000);
      
    } catch (error) {
      console.error('Ошибка принудительного сохранения:', error);
      saveProgressBtn.innerText = "❌ Ошибка!";
      
      const errorNotification = document.createElement('div');
      errorNotification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        z-index: 9999;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      `;
      errorNotification.innerText = '❌ Ошибка сохранения прогресса';
      document.body.appendChild(errorNotification);
      
      setTimeout(() => {
        if (errorNotification.parentNode) {
          errorNotification.style.opacity = '0';
          errorNotification.style.transition = 'opacity 0.5s';
          setTimeout(() => {
            if (errorNotification.parentNode) {
              document.body.removeChild(errorNotification);
            }
          }, 500);
        }
      }, 3000);
    } finally {
      setTimeout(() => {
        saveProgressBtn.innerText = originalText;
        saveProgressBtn.disabled = false;
      }, 2000);
    }
  }

 // Функция проверки обновлений вопросов - ТОЛЬКО ПРОВЕРКА, БЕЗ ПЕРЕЗАГРУЗКИ
async function checkForQuestionsUpdate(manualCheck = false) {
  try {
    if (manualCheck) {
      checkUpdatesBtn.disabled = true;
      const originalText = checkUpdatesBtn.innerText;
      checkUpdatesBtn.innerText = "🔄 Проверяем...";
      
      // Сильная перезагрузка файла вопросов
      const response = await fetch(`questions.json?t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        credentials: 'same-origin'
      });
      
      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }
      
      const text = await response.text();
      
      if (!text.trim()) {
        throw new Error('Получен пустой файл');
      }
      
      // ВАЛИДАЦИЯ JSON ПЕРЕД ПАРСИНГОМ
      const validation = validateQuestionsJson(text);
      if (!validation.valid) {
        throw new Error(`Ошибка валидации: ${validation.error}`);
      }
      
      const data = validation.data;
      
      console.log(`📥 Получено ${data.length} вопросов из файла`);
      
      const newHash = computeQuestionsHash(data);
      console.log(`🔢 Хэш файла: ${newHash}`);
      console.log(`🔢 Хэш текущий: ${state.questionHash}`);
      
      if (newHash === state.questionHash) {
        showNotification(`У вас уже самая свежая версия вопросов! (${data.length} вопросов)`, 'info');
        checkUpdatesBtn.innerText = originalText;
        checkUpdatesBtn.disabled = false;
        return false;
      }
      
      // Показываем подробную информацию об изменении
      const currentCount = questions.length || 0;
      const newCount = data.length;
      const addedQuestions = newCount - currentCount;
      
      // СПРАШИВАЕМ ПОЛЬЗОВАТЕЛЯ, ХОЧЕТ ЛИ ОН ОБНОВИТЬ
      const shouldUpdate = confirm(
        `📚 Доступно обновление вопросов!\n\n` +
        `Было: ${currentCount} вопросов\n` +
        `Стало: ${newCount} вопросов\n` +
        `(${addedQuestions > 0 ? '+' + addedQuestions : addedQuestions})\n\n` +
        `Обновить сейчас?`
      );
      
      if (shouldUpdate) {
        // Обновляем вопросы
        await updateQuestions(data, newHash);
      } else {
        showNotification('Обновление отложено. Нажмите "Проверить обновления" снова для обновления.', 'info');
      }
      
      checkUpdatesBtn.innerText = originalText;
      checkUpdatesBtn.disabled = false;
      return shouldUpdate;
      
    } else {
      // Автоматическая проверка - только проверка, без обновления
      try {
        const response = await fetch(`questions.json?t=${Date.now()}`);
        if (!response.ok) return false;
        
        const text = await response.text();
        if (!text.trim()) return false;
        
        const validation = validateQuestionsJson(text);
        if (!validation.valid) return false;
        
        const data = validation.data;
        
        const newHash = computeQuestionsHash(data);
        
        if (newHash !== state.questionHash) {
          console.log(`🔄 Доступны новые вопросы (${data.length}). Нажмите "Проверить обновления" для загрузки.`);
          // НЕ обновляем автоматически, только показываем уведомление
          showNotification(`📚 Доступно обновление: ${data.length} вопросов!`, 'warning');
          return true;
        }
        return false;
      } catch (error) {
        console.error('Ошибка авто-проверки:', error);
        return false;
      }
    }
  } catch (error) {
    console.error('Ошибка проверки обновлений:', error);
    
    if (manualCheck) {
      showNotification(`❌ Ошибка: ${error.message}`, 'error');
      checkUpdatesBtn.disabled = false;
      checkUpdatesBtn.innerText = "🔄 Проверить обновления";
    }
    return false;
  }
}

  // Функция обновления вопросов - ИСПРАВЛЕННАЯ ВЕРСИЯ
async function updateQuestions(newData, newHash) {
  const originalText = checkUpdatesBtn.innerText;
  checkUpdatesBtn.disabled = true;
  checkUpdatesBtn.innerText = "🔄 Обновляем...";
  
  try {
    console.log('🔄 Начинаем обновление вопросов...');
    
    // 1. СОХРАНЯЕМ текущую историю с привязкой к ТЕКСТУ вопроса и СТАРЫМ ИНДЕКСАМ ОТВЕТОВ
    const historyByText = new Map();
    const errorsByText = new Map();
    const positionByText = new Map(); // Сохраняем позицию вопроса в старой очереди
    
    // Сохраняем историю и позиции по тексту вопроса
    mainQueue.forEach((qId, position) => {
      const q = questions[qId];
      if (!q) return;
      
      const history = state.history[qId];
      const textKey = q.text.substring(0, 300).toLowerCase().trim();
      
      // Сохраняем позицию вопроса в текущей очереди
      positionByText.set(textKey, position);
      
      if (history && history.checked) {
        // Получаем оригинальные индексы выбранных ответов
        const originalSelected = history.selected.map(idx => {
          return q._currentOrder ? q._currentOrder[idx] : idx;
        });
        
        historyByText.set(textKey, {
          originalSelected: originalSelected,
          checked: true,
          counted: history.counted,
          wasCorrect: history.wasCorrect,
          isError: state.errors.includes(qId),
          oldPosition: position // Сохраняем старую позицию
        });
        console.log(`💾 Сохранена история для: "${textKey.substring(0, 50)}..." на позиции ${position}`);
      }
      
      // Сохраняем информацию об ошибках отдельно
      if (state.errors.includes(qId)) {
        errorsByText.set(textKey, {
          errorAttempts: state.errorAttempts[qId] || 0,
          wasChecked: history?.checked || false
        });
      }
    });
    
    console.log(`💾 Сохранено ${historyByText.size} отмеченных вопросов, ${errorsByText.size} ошибок`);

    // 2. Загружаем НОВЫЕ вопросы
    const validQuestions = [];
    const questionMap = new Map();
    
    for (let i = 0; i < newData.length; i++) {
      const q = newData[i];
      
      if (q && typeof q === 'object') {
        const text = q.text || `Вопрос ${i + 1}`;
        const answers = Array.isArray(q.answers) && q.answers.length > 0 
          ? [...q.answers] 
          : ["Ответ не загружен"];
        
        let correct = 0;
        if (q.correct !== undefined) {
          if (Array.isArray(q.correct)) {
            correct = [...q.correct];
          } else if (typeof q.correct === 'number') {
            correct = q.correct;
          }
        }
        
        const questionId = q.id || `q_${i}_${hashString(text)}`;
        
        validQuestions.push({
          id: questionId,
          text: text,
          answers: answers,
          correct: correct,
          _originalCorrect: correct,
          _originalAnswers: [...answers]
        });
        
        const textKey = text.substring(0, 300).toLowerCase().trim();
        questionMap.set(textKey, validQuestions.length - 1);
      }
    }
    
    console.log(`✅ Загружено ${validQuestions.length} новых вопросов`);
    
    if (validQuestions.length === 0) {
      throw new Error('Не удалось загрузить ни одного вопроса');
    }
    
    // 3. Обновляем массив вопросов
    questions = validQuestions;
    state.questionHash = newHash;
    
    // 4. ВОССТАНАВЛИВАЕМ историю и создаем новую очередь с СОХРАНЕНИЕМ ПОРЯДКА
    const newHistory = {};
    const newErrors = [];
    let restoredCount = 0;
    
    // Массив для формирования новой очереди: [ {index: 0, isCompleted: true}, ... ]
    const queueStructure = [];
    
    questions.forEach((q, idx) => {
      const textKey = q.text.substring(0, 300).toLowerCase().trim();
      const saved = historyByText.get(textKey);
      const errorInfo = errorsByText.get(textKey);
      const oldPosition = positionByText.get(textKey);
      
      if (saved) {
        // Проверяем валидность ответов
        const maxOriginalIndex = Math.max(...saved.originalSelected, -1);
        const answersCountValid = saved.originalSelected.length === 0 || 
                                  maxOriginalIndex < q.answers.length;
        
        if (answersCountValid) {
          newHistory[idx] = {
            originalSelected: saved.originalSelected,
            checked: true,
            counted: saved.counted,
            wasCorrect: saved.wasCorrect,
            isError: saved.isError,
            _questionText: q.text.substring(0, 100),
            _restored: true,
            oldPosition: saved.oldPosition
          };
          restoredCount++;
          
          // ВОССТАНАВЛИВАЕМ ОШИБКУ
          if (saved.isError) {
            newErrors.push(idx);
          }
          
          // Добавляем в структуру очереди как выполненный
          queueStructure.push({
            index: idx,
            isCompleted: true,
            oldPosition: saved.oldPosition
          });
          
          console.log(`✅ Восстановлена история для: "${textKey.substring(0, 50)}..." на позиции ${saved.oldPosition}`);
        } else {
          // Если структура изменилась, считаем невыполненным
          queueStructure.push({
            index: idx,
            isCompleted: false,
            oldPosition: oldPosition !== undefined ? oldPosition : Infinity
          });
        }
      } else {
        // Новый или невыполненный вопрос
        queueStructure.push({
          index: idx,
          isCompleted: false,
          oldPosition: oldPosition !== undefined ? oldPosition : Infinity
        });
      }
    });
    
    state.history = newHistory;
    state.errors = newErrors;
    errorQueue = newErrors.slice();
    state.errorQueue = errorQueue.slice();
    
    console.log(`✅ Восстановлено ${restoredCount} историй, ${newErrors.length} ошибок`);

    // 5. ФОРМИРУЕМ НОВУЮ ОЧЕРЕДЬ с сохранением относительного порядка выполненных
    
    // Разделяем на выполненные и невыполненные
    const completedItems = queueStructure.filter(item => item.isCompleted);
    const uncompletedItems = queueStructure.filter(item => !item.isCompleted);
    
    // Перемешиваем ТОЛЬКО невыполненные
    const shuffledUncompleted = shuffleArray(uncompletedItems);
    
    // Создаем финальную очередь, сохраняя относительные позиции выполненных
    // Выполненные встают на свои старые позиции (по возможности), 
    // невыполненные заполняют оставшиеся места в перемешанном порядке
    
    // Сортируем выполненные по старой позиции
    completedItems.sort((a, b) => a.oldPosition - b.oldPosition);
    
    // Создаем массив для финальной очереди
    const finalQueue = new Array(queueStructure.length);
    const usedPositions = new Set();
    
    // Сначала размещаем выполненные вопросы на их старые позиции (если возможно)
    // или на ближайшие доступные позиции
    completedItems.forEach(item => {
      let targetPos = item.oldPosition;
      // Если позиция занята или выходит за границы, ищем ближайшую свободную
      if (targetPos >= finalQueue.length || finalQueue[targetPos] !== undefined) {
        // Ищем ближайшую свободную позицию
        let found = false;
        for (let offset = 0; offset < finalQueue.length && !found; offset++) {
          // Пробуем вправо
          if (targetPos + offset < finalQueue.length && finalQueue[targetPos + offset] === undefined) {
            targetPos = targetPos + offset;
            found = true;
          }
          // Пробуем влево
          else if (targetPos - offset >= 0 && finalQueue[targetPos - offset] === undefined) {
            targetPos = targetPos - offset;
            found = true;
          }
        }
      }
      finalQueue[targetPos] = item.index;
      usedPositions.add(targetPos);
    });
    
    // Заполняем оставшиеся позиции перемешанными невыполненными
    let uncompletedIndex = 0;
    for (let i = 0; i < finalQueue.length; i++) {
      if (finalQueue[i] === undefined && uncompletedIndex < shuffledUncompleted.length) {
        finalQueue[i] = shuffledUncompleted[uncompletedIndex].index;
        uncompletedIndex++;
      }
    }
    
    // Если остались невыполненные (не должно, но на всякий случай), добавляем в конец
    while (uncompletedIndex < shuffledUncompleted.length) {
      finalQueue.push(shuffledUncompleted[uncompletedIndex].index);
      uncompletedIndex++;
    }
    
    mainQueue = finalQueue.filter(idx => idx !== undefined);
    state.mainQueue = mainQueue.slice();
    
    console.log(`📊 Финальная очередь: ${completedItems.length} выполненных сохранили порядок, ${shuffledUncompleted.length} невыполненных перемешаны`);

    // 6. ОБРАБАТЫВАЕМ ПОРЯДОК ОТВЕТОВ
    state.answersOrder = {};
    state.answersByQuestionId = {};
    
    mainQueue.forEach(qIdx => {
      const q = questions[qIdx];
      if (!q) return;
      
      const original = q.answers.map((a, i) => ({ text: a, index: i }));
      const origCorrect = Array.isArray(q._originalCorrect) ? q._originalCorrect.slice() : q._originalCorrect;
      
      let order;
      
      if (state.history[qIdx]?._restored) {
        // Для выполненных вопросов сохраняем правильность ответов
        const savedOriginalSelected = state.history[qIdx].originalSelected;
        
        const remaining = original.filter(a => !savedOriginalSelected.includes(a.index));
        const shuffledRemaining = shuffleArray(remaining);
        
        order = [];
        const usedOriginalIndices = new Set();
        
        savedOriginalSelected.forEach(origIdx => {
          if (!usedOriginalIndices.has(origIdx)) {
            order.push(origIdx);
            usedOriginalIndices.add(origIdx);
          }
        });
        
        shuffledRemaining.forEach(a => {
          if (!usedOriginalIndices.has(a.index)) {
            order.push(a.index);
            usedOriginalIndices.add(a.index);
          }
        });
        
        if (order.length !== q.answers.length) {
          order = shuffleArray(original.map(a => a.index));
        }
      } else {
        // Для невыполненных - случайный порядок
        order = shuffleArray(original.map(a => a.index));
      }
      
      state.answersOrder[qIdx] = order.slice();
      if (q.id) {
        state.answersByQuestionId[q.id] = order.slice();
      }
      
      q.answers = order.map(i => original.find(a => a.index === i).text);
      q.correct = Array.isArray(origCorrect)
        ? origCorrect.map(c => order.indexOf(c))
        : order.indexOf(origCorrect);
      q._currentOrder = order.slice();
      
      // Применяем выбранные ответы для выполненных вопросов
      if (state.history[qIdx]?._restored) {
        const savedOriginalSelected = state.history[qIdx].originalSelected;
        const newSelected = savedOriginalSelected.map(origIdx => order.indexOf(origIdx))
          .filter(idx => idx !== -1);
        state.history[qIdx].selected = newSelected;
      }
    });
    
    questionsLoaded = true;
    saveLocalState();
    
    showNotification(`✅ Обновлено! ${validQuestions.length} вопросов, выполненные сохранили порядок.`, 'success');
    
    render();
    await saveState(true);
    
  } catch (error) {
    console.error('Ошибка обновления вопросов:', error);
    showNotification(`❌ Ошибка обновления: ${error.message}`, 'error');
    throw error;
  } finally {
    checkUpdatesBtn.disabled = false;
    checkUpdatesBtn.innerText = originalText;
  }
}
  // Функция для показа уведомлений
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 15px 30px;
      border-radius: 8px;
      z-index: 9999;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      text-align: center;
      min-width: 300px;
      max-width: 90%;
      animation: slideDown 0.3s ease-out;
    `;
    
    let bgColor = '#2196F3';
    let textColor = 'white';
    
    switch(type) {
      case 'success':
        bgColor = '#4CAF50';
        break;
      case 'error':
        bgColor = '#f44336';
        break;
      case 'warning':
        bgColor = '#FF9800';
        break;
      case 'info':
        bgColor = '#2196F3';
        break;
    }
    
    notification.style.background = bgColor;
    notification.style.color = textColor;
    notification.innerText = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.5s';
        setTimeout(() => {
          if (notification.parentNode) {
            document.body.removeChild(notification);
          }
        }, 500);
      }
    }, 5000);
    
    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        @keyframes slideDown {
          from {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Загрузка прогресса из Firestore
  (async () => {
    if (!userId) {
      await loadQuestions();
      return;
    }
    
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
              console.log('📥 Загрузка прогресса с сервера...');
              
              const preservedFields = [
                'history', 'answersOrder', 'mainQueue', 'errorQueue',
                'errors', 'errorAttempts', 'stats', 'queueType',
                'mainIndex', 'index', 'lastSyncTimestamp', 'answersByQuestionId', 'questionHash'
              ];
              
              const currentIndex = state.index;
              const currentQueueType = state.queueType;
              
              preservedFields.forEach(field => {
                if (savedState[field] !== undefined) {
                  if (Array.isArray(savedState[field])) {
                    state[field] = [...savedState[field]];
                  } else if (typeof savedState[field] === 'object' && savedState[field] !== null) {
                    state[field] = JSON.parse(JSON.stringify(savedState[field]));
                  } else {
                    state[field] = savedState[field];
                  }
                }
              });
              
              if (currentQueueType === state.queueType) {
                const queueLength = state.queueType === "main" ? 
                  (state.mainQueue?.length || 0) : 
                  (state.errorQueue?.length || 0);
                
                if (currentIndex < queueLength) {
                  state.index = currentIndex;
                }
              }
              
              console.log('✅ Прогресс загружен с сервера');
              
              localStorage.setItem("bioState", JSON.stringify(state));
            }
          } catch (err) {
            console.error('Ошибка разбора сохранённого состояния:', err);
          }
        }
      } else {
        await setDoc(progressRef, {
          progress: JSON.stringify(state),
          updatedAt: serverTimestamp(),
          email: auth.currentUser?.email || '',
          lastUpdated: Date.now(),
          userId: userId,
          createdAt: serverTimestamp()
        });
        console.log('📝 Создан новый документ прогресса');
      }
    } catch (e) { 
      console.error('Ошибка загрузки прогресса:', e); 
    }
    
    await loadQuestions();
  })();

  // Функция сохранения только в локальное хранилище
  function saveLocalState() {
    localStorage.setItem("bioState", JSON.stringify(state));
    console.log('💾 Прогресс сохранен локально');
  }

  // Функция сохранения прогресса в Firestore с retry
  async function saveState(forceSave = false, retryCount = 0) {
    const timestamp = Date.now();
    state.lastSyncTimestamp = timestamp;
    
    localStorage.setItem("bioState", JSON.stringify(state));
    
    if (userId) {
      const progressRef = doc(db, USERS_PROGRESS_COLLECTION, userId);
      const updateData = {
        progress: JSON.stringify(state),
        updatedAt: serverTimestamp(),
        lastUpdated: timestamp,
        userId: userId,
        email: auth.currentUser?.email || '',
        ...(forceSave && { forceSaved: true, forceSavedAt: serverTimestamp() })
      };
      
      try {
        await updateDoc(progressRef, updateData);
        console.log('💾 Прогресс сохранен в Firestore' + (forceSave ? ' (принудительно)' : ''));
        return true;
      } catch (err) {
        console.error('Ошибка сохранения прогресса:', err);
        
        if (retryCount < 3 && (err.code === 'unavailable' || err.code === 'network-request-failed')) {
          console.log(`🔄 Повторная попытка сохранения (${retryCount + 1}/3)...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          return saveState(forceSave, retryCount + 1);
        }
        
        throw err;
      }
    }
    return false;
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

// Функция для проверки валидности JSON
function validateQuestionsJson(text) {
  try {
    const data = JSON.parse(text);
    
    if (!Array.isArray(data)) {
      return { valid: false, error: 'questions.json должен содержать массив' };
    }
    
    return { valid: true, data: data };
  } catch (error) {
    return { valid: false, error: `Ошибка парсинга JSON: ${error.message}` };
  }
}
  
  // Загрузка вопросов - ИСПРАВЛЕННАЯ ВЕРСИЯ
async function loadQuestions() {
  try {
    console.log('📥 Начинаем загрузку вопросов...');
    
    const response = await fetch("questions.json");
    const text = await response.text();
    
    const validation = validateQuestionsJson(text);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    
    const data = validation.data;
    
    questions = data.map((q, index) => ({
      id: q.id || `q_${index}_${hashString(q.text || '')}`,
      text: q.text || `Вопрос ${index + 1}`,
      answers: Array.isArray(q.answers) ? [...q.answers] : ["Нет ответов"],
      correct: Array.isArray(q.correct) ? [...q.correct] : (q.correct !== undefined ? q.correct : 0)
    }));

    console.log(`📚 Загружено ${questions.length} вопросов`);

    const currentHash = computeQuestionsHash(data);
    
    // Проверяем, нужно ли создавать новую очередь
    const isFirstLoad = !state.mainQueue || state.mainQueue.length === 0;
    const questionsChanged = state.questionHash !== currentHash;
    const needNewQueue = isFirstLoad || questionsChanged;
    
    if (needNewQueue) {
      console.log('🔄 Создаем новую очередь...', isFirstLoad ? '(первая загрузка)' : '(вопросы изменились)');
      
      if (isFirstLoad) {
        // Первая загрузка - полностью перемешиваем все вопросы
        mainQueue = shuffleArray([...Array(questions.length).keys()]);
        console.log('✅ Первая загрузка: все вопросы перемешаны');
      } else {
        // Перезагрузка или обновление вопросов - сохраняем позиции выполненных, перемешиваем невыполненные
        const oldQueue = state.mainQueue;
        
        // Создаем массив для новой очереди той же длины
        const newQueue = new Array(questions.length);
        const usedIndices = new Set();
        
        // Шаг 1: Размещаем выполненные вопросы на их старых позициях
        const completedPositions = []; // [{position: 0, qId: 5}, ...]
        
        oldQueue.forEach((qId, position) => {
          // Проверяем, что вопрос существует в новом наборе и был выполнен
          if (qId < questions.length && state.history[qId]?.checked) {
            // Сохраняем на той же позиции, если возможно
            if (position < newQueue.length) {
              newQueue[position] = qId;
              usedIndices.add(qId);
              completedPositions.push({position, qId});
            }
          }
        });
        
        console.log(`📊 Найдено ${completedPositions.length} выполненных вопросов, сохраняем их позиции`);
        
        // Шаг 2: Собираем все невыполненные вопросы (из старой очереди + новые)
        const uncompletedPool = [];
        
        // Добавляем невыполненные из старой очереди
        oldQueue.forEach((qId) => {
          if (qId < questions.length && !usedIndices.has(qId) && !state.history[qId]?.checked) {
            uncompletedPool.push(qId);
          }
        });
        
        // Добавляем совершенно новые вопросы (которых не было в старой очереди)
        for (let i = 0; i < questions.length; i++) {
          if (!oldQueue.includes(i) && !usedIndices.has(i)) {
            uncompletedPool.push(i);
          }
        }
        
        // Шаг 3: Перемешиваем невыполненные
        const shuffledUncompleted = shuffleArray(uncompletedPool);
        console.log(`🎲 Перемешано ${shuffledUncompleted.length} невыполненных вопросов`);
        
        // Шаг 4: Заполняем пустые позиции перемешанными невыполненными
        let uncompletedIdx = 0;
        for (let i = 0; i < newQueue.length; i++) {
          if (newQueue[i] === undefined && uncompletedIdx < shuffledUncompleted.length) {
            newQueue[i] = shuffledUncompleted[uncompletedIdx];
            uncompletedIdx++;
          }
        }
        
        // Шаг 5: Если остались невыполненные (не должно, но на всякий случай), добавляем в конец
        while (uncompletedIdx < shuffledUncompleted.length) {
          newQueue.push(shuffledUncompleted[uncompletedIdx]);
          uncompletedIdx++;
        }
        
        // Фильтруем undefined (если вдруг позиций меньше чем вопросов)
        mainQueue = newQueue.filter(idx => idx !== undefined);
        
        console.log(`✅ Очередь обновлена: ${completedPositions.length} выполненных на местах, ${shuffledUncompleted.length} невыполненных перемешаны`);
      }
      
      state.mainQueue = mainQueue.slice();
      state.questionHash = currentHash;
    } else {
      // Обычная перезагрузка без изменений - используем сохраненную очередь
      mainQueue = state.mainQueue.slice();
      console.log('✅ Используем сохраненную очередь (перезагрузка без изменений)');
    }

    // Обрабатываем порядок ответов
    state.answersOrder = state.answersOrder || {};
    
    mainQueue.forEach(qId => {
      const q = questions[qId];
      if (!q) return;
      
      const original = q.answers.map((a, i) => ({ text: a, index: i }));
      const origCorrect = Array.isArray(q.correct) ? q.correct.slice() : q.correct;

      let order; 
      if (state.answersOrder[qId] && state.answersOrder[qId].length === q.answers.length) {
        // Используем сохраненный порядок для выполненных вопросов
        order = state.answersOrder[qId].slice();
      } else {
        // Создаем новый случайный порядок для невыполненных
        order = shuffleArray(original.map(a => a.index));
        state.answersOrder[qId] = order.slice();
      }

      q.answers = order.map(i => original.find(a => a.index === i).text);
      q.correct = Array.isArray(origCorrect)
        ? origCorrect.map(c => order.indexOf(c))
        : order.indexOf(origCorrect);
      q._currentOrder = order.slice();
    });

    // Восстанавливаем очередь ошибок
    errorQueue = state.errors && state.errors.length ? state.errors.slice() : [];
    state.errorQueue = errorQueue.slice();

    questionsLoaded = true;
    saveLocalState();
    render();
    
    console.log('✅ Вопросы успешно загружены и отображены');
    
  } catch (err) {
    console.error('❌ Ошибка загрузки вопросов:', err);
    if (qText) qText.innerText = "Не удалось загрузить вопросы ❌";
    throw err;
  }
}
  
// Функция для диагностики JSON файла
async function diagnoseQuestionsFile() {
  try {
    const response = await fetch(`questions.json?t=${Date.now()}`);
    const text = await response.text();
    
    console.log('=== ДИАГНОСТИКА ФАЙЛА ВОПРОСОВ ===');
    console.log('Длина файла:', text.length, 'символов');
    
    const validation = validateQuestionsJson(text);
    if (!validation.valid) {
      console.error('❌ Ошибка валидации:', validation.error);
      return;
    }
    
    const data = validation.data;
    console.log('✅ Валидация пройдена');
    console.log('Количество вопросов:', data.length);
    
  } catch (error) {
    console.error('Ошибка диагностики:', error);
  }
}

// Кнопка принудительной перезагрузки вопросов
let forceReloadBtn = document.getElementById('forceReloadBtn');
if (!forceReloadBtn) {
  forceReloadBtn = document.createElement("button");
  forceReloadBtn.id = 'forceReloadBtn';
  forceReloadBtn.innerText = "⚠️ Перезагрузить вопросы";
  forceReloadBtn.className = "secondary";
  forceReloadBtn.style.marginLeft = "10px";
  forceReloadBtn.style.background = "#FF9800";
  forceReloadBtn.style.color = "white";
  forceReloadBtn.style.fontWeight = "bold";
  forceReloadBtn.onclick = async () => {
    if (confirm('⚠️ Принудительно перезагрузить все вопросы?\n\nЭто сбросит порядок очереди, но сохранит историю ответов.')) {
      state.mainQueue = null;
      state.questionHash = null;
      await loadQuestions();
      showNotification('Вопросы перезагружены!', 'success');
    }
  };
  const controls = document.querySelector(".controls");
  if (controls) controls.appendChild(forceReloadBtn);
}
  
console.log('Для диагностики вызовите: diagnoseQuestionsFile()');
  
  // Функция миграции истории при изменении вопросов
  function migrateHistoryToNewQuestions(oldHistory = {}, oldErrors = [], questionMap = null) {
  const newHistory = {};
  const newErrors = [];
  
  Object.entries(oldHistory).forEach(([oldIdx, data]) => {
    const oldQuestionText = data._questionText || '';
    const key = oldQuestionText.substring(0, 200).toLowerCase().replace(/\s+/g, ' ').trim();
    
    if (questionMap.has(key)) {
      const newIdx = questionMap.get(key);
      newHistory[newIdx] = { ...data };
      
      if (oldErrors.includes(parseInt(oldIdx))) {
        newErrors.push(newIdx);
      }
    } else {
      // Попробуем найти по частичному совпадению
      let foundIdx = -1;
      let maxSimilarity = 0;
      
      for (let i = 0; i < questions.length; i++) {
        const qText = questions[i].text.toLowerCase();
        const oldText = oldQuestionText.toLowerCase();
        
        const similarity = calculateSimilarity(qText, oldText);
        if (similarity > maxSimilarity && similarity > 0.6) {
          maxSimilarity = similarity;
          foundIdx = i;
        }
      }
      
      if (foundIdx !== -1) {
        console.log(`🔍 Вопрос мигрирован по схожести: ${maxSimilarity.toFixed(2)}`);
        newHistory[foundIdx] = { ...data };
        if (oldErrors.includes(parseInt(oldIdx))) {
          newErrors.push(foundIdx);
        }
      }
    }
  });
  
  state.history = newHistory;
  state.errors = newErrors;
  state.errorQueue = newErrors.slice();
  
  console.log(`✅ История мигрирована: ${Object.keys(newHistory).length} вопросов сохранено`);
}

  // Вспомогательная функция для расчета схожести текста
  function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const longerLength = longer.length;
    let distance = 0;
    
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] === longer[i]) {
        distance++;
      }
    }
    
    return distance / longerLength;
  }

  // Вспомогательная функция для создания hash строки
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
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
    if (!questions[qId]) return "unchecked";
    
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
    if (!q) return;
    
    const correctIndexes = Array.isArray(q.correct) ? q.correct : [q.correct];
    const answerEls = answersDiv ? [...answersDiv.children] : [];
    
    answerEls.forEach((el, i) => {
      el.classList.remove("correct", "wrong");
      if (correctIndexes.includes(i)) el.classList.add("correct");
      if (state.history[qId]?.selected?.includes(i) && !correctIndexes.includes(i)) el.classList.add("wrong");
    });
  }

  // Сохранение выбранных ответов с привязкой к ID вопроса
  function saveSelectedAnswers(qId) {
    if (!state.history[qId]) {
      state.history[qId] = {
        selected: [],
        checked: false,
        counted: false,
        _questionId: questions[qId]?.id,
        _questionText: questions[qId]?.text.substring(0, 100)
      };
    }
    
    state.history[qId].selected = [...selected];
    
    const questionId = questions[qId]?.id;
    if (questionId) {
      state.answersByQuestionId[questionId] = {
        selected: [...selected],
        timestamp: Date.now()
      };
    }
    
    saveLocalState();
  }

  // Render question
  function render() {
    // Если вопросы еще не загружены, не рендерим
    if (!questionsLoaded || questions.length === 0) {
      console.log('⏳ Вопросы еще не загружены...');
      return;
    }
    
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
    
    // ПРОВЕРКА: если вопрос не найден
    if (!q) {
      console.error(`❌ Вопрос с индексом ${qId} не найден`);
      qText.innerText = `Ошибка загрузки вопроса. Попробуйте обновить страницу.`;
      answersDiv.innerHTML = "";
      return;
    }
    
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
    
    if (!q) return;

    const correctSet = new Set(Array.isArray(q.correct) ? q.correct : [q.correct]);
    const selectedSet = new Set(selected);

    checked = true;
    if (submitBtn) submitBtn.disabled = true;

    state.history[qId] = state.history[qId] || {};
    state.history[qId]._questionId = q.id;
    state.history[qId]._questionText = q.text.substring(0, 100);

    if (!state.answersOrder[qId] && q._currentOrder) {
      state.answersOrder[qId] = [...q._currentOrder];
    }
    
    if (q.id) {
      state.answersByQuestionId[q.id] = [...q._currentOrder];
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
    saveLocalState();
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
    saveLocalState();
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

  // Reset button
  if (resetBtn) {
    resetBtn.onclick = async () => {
      const user = auth.currentUser;
      if (!user) {
        alert('❌ Пользователь не авторизован');
        return;
      }

      if (!confirm("Вы уверены, что хотите сбросить весь прогресс?\n\nЭто удалит:\n• Все ответы\n• Статистику\n• Ошибки\n• Историю вопросов\n\nДействие необратимо!")) {
        return;
      }

      try {
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
          lastSyncTimestamp: Date.now(),
          questionHash: null,
          answersByQuestionId: {}
        };

        localStorage.removeItem("bioState");
        console.log('🗑️ Локальное хранилище очищено');

        const progressRef = doc(db, USERS_PROGRESS_COLLECTION, user.uid);
        
        await setDoc(progressRef, {
          progress: JSON.stringify(resetState),
          updatedAt: serverTimestamp(),
          email: user.email || '',
          lastUpdated: Date.now(),
          userId: user.uid,
          resetAt: serverTimestamp(),
          resetBy: 'user'
        }, { merge: true });
        
        console.log('🗑️ Прогресс сброшен в Firestore');

        Object.assign(state, resetState);
        
        await loadQuestions();
        
        alert('✅ Прогресс успешно сброшен!\n\nТест начнется с первого вопроса.');

      } catch (error) {
        console.error('❌ Ошибка сброса прогресса:', error);
        alert('❌ Ошибка сброса прогресса: ' + error.message);
      }
    };
  }

  return {
    saveState,
    loadQuestions,
    render,
    state,
    checkForQuestionsUpdate,
    unsubscribe: () => {
      if (autoUpdateCheckInterval) {
        clearInterval(autoUpdateCheckInterval);
      }
    }
  };
}

// Инициализация overlays
if (authOverlay) authOverlay.style.display = 'flex';
if (waitOverlay) waitOverlay.style.display = 'none';

window.initQuiz = initQuiz;




