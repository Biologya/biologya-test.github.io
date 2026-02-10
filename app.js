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
  writeBatch,
  deleteField
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
const ADMIN_NOTIFICATIONS_COLLECTION = "admin_notifications";

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
let notificationsUnsubscribe = null;

/* ====== СИСТЕМА УВЕДОМЛЕНИЙ ДЛЯ АДМИНА ====== */
async function sendAdminNotification(userEmail, userId) {
  try {
    const notificationsRef = collection(db, ADMIN_NOTIFICATIONS_COLLECTION);
    await setDoc(doc(notificationsRef), {
      type: "new_registration",
      userEmail: userEmail,
      userId: userId,
      timestamp: serverTimestamp(),
      status: "unread",
      message: `Новый пользователь: ${userEmail} ожидает подтверждения`,
      actionRequired: true
    });
    
    console.log(`📧 Уведомление админу отправлено для ${userEmail}`);
  } catch (error) {
    console.error('Ошибка отправки уведомления:', error);
  }
}

/* ====== РЕГИСТРАЦИЯ НОВОГО ПОЛЬЗОВАТЕЛЯ ====== */
async function handleUserRegistration(email, password, userId) {
  try {
    console.log(`📝 Регистрация нового пользователя: ${email}`);
    
    // Сохраняем пользователя в Firestore
    await setDoc(doc(db, USERS_COLLECTION, userId), {
      email: email,
      allowed: false, // Доступ закрыт по умолчанию
      createdAt: serverTimestamp(),
      originalPassword: password, // Пароль при регистрации
      passwordChanged: false,
      currentPassword: password, // Текущий пароль для админки
      lastLoginAt: null,
      status: "pending", // Статус заявки
      notifiedAdmin: true,
      authEnabled: true, // Доступ в Auth открыт
      registrationIP: await getClientIP(),
      userAgent: navigator.userAgent,
      notificationSentAt: serverTimestamp()
    });
    
    // Отправляем уведомление админу
    await sendAdminNotification(email, userId);
    
    console.log(`✅ Пользователь ${email} зарегистрирован и ожидает подтверждения`);
    return true;
  } catch (error) {
    console.error('Ошибка регистрации пользователя:', error);
    throw error;
  }
}

/* ====== ПОЛУЧЕНИЕ IP АДРЕСА ====== */
async function getClientIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    return 'unknown';
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
      authBtn.disabled = true;
      authBtn.innerText = 'Вход...';
      
      // Пробуем войти
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
          
          // Регистрируем в Firebase Auth
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          
          // Регистрируем в системе
          await handleUserRegistration(email, password, cred.user.uid);
          
          setStatus('✅ Регистрация успешна! Ожидайте подтверждения администратора.');
          
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
      } else if (e.code === 'auth/user-disabled') {
        setStatus('Аккаунт отключен администратором', true);
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
      lastLoginAt: serverTimestamp(),
      totalLogins: (userDoc.data().totalLogins || 0) + 1
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

/* ====== КНОПКА WHATSAPP ====== */
function createWhatsAppButton() {
  // Создаем кнопку
  const whatsappButton = document.createElement('a');
  whatsappButton.className = 'whatsapp-button pulse';
  whatsappButton.innerHTML = '💬';
  whatsappButton.title = 'Связаться через WhatsApp';
  
  // Ваш номер телефона
  const phoneNumber = '+77718663556';
  const defaultMessage = 'Сәлем, биология тест бойынша сұрақ бар';
  const whatsappUrl = `https://wa.me/77718663556?text=${encodeURIComponent(defaultMessage)}`;
  
  whatsappButton.href = whatsappUrl;
  whatsappButton.target = '_blank';
  whatsappButton.rel = 'noopener noreferrer';
  
  document.body.appendChild(whatsappButton);
  
  // Подсказка при первом посещении
  const whatsappShown = localStorage.getItem('whatsappShown');
  if (!whatsappShown) {
    setTimeout(() => {
      const tooltip = document.createElement('div');
      tooltip.style.cssText = `
        position: fixed;
        bottom: 150px;
        right: 20px;
        background: #333;
        color: white;
        padding: 10px 15px;
        border-radius: 8px;
        z-index: 1001;
        font-size: 14px;
        max-width: 200px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: fadeIn 0.5s;
      `;
      tooltip.innerHTML = 'Есть вопросы?<br>Напишите мне в WhatsApp!';
      tooltip.id = 'whatsapp-tooltip';
      
      document.body.appendChild(tooltip);
      
      setTimeout(() => {
        const tooltipEl = document.getElementById('whatsapp-tooltip');
        if (tooltipEl) {
          tooltipEl.style.opacity = '0';
          tooltipEl.style.transition = 'opacity 0.5s';
          setTimeout(() => {
            if (tooltipEl.parentNode) {
              tooltipEl.parentNode.removeChild(tooltipEl);
            }
          }, 500);
        }
      }, 5000);
      
      localStorage.setItem('whatsappShown', 'true');
    }, 3000);
  }
  
  console.log('✅ Кнопка WhatsApp добавлена');
}

// Добавляем кнопку WhatsApp
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(createWhatsAppButton, 1000);
});

// Также добавляем кнопку при изменении состояния аутентификации
onAuthStateChanged(auth, (user) => {
  if (!document.querySelector('.whatsapp-button')) {
    setTimeout(createWhatsAppButton, 500);
  }
});

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
        display: flex;
        gap: 10px;
      `;
      document.body.appendChild(adminContainer);
    }
    
    adminContainer.innerHTML = '';
    adminContainer.style.display = 'flex';
    
    // Кнопка уведомлений
    const notificationsBtn = document.createElement('button');
    notificationsBtn.id = 'adminNotificationsBtn';
    notificationsBtn.innerHTML = '🔔 <span id="notificationCount" style="background: #f44336; color: white; border-radius: 50%; padding: 2px 6px; font-size: 12px; display: none;">0</span>';
    notificationsBtn.title = 'Уведомления';
    notificationsBtn.style.cssText = `
      background: #FF9800;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      font-size: 14px;
      position: relative;
    `;
    
    notificationsBtn.onclick = async () => {
      await showAdminPanel('notifications');
    };
    
    // Кнопка админа
    const adminBtn = document.createElement('button');
    adminBtn.innerHTML = '👑 Админ';
    adminBtn.style.cssText = `
      background: #4CAF50;
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
      await showAdminPanel('users');
    };
    
    adminContainer.appendChild(notificationsBtn);
    adminContainer.appendChild(adminBtn);
    
    // Слушаем уведомления в реальном времени
    if (notificationsUnsubscribe) {
      notificationsUnsubscribe();
    }
    
    notificationsUnsubscribe = onSnapshot(
      collection(db, ADMIN_NOTIFICATIONS_COLLECTION),
      (snapshot) => {
        const unreadCount = snapshot.docs.filter(doc => 
          doc.data().status === 'unread'
        ).length;
        
        const countSpan = document.getElementById('notificationCount');
        if (countSpan) {
          if (unreadCount > 0) {
            countSpan.innerText = unreadCount > 99 ? '99+' : unreadCount;
            countSpan.style.display = 'inline-block';
            notificationsBtn.style.background = '#f44336';
          } else {
            countSpan.style.display = 'none';
            notificationsBtn.style.background = '#FF9800';
          }
        }
      }
    );
    
  } catch (error) {
    console.error('Ошибка настройки админ панели:', error);
  }
}

/* ====== ФУНКЦИЯ ПОКАЗА АДМИН ПАНЕЛИ ====== */
async function showAdminPanel(defaultTab = 'users') {
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
    
    let adminHTML = '<div class="admin-modal-content">';
    adminHTML += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">';
    adminHTML += '<h3>👑 Панель администратора</h3>';
    adminHTML += '<div>';
    adminHTML += '<button onclick="refreshAdminPanel()" style="background: #2196F3; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">🔄 Обновить</button>';
    adminHTML += '</div>';
    adminHTML += '</div>';
    adminHTML += '<button class="close-modal">✕</button>';
    
    // Вкладки
    adminHTML += `
      <div style="margin-bottom: 20px; display: flex; border-bottom: 2px solid #ddd;">
        <button id="adminTabUsers" onclick="switchAdminTab('users')" 
                style="background: #4CAF50; color: white; padding: 12px 24px; border: none; border-radius: 5px 5px 0 0; cursor: pointer; font-weight: bold; margin-right: 5px;">
          👥 Пользователи
        </button>
        <button id="adminTabNotifications" onclick="switchAdminTab('notifications')" 
                style="background: #FF9800; color: white; padding: 12px 24px; border: none; border-radius: 5px 5px 0 0; cursor: pointer; margin-right: 5px; position: relative;">
          🔔 Уведомления
          <span id="modalNotificationBadge" style="position: absolute; top: -5px; right: -5px; background: #f44336; color: white; border-radius: 50%; width: 20px; height: 20px; display: none; align-items: center; justify-content: center; font-size: 10px;">0</span>
        </button>
        <button id="adminTabAccess" onclick="switchAdminTab('access')" 
                style="background: #9C27B0; color: white; padding: 12px 24px; border: none; border-radius: 5px 5px 0 0; cursor: pointer;">
          🔐 Управление доступом
        </button>
      </div>
    `;
    
    adminHTML += '<div id="adminTabContent" style="border: 2px solid #4CAF50; border-radius: 0 5px 5px 5px; padding: 20px; min-height: 400px; max-height: 70vh; overflow-y: auto;">';
    adminHTML += '<div id="adminLoading" style="text-align: center; padding: 40px;">';
    adminHTML += '<div class="spinner"></div>';
    adminHTML += '<p>Загрузка...</p>';
    adminHTML += '</div>';
    adminHTML += '</div>';
    
    adminHTML += '</div>';
    
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = adminHTML;
    document.body.appendChild(modal);
    
    // Обработчики закрытия
    modal.querySelector('.close-modal').onclick = () => {
      document.body.removeChild(modal);
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    };
    
    // Загружаем уведомления для бейджа
    await updateModalNotificationBadge();
    
    // Загружаем вкладку по умолчанию
    window.switchAdminTab(defaultTab);
    
  } catch (error) {
    console.error('Ошибка открытия админ панели:', error);
    alert('Ошибка открытия админ панели: ' + error.message);
  }
}

/* ====== ОБНОВЛЕНИЕ БЕЙДЖА УВЕДОМЛЕНИЙ В МОДАЛКЕ ====== */
async function updateModalNotificationBadge() {
  try {
    const snapshot = await getDocs(collection(db, ADMIN_NOTIFICATIONS_COLLECTION));
    const unreadCount = snapshot.docs.filter(doc => 
      doc.data().status === 'unread'
    ).length;
    
    const badge = document.getElementById('modalNotificationBadge');
    if (badge) {
      if (unreadCount > 0) {
        badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Ошибка обновления бейджа:', error);
  }
}

/* ====== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ====== */
window.switchAdminTab = async function(tabName) {
  // Обновляем активные кнопки
  ['users', 'notifications', 'access'].forEach(t => {
    const btn = document.getElementById(`adminTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) {
      btn.style.background = tabName === t ? 
        (t === 'users' ? '#4CAF50' : t === 'notifications' ? '#FF9800' : '#9C27B0') : 
        '#757575';
    }
  });
  
  const contentDiv = document.getElementById('adminTabContent');
  if (!contentDiv) return;
  
  contentDiv.innerHTML = '<div id="adminLoading" style="text-align: center; padding: 40px;"><div class="spinner"></div><p>Загрузка...</p></div>';
  
  switch(tabName) {
    case 'users':
      await loadUsersList();
      break;
    case 'notifications':
      await loadNotifications();
      break;
    case 'access':
      await loadAccessControl();
      break;
  }
};

/* ====== ЗАГРУЗКА СПИСКА ПОЛЬЗОВАТЕЛЕЙ ====== */
async function loadUsersList() {
  try {
    const contentDiv = document.getElementById('adminTabContent');
    if (!contentDiv) return;
    
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
    
    let usersHTML = '';
    
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
      
      usersHTML += `
        <div class="admin-user-item" style="${itemStyle} padding: 15px; border-radius: 5px; margin-bottom: 15px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
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
              
              <div style="display: flex; gap: 20px; margin-bottom: 15px; font-size: 13px; color: #777; flex-wrap: wrap;">
                ${data.createdAt 
                  ? `<div>📅 Регистрация: ${new Date(data.createdAt.toMillis()).toLocaleString()}</div>` 
                  : ''
                }
                ${data.lastLoginAt 
                  ? `<div>🕐 Последний вход: ${new Date(data.lastLoginAt.toMillis()).toLocaleString()}</div>` 
                  : '<div>🕐 Никогда не входил</div>'
                }
                ${data.totalLogins 
                  ? `<div>📊 Всего входов: ${data.totalLogins}</div>` 
                  : ''
                }
                ${data.registrationIP 
                  ? `<div>🌐 IP: ${data.registrationIP}</div>` 
                  : ''
                }
              </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 5px; min-width: 200px;">
              <button class="force-reset-btn" onclick="forcePasswordReset('${userId}', '${data.email}')" 
                      style="width: 100%; text-align: left; background: #FF9800; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; margin-bottom: 5px;">
                🔄 Сбросить пароль сейчас
              </button>
              <button onclick="deleteUserAccount('${userId}', '${data.email}')" 
                      style="width: 100%; text-align: left; background: #f44336; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
                🗑️ Удалить аккаунт
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
    const pendingUsers = users.filter(u => !u.data.allowed && u.data.email !== ADMIN_EMAIL).length;
    
    usersHTML = `
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
            <div style="font-size: 24px; font-weight: bold; color: #FF9800;">${onlineUsers}</div>
            <div style="font-size: 12px; color: #666;">Онлайн</div>
          </div>
          <div>
            <div style="font-size: 24px; font-weight: bold; color: #f44336;">${pendingUsers}</div>
            <div style="font-size: 12px; color: #666;">Ожидают доступа</div>
          </div>
        </div>
        <div style="margin-top: 15px; font-size: 14px; color: #666;">
          💡 <strong>Система паролей:</strong> При входе пользователя пароль автоматически меняется.<br>
          Текущий пароль отображается здесь. Для входа пользователь использует пароль из этого поля.
        </div>
      </div>
      
      <div style="margin-bottom: 15px;">
        <button onclick="grantAccessToAllPending()" 
                style="background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin-right: 10px;">
          ✅ Открыть доступ всем ожидающим
        </button>
        <button onclick="revokeAccessFromAll()" 
                style="background: #f44336; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
          ❌ Закрыть доступ всем
        </button>
      </div>
      
      ${usersHTML}
    `;
    
    contentDiv.innerHTML = usersHTML;
    
  } catch (error) {
    console.error('Ошибка загрузки пользователей:', error);
    const contentDiv = document.getElementById('adminTabContent');
    if (contentDiv) {
      contentDiv.innerHTML = `
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
    }
  }
}

/* ====== ЗАГРУЗКА УВЕДОМЛЕНИЙ ====== */
window.loadNotifications = async function() {
  try {
    const contentDiv = document.getElementById('adminTabContent');
    if (!contentDiv) return;
    
    const notificationsRef = collection(db, ADMIN_NOTIFICATIONS_COLLECTION);
    const snapshot = await getDocs(notificationsRef);
    const notifications = [];
    
    snapshot.forEach(docSnap => {
      notifications.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
    
    // Сортируем по дате (новые сверху)
    notifications.sort((a, b) => {
      const aTime = a.timestamp?.toMillis?.() || 0;
      const bTime = b.timestamp?.toMillis?.() || 0;
      return bTime - aTime;
    });
    
    let html = '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">';
    html += '<h4>📋 Уведомления администратора</h4>';
    html += '<div>';
    html += '<button onclick="markAllNotificationsAsRead()" style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">✅ Отметить все как прочитанные</button>';
    html += '<button onclick="clearAllNotifications()" style="background: #f44336; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">🗑️ Очистить все</button>';
    html += '</div>';
    html += '</div>';
    
    if (notifications.length === 0) {
      html += '<p style="color: #666; text-align: center; padding: 40px;">Нет уведомлений</p>';
    } else {
      html += '<div style="max-height: 400px; overflow-y: auto;">';
      
      notifications.forEach(notif => {
        const isUnread = notif.status === 'unread';
        const time = notif.timestamp?.toDate().toLocaleString() || 'Только что';
        
        html += `
          <div style="background: ${isUnread ? '#FFF3E0' : '#f5f5f5'}; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${isUnread ? '#FF9800' : '#4CAF50'};">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                  ${notif.type === 'new_registration' ? '📝' : '🔔'}
                  <strong>${notif.message || 'Новое уведомление'}</strong>
                  ${isUnread ? '<span style="background: #FF9800; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">НОВОЕ</span>' : ''}
                </div>
                <div style="color: #666; font-size: 12px; margin-bottom: 10px;">
                  📧 ${notif.userEmail || 'Неизвестно'} • 
                  🕐 ${time}
                  ${notif.userId ? ` • ID: ${notif.userId.substring(0, 8)}...` : ''}
                </div>
                ${notif.type === 'new_registration' ? `
                  <div style="margin-top: 10px;">
                    <button onclick="quickApproveUser('${notif.userId}', '${notif.userEmail}')" 
                            style="background: #4CAF50; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-right: 5px;">
                      ✅ Быстро открыть доступ
                    </button>
                    <button onclick="viewUserDetails('${notif.userId}')" 
                            style="background: #2196F3; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                      👁️ Посмотреть детали
                    </button>
                  </div>
                ` : ''}
              </div>
              <div>
                ${isUnread ? 
                  `<button onclick="markNotificationAsRead('${notif.id}')" 
                          style="background: #2196F3; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-right: 5px;">
                    ✅ Прочитать
                  </button>` : 
                  `<span style="color: #4CAF50; font-size: 12px;">✅ Прочитано</span>`
                }
                <button onclick="deleteNotification('${notif.id}')" 
                        style="background: #f44336; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-left: 5px;">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `;
      });
      
      html += '</div>';
    }
    
    contentDiv.innerHTML = html;
    
  } catch (error) {
    console.error('Ошибка загрузки уведомлений:', error);
    const contentDiv = document.getElementById('adminTabContent');
    if (contentDiv) {
      contentDiv.innerHTML = `<p style="color: #f44336;">Ошибка: ${error.message}</p>`;
    }
  }
};

/* ====== ЗАГРУЗКА УПРАВЛЕНИЯ ДОСТУПОМ ====== */
window.loadAccessControl = async function() {
  const contentDiv = document.getElementById('adminTabContent');
  if (!contentDiv) return;
  
  const html = `
    <h4 style="margin-top: 0; color: #9C27B0;">🔐 Управление доступом к системе</h4>
    
    <div style="background: #E3F2FD; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #2196F3;">
      <h5 style="margin-top: 0; color: #2196F3;">📋 Быстрые действия</h5>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
        <div style="background: white; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">
          <h6 style="margin-top: 0;">👥 Управление пользователями</h6>
          <p style="font-size: 12px; color: #666;">Массовые операции с доступом</p>
          <button onclick="grantAccessToAllPending()" style="background: #4CAF50; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%; margin-bottom: 8px;">
            ✅ Открыть доступ всем ожидающим
          </button>
          <button onclick="revokeAccessFromAll()" style="background: #f44336; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%;">
            ❌ Закрыть доступ всем
          </button>
        </div>
        
        <div style="background: white; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">
          <h6 style="margin-top: 0;">🔄 Управление паролями</h6>
          <p style="font-size: 12px; color: #666;">Сброс паролей для пользователей</p>
          <button onclick="resetPasswordsForAll()" style="background: #FF9800; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%; margin-bottom: 8px;">
            🔄 Сбросить пароли всем
          </button>
          <button onclick="showResetPasswordDialog()" style="background: #9C27B0; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%;">
            ✏️ Сбросить пароль конкретному
          </button>
        </div>
      </div>
    </div>
    
    <div style="background: #FFF8E1; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #FF9800;">
      <h5 style="margin-top: 0; color: #FF9800;">ℹ️ Как работает система доступа</h5>
      <ul style="color: #666; font-size: 14px; line-height: 1.6;">
        <li><strong>Двойная проверка:</strong> Пользователь получает доступ только если поле <code>allowed = true</code> в Firestore</li>
        <li><strong>Безопасность паролей:</strong> При каждом входе пароль автоматически меняется</li>
        <li><strong>Админ-панель:</strong> Все пароли отображаются здесь для предоставления пользователям</li>
        <li><strong>Уведомления:</strong> Новые регистрации приходят в раздел "Уведомления"</li>
        <li><strong>Статусы:</strong> 
          <span style="background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px;">✅ Доступ открыт</span> 
          <span style="background: #FF9800; color: white; padding: 2px 6px; border-radius: 3px; margin-left: 5px;">❌ Доступ закрыт</span>
        </li>
      </ul>
    </div>
    
    <div style="background: #F3E5F5; padding: 20px; border-radius: 8px; border: 2px solid #9C27B0;">
      <h5 style="margin-top: 0; color: #9C27B0;">⚡ Быстрые ссылки</h5>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button onclick="window.switchAdminTab('users')" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer;">
          👥 Список пользователей
        </button>
        <button onclick="window.switchAdminTab('notifications')" style="background: #FF9800; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer;">
          🔔 Уведомления (${document.getElementById('modalNotificationBadge')?.innerText || '0'})
        </button>
        <button onclick="exportUsersData()" style="background: #2196F3; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer;">
          📊 Экспорт данных
        </button>
        <button onclick="showSystemStats()" style="background: #607D8B; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer;">
          📈 Статистика
        </button>
      </div>
    </div>
  `;
  
  contentDiv.innerHTML = html;
};

/* ====== ФУНКЦИИ УПРАВЛЕНИЯ ДОСТУПОМ ====== */
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

window.grantAccessToAllPending = async function() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const pendingUsers = [];
    
    usersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.email && data.email !== ADMIN_EMAIL && !data.allowed) {
        pendingUsers.push({
          id: docSnap.id,
          email: data.email
        });
      }
    });
    
    if (pendingUsers.length === 0) {
      alert('✅ Нет пользователей, ожидающих доступа');
      return;
    }
    
    if (!confirm(`Открыть доступ ${pendingUsers.length} пользователям?\n\n${pendingUsers.map(u => u.email).join('\n')}`)) {
      return;
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;
    
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 10px; text-align: center; min-width: 300px;">
        <div class="spinner" style="margin: 0 auto 15px;"></div>
        <p style="font-size: 16px; font-weight: bold;">Открываем доступ...</p>
        <p id="progressText" style="color: #666; margin-top: 10px;">0/${pendingUsers.length}</p>
        <div style="height: 10px; background: #eee; border-radius: 5px; margin-top: 10px; overflow: hidden;">
          <div id="progressBar" style="height: 100%; width: 0%; background: #4CAF50; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    let completed = 0;
    for (const user of pendingUsers) {
      try {
        await updateDoc(doc(db, 'users', user.id), {
          allowed: true,
          accessGrantedAt: serverTimestamp(),
          grantedBy: auth.currentUser?.email || 'admin'
        });
        
        completed++;
        const percent = Math.round((completed / pendingUsers.length) * 100);
        
        document.getElementById('progressText').innerText = 
          `${completed}/${pendingUsers.length} - ${user.email}`;
        document.getElementById('progressBar').style.width = `${percent}%`;
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Ошибка для ${user.email}:`, error);
      }
    }
    
    setTimeout(() => {
      document.body.removeChild(modal);
      alert(`✅ Доступ открыт для ${completed} пользователей`);
      window.refreshAdminPanel();
    }, 1000);
    
  } catch (error) {
    console.error('Ошибка массового открытия доступа:', error);
    alert(`❌ Ошибка: ${error.message}`);
  }
};

window.revokeAccessFromAll = async function() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const usersToRevoke = [];
    
    usersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.email && data.email !== ADMIN_EMAIL && data.allowed) {
        usersToRevoke.push({
          id: docSnap.id,
          email: data.email
        });
      }
    });
    
    if (usersToRevoke.length === 0) {
      alert('✅ Нет пользователей с открытым доступом');
      return;
    }
    
    if (!confirm(`⚠️ ВНИМАНИЕ!\n\nВы собираетесь закрыть доступ ${usersToRevoke.length} пользователям!\n\nЭто действие нельзя отменить. Продолжить?`)) {
      return;
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;
    
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 10px; text-align: center; min-width: 300px;">
        <div class="spinner" style="margin: 0 auto 15px;"></div>
        <p style="font-size: 16px; font-weight: bold; color: #f44336;">Закрываем доступ...</p>
        <p id="progressText" style="color: #666; margin-top: 10px;">0/${usersToRevoke.length}</p>
        <div style="height: 10px; background: #eee; border-radius: 5px; margin-top: 10px; overflow: hidden;">
          <div id="progressBar" style="height: 100%; width: 0%; background: #f44336; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    let completed = 0;
    for (const user of usersToRevoke) {
      try {
        await updateDoc(doc(db, 'users', user.id), {
          allowed: false,
          accessRevokedAt: serverTimestamp(),
          revokedBy: auth.currentUser?.email || 'admin'
        });
        
        completed++;
        const percent = Math.round((completed / usersToRevoke.length) * 100);
        
        document.getElementById('progressText').innerText = 
          `${completed}/${usersToRevoke.length} - ${user.email}`;
        document.getElementById('progressBar').style.width = `${percent}%`;
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Ошибка для ${user.email}:`, error);
      }
    }
    
    setTimeout(() => {
      document.body.removeChild(modal);
      alert(`✅ Доступ закрыт для ${completed} пользователей`);
      window.refreshAdminPanel();
    }, 1000);
    
  } catch (error) {
    console.error('Ошибка массового закрытия доступа:', error);
    alert(`❌ Ошибка: ${error.message}`);
  }
};

/* ====== ФУНКЦИИ УПРАВЛЕНИЯ УВЕДОМЛЕНИЯМИ ====== */
window.markNotificationAsRead = async function(notificationId) {
  try {
    await updateDoc(doc(db, ADMIN_NOTIFICATIONS_COLLECTION, notificationId), {
      status: 'read',
      readAt: serverTimestamp()
    });
    
    console.log('✅ Уведомление отмечено как прочитанное');
    await updateModalNotificationBadge();
    window.loadNotifications();
    
  } catch (error) {
    console.error('Ошибка отметки уведомления:', error);
    alert('Ошибка: ' + error.message);
  }
};

window.markAllNotificationsAsRead = async function() {
  try {
    const snapshot = await getDocs(collection(db, ADMIN_NOTIFICATIONS_COLLECTION));
    const unreadNotifications = snapshot.docs.filter(doc => 
      doc.data().status === 'unread'
    );
    
    if (unreadNotifications.length === 0) {
      alert('✅ Нет непрочитанных уведомлений');
      return;
    }
    
    const batch = writeBatch(db);
    unreadNotifications.forEach(doc => {
      const ref = doc.ref;
      batch.update(ref, {
        status: 'read',
        readAt: serverTimestamp()
      });
    });
    
    await batch.commit();
    
    alert(`✅ ${unreadNotifications.length} уведомлений отмечены как прочитанные`);
    await updateModalNotificationBadge();
    window.loadNotifications();
    
  } catch (error) {
    console.error('Ошибка отметки всех уведомлений:', error);
    alert('Ошибка: ' + error.message);
  }
};

window.clearAllNotifications = async function() {
  if (!confirm('Удалить все уведомления?\n\nЭто действие нельзя отменить.')) {
    return;
  }
  
  try {
    const snapshot = await getDocs(collection(db, ADMIN_NOTIFICATIONS_COLLECTION));
    const batch = writeBatch(db);
    
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    alert('✅ Все уведомления удалены');
    await updateModalNotificationBadge();
    window.loadNotifications();
    
  } catch (error) {
    console.error('Ошибка удаления уведомлений:', error);
    alert('Ошибка: ' + error.message);
  }
};

window.deleteNotification = async function(notificationId) {
  if (!confirm('Удалить это уведомление?')) {
    return;
  }
  
  try {
    await deleteDoc(doc(db, ADMIN_NOTIFICATIONS_COLLECTION, notificationId));
    
    console.log('✅ Уведомление удалено');
    await updateModalNotificationBadge();
    window.loadNotifications();
    
  } catch (error) {
    console.error('Ошибка удаления уведомления:', error);
    alert('Ошибка: ' + error.message);
  }
};

/* ====== ФУНКЦИИ БЫСТРОГО УПРАВЛЕНИЯ ====== */
window.quickApproveUser = async function(userId, userEmail) {
  if (!confirm(`Быстро открыть доступ для ${userEmail}?`)) return;
  
  try {
    const userRef = doc(db, 'users', userId);
    
    // Генерируем новый пароль
    const newPassword = generateNewPassword();
    
    await updateDoc(userRef, {
      allowed: true,
      currentPassword: newPassword,
      passwordChanged: true,
      accessGrantedAt: serverTimestamp(),
      grantedBy: auth.currentUser?.email || 'admin',
      quickApproved: true
    });
    
    // Помечаем уведомление как прочитанное
    const notificationsRef = collection(db, ADMIN_NOTIFICATIONS_COLLECTION);
    const snapshot = await getDocs(notificationsRef);
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (data.userId === userId && data.type === 'new_registration') {
        await updateDoc(docSnap.ref, {
          status: 'read',
          readAt: serverTimestamp(),
          actionTaken: 'approved'
        });
        break;
      }
    }
    
    alert(`✅ Доступ открыт для ${userEmail}\n\nНовый пароль: ${newPassword}\n\nСообщите этот пароль пользователю!`);
    
    await updateModalNotificationBadge();
    window.switchAdminTab('users');
    
  } catch (error) {
    console.error('Ошибка быстрого одобрения:', error);
    alert('Ошибка: ' + error.message);
  }
};

window.viewUserDetails = async function(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (!userDoc.exists()) {
      alert('❌ Пользователь не найден');
      return;
    }
    
    const data = userDoc.data();
    
    const details = `
      📧 Email: ${data.email}
      👤 ID: ${userId}
      📅 Регистрация: ${data.createdAt?.toDate().toLocaleString() || 'Неизвестно'}
      🔓 Доступ: ${data.allowed ? '✅ Открыт' : '❌ Закрыт'}
      🔑 Пароль: ${data.currentPassword || 'Не установлен'}
      🕐 Последний вход: ${data.lastLoginAt?.toDate().toLocaleString() || 'Никогда'}
      🌐 IP: ${data.registrationIP || 'Неизвестно'}
      📊 Входов: ${data.totalLogins || 0}
    `;
    
    alert(details);
    
  } catch (error) {
    console.error('Ошибка просмотра деталей:', error);
    alert('Ошибка: ' + error.message);
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
    
    const userRef = doc(db, 'users', userId);
    
    // Сохраняем в Firestore
    await updateDoc(userRef, {
      currentPassword: newPassword,
      passwordChanged: true,
      lastPasswordChange: serverTimestamp(),
      passwordResetBy: auth.currentUser?.email || 'admin',
      passwordResetAt: serverTimestamp()
    });
    
    alert(`✅ Пароль сброшен!\n\nEmail: ${userEmail}\nНовый пароль: ${newPassword}\n\nСообщите этот пароль пользователю!`);
    
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

/* ====== ФУНКЦИЯ УДАЛЕНИЯ АККАУНТА ====== */
window.deleteUserAccount = async function(userId, userEmail) {
  if (!confirm(`⚠️ ВНИМАНИЕ!\n\nВы собираетесь удалить аккаунт пользователя ${userEmail}!\n\nЭто действие:\n• Удалит все данные пользователя\n• Удалит прогресс теста\n• Необратимо!\n\nПродолжить?`)) {
    return;
  }
  
  try {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;
    
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 10px; text-align: center; min-width: 300px;">
        <div class="spinner" style="margin: 0 auto 15px;"></div>
        <p style="font-size: 16px; font-weight: bold; color: #f44336;">Удаляем аккаунт...</p>
        <p id="deleteStatus" style="color: #666; margin-top: 10px;">Начинаем удаление</p>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Удаляем из Firestore
    const batch = writeBatch(db);
    
    // Удаляем пользователя
    const userRef = doc(db, USERS_COLLECTION, userId);
    batch.delete(userRef);
    
    // Удаляем прогресс
    const progressRef = doc(db, USERS_PROGRESS_COLLECTION, userId);
    batch.delete(progressRef);
    
    // Помечаем уведомления как обработанные
    const notificationsRef = collection(db, ADMIN_NOTIFICATIONS_COLLECTION);
    const snapshot = await getDocs(notificationsRef);
    
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.userId === userId) {
        batch.update(docSnap.ref, {
          status: 'deleted',
          userDeleted: true,
          deletedAt: serverTimestamp()
        });
      }
    });
    
    await batch.commit();
    
    document.getElementById('deleteStatus').innerText = '✅ Аккаунт удален!';
    
    setTimeout(() => {
      document.body.removeChild(modal);
      alert(`✅ Аккаунт ${userEmail} полностью удален из системы`);
      window.refreshAdminPanel();
    }, 1500);
    
  } catch (error) {
    console.error('Ошибка удаления аккаунта:', error);
    alert('Ошибка удаления: ' + error.message);
    
    const modal = document.querySelector('div[style*="background: rgba(0,0,0,0.7)"]');
    if (modal) {
      document.body.removeChild(modal);
    }
  }
};

/* ====== ФУНКЦИЯ ОБНОВЛЕНИЯ АДМИН ПАНЕЛИ ====== */
window.refreshAdminPanel = function() {
  const activeTab = document.querySelector('#adminTabContent') ? 
    (document.querySelector('#adminTabUsers')?.style.background === '#4CAF50' ? 'users' :
     document.querySelector('#adminTabNotifications')?.style.background === '#FF9800' ? 'notifications' :
     document.querySelector('#adminTabAccess')?.style.background === '#9C27B0' ? 'access' : 'users') : 'users';
  
  window.switchAdminTab(activeTab);
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
      
      if (notificationsUnsubscribe) {
        notificationsUnsubscribe();
        notificationsUnsubscribe = null;
      }
      
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
        // Это должно произойти только если пользователь зарегистрирован в Auth, но не в нашей системе
        await setDoc(uDocRef, {
          email: user.email || '',
          allowed: false,
          createdAt: serverTimestamp(),
          originalPassword: null,
          passwordChanged: false,
          currentPassword: null,
          lastLoginAt: null,
          status: "pending",
          authEnabled: true
        });
        
        // Отправляем уведомление
        await sendAdminNotification(user.email, user.uid);
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
  // Создаем уникальный ключ для localStorage на основе userId
  const STORAGE_KEY = `bioState_${userId}`;
  
  // Загружаем состояние из localStorage с привязкой к конкретному пользователю
  const savedState = localStorage.getItem(STORAGE_KEY);
  const parsedState = savedState ? JSON.parse(savedState) : null;
  
  const state = {
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
    answersByQuestionId: {},
    queueShuffled: false,
    completedQuestions: [],
    ...parsedState
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
        alert('❌ В облаке нет сохранённого прогресса');
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

      if (confirm(`Загрузить прогресс из облака?\n\n${message}\n\nТекущий локальный прогресс будет заменён.`)) {
        // ВАЖНО: Сбрасываем флаг перемешивания, чтобы при следующей загрузке 
        // выполненные вопросы сохранили свой порядок, а невыполненные перемешались
        cloudState.queueShuffled = false;
        
        // Сохраняем в localStorage с привязкой к пользователю
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudState));
        
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
          
          // Обновляем состояние
          Object.assign(state, cloudState);
          // Сбрасываем флаг для правильного перемешивания при следующей загрузке
          state.queueShuffled = false;
          
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

  // Функция проверки обновлений вопросов
  async function checkForQuestionsUpdate(manualCheck = false) {
    try {
      if (manualCheck) {
        checkUpdatesBtn.disabled = true;
        const originalText = checkUpdatesBtn.innerText;
        checkUpdatesBtn.innerText = "🔄 Проверяем...";
        
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
        
        const currentCount = questions.length || 0;
        const newCount = data.length;
        const addedQuestions = newCount - currentCount;
        
        const shouldUpdate = confirm(
          `📚 Доступно обновление вопросов!\n\n` +
          `Было: ${currentCount} вопросов\n` +
          `Стало: ${newCount} вопросов\n` +
          `(${addedQuestions > 0 ? '+' + addedQuestions : addedQuestions})\n\n` +
          `Обновить сейчас?`
        );
        
        if (shouldUpdate) {
          await updateQuestions(data, newHash);
        } else {
          showNotification('Обновление отложено. Нажмите "Проверить обновления" снова для обновления.', 'info');
        }
        
        checkUpdatesBtn.innerText = originalText;
        checkUpdatesBtn.disabled = false;
        return shouldUpdate;
        
      } else {
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

  // Функция обновления вопросов
  async function updateQuestions(newData, newHash) {
    const originalText = checkUpdatesBtn.innerText;
    checkUpdatesBtn.disabled = true;
    checkUpdatesBtn.innerText = "🔄 Обновляем...";
    
    try {
      console.log('🔄 Начинаем обновление вопросов...');
      
      // Сохраняем историю с привязкой к тексту вопроса
      const historyByText = new Map();
      const errorsByText = new Map();
      
      mainQueue.forEach((qId) => {
        const q = questions[qId];
        if (!q) return;
        
        const history = state.history[qId];
        const textKey = q.text.substring(0, 300).toLowerCase().trim();
        
        if (history && history.checked) {
          const originalSelected = history.selected.map(idx => {
            return q._currentOrder ? q._currentOrder[idx] : idx;
          });
          
          historyByText.set(textKey, {
            originalSelected: originalSelected,
            checked: true,
            counted: history.counted,
            wasCorrect: history.wasCorrect,
            isError: state.errors.includes(qId)
          });
        }
        
        if (state.errors.includes(qId)) {
          errorsByText.set(textKey, {
            errorAttempts: state.errorAttempts[qId] || 0
          });
        }
      });
      
      console.log(`💾 Сохранено ${historyByText.size} выполненных вопросов`);

      // Загружаем новые вопросы
      const validQuestions = [];
      
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
        }
      }
      
      console.log(`✅ Загружено ${validQuestions.length} новых вопросов`);
      
      if (validQuestions.length === 0) {
        throw new Error('Не удалось загрузить ни одного вопроса');
      }
      
      // Обновляем массив вопросов
      questions = validQuestions;
      state.questionHash = newHash;
      
      // Восстанавливаем историю
      const newHistory = {};
      const newErrors = [];
      const completedIds = new Set();
      const uncompletedIds = new Set();
      
      questions.forEach((q, idx) => {
        const textKey = q.text.substring(0, 300).toLowerCase().trim();
        const saved = historyByText.get(textKey);
        const errorInfo = errorsByText.get(textKey);
        
        if (saved) {
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
              _restored: true
            };
            
            if (saved.isError) {
              newErrors.push(idx);
            }
            
            completedIds.add(idx);
            console.log(`✅ Восстановлен выполненный: "${textKey.substring(0, 50)}..."`);
          } else {
            uncompletedIds.add(idx);
          }
        } else {
          uncompletedIds.add(idx);
        }
      });
      
      state.history = newHistory;
      state.errors = newErrors;
      errorQueue = newErrors.slice();
      state.errorQueue = errorQueue.slice();
      
      console.log(`✅ Восстановлено ${completedIds.size} выполненных, ${newErrors.length} ошибок`);

      // Формируем новую очередь
      const completedArray = Array.from(completedIds);
      const uncompletedArray = Array.from(uncompletedIds);
      
      // Перемешиваем только невыполненные
      const shuffledUncompleted = shuffleArray(uncompletedArray);
      
      // Выполненные первыми, затем перемешанные невыполненные
      mainQueue = [...completedArray, ...shuffledUncompleted];
      state.mainQueue = mainQueue.slice();
      
      console.log(`📊 Очередь: ${completedArray.length} выполнены (сохранён порядок), ${shuffledUncompleted.length} невыполнены (перемешаны)`);

      // Обрабатываем порядок ответов
      state.answersOrder = {};
      state.answersByQuestionId = {};
      
      mainQueue.forEach(qIdx => {
        const q = questions[qIdx];
        if (!q) return;
        
        const isCompleted = state.history[qIdx]?._restored;
        const original = q.answers.map((a, i) => ({ text: a, index: i }));
        const origCorrect = Array.isArray(q._originalCorrect) ? q._originalCorrect.slice() : q._originalCorrect;
        
        let order;
        
        if (isCompleted) {
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
          
          const newSelected = savedOriginalSelected.map(origIdx => order.indexOf(origIdx))
            .filter(idx => idx !== -1);
          state.history[qIdx].selected = newSelected;
        } else {
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
      });
      
      questionsLoaded = true;
      saveLocalState();
      
      showNotification(`✅ Обновлено! ${validQuestions.length} вопросов. Выполненные сохранены, невыполненные перемешаны.`, 'success');
      
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
              
              // Сохраняем в localStorage с привязкой к пользователю
              localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    const stateToSave = {
      ...state,
      mainQueue: mainQueue.slice(),
      errorQueue: errorQueue.slice(),
      lastSyncTimestamp: Date.now()
    };
    
    // Сохраняем в localStorage с привязкой к пользователю
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    console.log(`💾 Прогресс сохранён локально для пользователя ${userId}`);
  }
  
  // Функция сохранения прогресса в Firestore с retry
  async function saveState(forceSave = false, retryCount = 0) {
    const timestamp = Date.now();
    state.lastSyncTimestamp = timestamp;
    
    // Сохраняем в localStorage с привязкой к пользователю
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    
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
  
  // Загрузка вопросов
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
      
      // Если хэш изменился или нет очереди - создаем новую
      const needNewQueue = !state.mainQueue || 
                           state.mainQueue.length !== questions.length ||
                           state.questionHash !== currentHash;
      
      if (needNewQueue) {
        console.log('🔄 Создаем новую очередь...');
        
        // Восстанавливаем историю по тексту вопросов для миграции
        const historyByText = new Map();
        const errorsByText = new Map();
        
        if (state.history && Object.keys(state.history).length > 0) {
          Object.entries(state.history).forEach(([oldIdx, data]) => {
            const qText = data._questionText || '';
            const textKey = qText.substring(0, 300).toLowerCase().trim();
            if (textKey && data.checked) {
              historyByText.set(textKey, {
                selected: data.selected || [],
                checked: true,
                counted: data.counted || false,
                wasCorrect: data.wasCorrect,
                isError: state.errors.includes(parseInt(oldIdx))
              });
            }
          });
        }
        
        // Создаем новую очередь с перемешиванием невыполненных
        const completedItems = [];
        const uncompletedItems = [];
        
        questions.forEach((q, idx) => {
          const textKey = q.text.substring(0, 300).toLowerCase().trim();
          const savedHistory = historyByText.get(textKey);
          
          if (savedHistory && savedHistory.checked) {
            completedItems.push({
              index: idx,
              isCompleted: true,
              history: savedHistory
            });
          } else {
            uncompletedItems.push({
              index: idx,
              isCompleted: false
            });
          }
        });
        
        console.log(`✅ Найдено ${completedItems.length} выполненных, ${uncompletedItems.length} невыполненных`);
        
        // Перемешиваем только невыполненные вопросы
        const shuffledUncompleted = shuffleArray(uncompletedItems);
        
        // Формируем финальную очередь
        const finalQueue = new Array(questions.length);
        const usedIndices = new Set();
        
        // Сначала размещаем выполненные вопросы
        completedItems.forEach((item, pos) => {
          let targetPos = pos % finalQueue.length;
          while (finalQueue[targetPos] !== undefined && targetPos < finalQueue.length - 1) {
            targetPos++;
          }
          finalQueue[targetPos] = item.index;
          usedIndices.add(item.index);
          
          // Восстанавливаем историю
          state.history[item.index] = {
            selected: item.history.selected,
            checked: true,
            counted: item.history.counted,
            wasCorrect: item.history.wasCorrect,
            _questionText: questions[item.index].text.substring(0, 100),
            _restored: true
          };
          
          // Восстанавливаем ошибки
          if (item.history.isError) {
            if (!state.errors.includes(item.index)) {
              state.errors.push(item.index);
            }
          }
        });
        
        // Затем заполняем оставшиеся позиции перемешанными невыполненными
        let uncompletedIdx = 0;
        for (let i = 0; i < finalQueue.length; i++) {
          if (finalQueue[i] === undefined && uncompletedIdx < shuffledUncompleted.length) {
            finalQueue[i] = shuffledUncompleted[uncompletedIdx].index;
            uncompletedIdx++;
            
            // Для невыполненных сбрасываем историю
            if (state.history[shuffledUncompleted[uncompletedIdx-1].index]) {
              delete state.history[shuffledUncompleted[uncompletedIdx-1].index];
            }
          }
        }
        
        mainQueue = finalQueue.filter(idx => idx !== undefined);
        state.mainQueue = mainQueue.slice();
        state.questionHash = currentHash;
        
      } else {
        // Используем существующую очередь, но перемешиваем невыполненные
        console.log('🔄 Перемешиваем невыполненные вопросы в существующей очереди...');
        
        mainQueue = state.mainQueue.slice();
        
        // Разделяем на выполненные и невыполненные
        const completedIndices = new Set();
        const uncompletedIndices = [];
        const uncompletedPositions = [];
        
        mainQueue.forEach((qId, position) => {
          if (state.history[qId]?.checked) {
            completedIndices.add(qId);
          } else {
            uncompletedIndices.push(qId);
            uncompletedPositions.push(position);
          }
        });
        
        // Перемешиваем невыполненные
        const shuffledUncompleted = shuffleArray(uncompletedIndices);
        
        // Заменяем невыполненные на новые перемешанные
        shuffledUncompleted.forEach((qId, idx) => {
          const pos = uncompletedPositions[idx];
          if (pos !== undefined) {
            mainQueue[pos] = qId;
          }
        });
        
        state.mainQueue = mainQueue.slice();
      }

      // Обрабатываем порядок ответов - только для невыполненных
      state.answersOrder = state.answersOrder || {};
      
      mainQueue.forEach(qId => {
        const q = questions[qId];
        if (!q) return;
        
        const isCompleted = state.history[qId]?.checked;
        const original = q.answers.map((a, i) => ({ text: a, index: i }));
        const origCorrect = Array.isArray(q.correct) ? q.correct.slice() : q.correct;

        let order;
        
        if (isCompleted && state.answersOrder[qId] && state.answersOrder[qId].length === q.answers.length) {
          // Для выполненных - сохраняем старый порядок
          order = state.answersOrder[qId].slice();
        } else {
          // Для невыполненных - новый случайный порядок
          order = shuffleArray(original.map(a => a.index));
          state.answersOrder[qId] = order.slice();
        }

        q.answers = order.map(i => original.find(a => a.index === i).text);
        q.correct = Array.isArray(origCorrect)
          ? origCorrect.map(c => order.indexOf(c))
          : order.indexOf(origCorrect);
        q._currentOrder = order.slice();
      });

      errorQueue = state.errors && state.errors.length ? state.errors.slice() : [];
      state.errorQueue = errorQueue.slice();

      questionsLoaded = true;
      saveLocalState();
      
      // Автоматическое сохранение в облако
      setTimeout(() => {
        saveState(true).catch(e => console.error('Ошибка автосохранения:', e));
      }, 1000);
      
      render();
      
      console.log('✅ Вопросы успешно загружены');
      
    } catch (err) {
      console.error('❌ Ошибка загрузки вопросов:', err);
      if (qText) qText.innerText = "Не удалось загрузить вопросы ❌";
      throw err;
    }
  }
  
  // Функция для принудительного перемешивания невыполненных
  function reshuffleUncompleted() {
    console.log('🔄 Принудительное перемешивание невыполненных вопросов...');
    
    const completedIndices = new Set();
    const uncompletedIndices = [];
    const uncompletedPositions = [];
    
    mainQueue.forEach((qId, position) => {
      if (state.history[qId]?.checked) {
        completedIndices.add(qId);
      } else {
        uncompletedIndices.push(qId);
        uncompletedPositions.push(position);
      }
    });
    
    const shuffledUncompleted = shuffleArray(uncompletedIndices);
    
    shuffledUncompleted.forEach((qId, idx) => {
      const pos = uncompletedPositions[idx];
      if (pos !== undefined) {
        mainQueue[pos] = qId;
        
        const q = questions[qId];
        if (q) {
          const original = q.answers.map((a, i) => ({ text: a, index: i }));
          const origCorrect = Array.isArray(q.correct) ? q.correct.slice() : q.correct;
          const order = shuffleArray(original.map(a => a.index));
          
          state.answersOrder[qId] = order.slice();
          q.answers = order.map(i => original.find(a => a.index === i).text);
          q.correct = Array.isArray(origCorrect)
            ? origCorrect.map(c => order.indexOf(c))
            : order.indexOf(origCorrect);
          q._currentOrder = order.slice();
        }
      }
    });
    
    state.mainQueue = mainQueue.slice();
    saveLocalState();
    render();
    
    showNotification('Невыполненные вопросы перемешаны!', 'success');
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
          answersByQuestionId: {},
          queueShuffled: false,
          completedQuestions: []
        };

        // Удаляем из localStorage с привязкой к пользователю
        localStorage.removeItem(STORAGE_KEY);
        console.log('🗑️ Локальное хранилище очищено для пользователя', userId);

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
        
        console.log('🗑️ Прогресс сброшен в Firestore для пользователя', userId);

        Object.assign(state, resetState);
        
        await loadQuestions();
        
        alert('✅ Прогресс успешно сброшен!\n\nТест начнётся с первого вопроса.');

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




