// app.js (PocketBase)
import PocketBase from "https://unpkg.com/pocketbase/dist/pocketbase.mjs";

/* ====== Конфиг админа ====== */
const ADMIN_EMAIL = "faceits1mple2000@gmail.com";

/* ====== ИНИЦИАЛИЗАЦИЯ POCKETBASE ====== */
const pb = new PocketBase("http://127.0.0.1:8090"); // или твой deployed URL

/* ====== DOM ЭЛЕМЕНТЫ ====== */
const authOverlay = document.getElementById('authOverlay');
const waitOverlay = document.getElementById('waitOverlay');
const appDiv = document.getElementById('app');
const authBtn = document.getElementById('authBtn');
const statusP = document.getElementById('authStatus');
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');
const logoutBtn = document.getElementById('logoutBtn');
const userEmailSpan = document.getElementById('userEmail');

/* ====== Вспомогательные функции ====== */
function setStatus(text, isError = false) {
  if (!statusP) return;
  statusP.innerText = text;
  statusP.style.color = isError ? '#e53935' : '#444';
}

/* ====== ГЕНЕРАЦИЯ DEVICE ID ====== */
let deviceId = null;
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
    console.log('📱 Сгенерирован новый deviceId:', storedId);
  }
  return storedId;
}
if (!deviceId) deviceId = generateDeviceId();

/* ====== Получение IP ====== */
async function getIPAddress() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (e) {
    console.log('Не удалось получить IP адрес');
    return 'unknown';
  }
}

/* ====== РЕГИСТРАЦИЯ СЕССИИ ====== */
async function registerSession() {
  const ip = await getIPAddress();
  try {
    await pb.collection('sessions').create({
      user: pb.authStore.model.id,
      deviceId: deviceId,
      userAgent: navigator.userAgent.substring(0, 100),
      platform: navigator.platform,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      lastActive: new Date(),
      ipAddress: ip,
      isActive: true
    });
    console.log('📱 Сессия зарегистрирована:', deviceId);
  } catch (error) {
    console.error('Ошибка регистрации сессии:', error);
  }
}

/* ====== ОБНОВЛЕНИЕ АКТИВНОСТИ СЕССИИ ====== */
async function updateSessionActivity() {
  try {
    const sessions = await pb.collection('sessions').getFullList(200, {
      filter: `user="${pb.authStore.model.id}" && deviceId="${deviceId}"`
    });
    if (sessions.length > 0) {
      await pb.collection('sessions').update(sessions[0].id, {
        lastActive: new Date(),
        isActive: true
      });
    } else {
      await registerSession();
    }
  } catch (error) {
    console.error('Ошибка обновления сессии:', error);
  }
}

/* ====== ПРОВЕРКА АКТИВНЫХ СЕССИЙ ====== */
async function checkActiveSessions() {
  try {
    if (pb.authStore.model.email === ADMIN_EMAIL) return; // админ без ограничений

    const allSessions = await pb.collection('sessions').getFullList(200, {
      filter: `user="${pb.authStore.model.id}"`
    });

    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    const activeSessions = allSessions.filter(s => {
      const last = new Date(s.lastActive).getTime();
      return s.isActive && (now - last <= fiveMinutes);
    });

    if (activeSessions.length > 3) {
      const otherSessions = activeSessions.filter(s => s.deviceId !== deviceId);
      let warningMsg = `⚠️ ВНИМАНИЕ! Обнаружено ${activeSessions.length} активных сессий:\n`;
      warningMsg += otherSessions.map(s => `• ${s.deviceId.substring(0,8)} (${s.platform}) - ${new Date(s.lastActive).toLocaleString()}`).join('\n');

      if (!sessionStorage.getItem('sessionWarningShown')) {
        alert(warningMsg);
        sessionStorage.setItem('sessionWarningShown', 'true');
      }
    }

  } catch (error) {
    console.error('Ошибка проверки активных сессий:', error);
  }
}

/* ====== ЛОГИН ПОЛЬЗОВАТЕЛЯ ====== */
async function login(email, password) {
  try {
    await pb.collection("users").authWithPassword(email, password);

    const profile = await pb.collection("profiles").getFirstListItem(
      `user="${pb.authStore.model.id}"`
    );

    if (!profile.allowed) {
      setStatus("Доступ запрещён!", true);
      pb.authStore.clear();
      return false;
    }

    // показываем email
    if (userEmailSpan) userEmailSpan.innerText = pb.authStore.model.email;

    // регистрируем или обновляем сессию
    await registerSession();
    await updateSessionActivity();
    await checkActiveSessions();

    setStatus("Успешный вход!");
    return true;

  } catch (error) {
    console.error("Ошибка входа:", error);
    setStatus("Ошибка входа: проверь email и пароль", true);
    return false;
  }
}

/* ====== ЛОУТ ====== */
logoutBtn?.addEventListener("click", () => {
  pb.authStore.clear();
  setStatus("Вы вышли из системы");
  authOverlay.style.display = 'flex';
  appDiv.style.display = 'none';
});

/* ====== ФОРМА ВХОДА ====== */
authBtn?.addEventListener("click", async () => {
  const email = emailInput.value;
  const password = passInput.value;
  const success = await login(email, password);
  if (success) {
    authOverlay.style.display = 'none';
    appDiv.style.display = 'block';
  }
});

/* ====== АВТОРИЗАЦИЯ + РЕГИСТРАЦИЯ ====== */
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
      // Попытка логина
      await pb.collection("users").authWithPassword(email, password);

      // Проверяем allowed
      const profile = await pb.collection("profiles").getFirstListItem(
        `user="${pb.authStore.model.id}"`
      );

      if (!profile.allowed) {
        setStatus('Доступ запрещён! Ожидайте подтверждения.', true);
        pb.authStore.clear();
        return;
      }

      // Логин успешен
      setStatus('Вход выполнен');
      if (userEmailSpan) userEmailSpan.innerText = pb.authStore.model.email;

      // Регистрируем сессию
      await registerSession();
      await updateSessionActivity();
      await checkActiveSessions();

      // Скрываем форму
      authOverlay.style.display = 'none';
      appDiv.style.display = 'block';

    } catch (err) {
      console.error(err);

      // Если пользователь не найден, создаём
      if (err.data?.code === 400 || err.data?.message?.includes("invalid login")) {
        setStatus('Учётной записи не найдено — создаём...', true);

        try {
          // Создаём нового пользователя
          const newUser = await pb.collection("users").create({
            email: email,
            password: password,
            passwordConfirm: password
          });

          // Создаём профиль с allowed=false
          await pb.collection("profiles").create({
            user: newUser.id,
            allowed: false
          });

          setStatus('Заявка отправлена. Ожидайте подтверждения.');
        } catch (regErr) {
          console.error(regErr);
          setStatus(regErr.message || 'Ошибка регистрации', true);
        }

      } else {
        setStatus('Ошибка авторизации. Проверьте email и пароль.', true);
      }
    }
  });
}

/* ====== ВЫХОД ====== */
async function handleLogout() {
  try {
    // Завершаем сессию в коллекции sessions
    const sessions = await pb.collection("sessions").getFullList(200, {
      filter: `user="${pb.authStore.model.id}" && deviceId="${deviceId}"`
    });

    for (const s of sessions) {
      await pb.collection("sessions").update(s.id, {
        isActive: false,
        logoutAt: new Date(),
        lastActive: new Date()
      });
    }

    // Чистим авторизацию
    pb.authStore.clear();
    sessionStorage.removeItem('sessionWarningShown');

    setStatus('Вы вышли из системы.');
    authOverlay.style.display = 'flex';
    appDiv.style.display = 'none';

  } catch (error) {
    console.error('Ошибка выхода:', error);
    setStatus('Ошибка выхода', true);
  }
}

logoutBtn?.addEventListener("click", handleLogout);
signOutFromWait?.addEventListener("click", handleLogout);

/* ====== ПОМОЩЬ ====== */
helpBtn?.addEventListener("click", () => {
  alert('Админ: PocketBase Admin → collection "profiles" → поставьте allowed = true.\n\nПосле этого пользователь сможет войти.');
});

/* ====== ГЕНЕРАЦИЯ НОВОГО ПАРОЛЯ ====== */
function generateNewPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/* ====== СБРОС ПАРОЛЯ ПРИ ДОСТУПЕ (PocketBase) ====== */
let passwordResetInProgress = false;

async function resetUserPassword(user) {
  if (passwordResetInProgress) {
    console.log('Сброс пароля уже в процессе');
    return;
  }

  // ✅ Админский пароль не трогаем
  if (user.email === ADMIN_EMAIL) {
    console.log(`🔒 Администратор ${ADMIN_EMAIL}: пароль не сбрасывается (статичный)`);

    try {
      const profile = await pb.collection("profiles").getFirstListItem(`user="${user.id}"`);
      await pb.collection("profiles").update(profile.id, {
        currentPassword: ADMIN_STATIC_PASSWORD,
        passwordChanged: true,
        lastPasswordChange: new Date(),
        isAdmin: true,
        lastLogin: new Date(),
        lastSeen: new Date()
      });

      console.log(`%c🔐 СТАТИЧНЫЙ ПАРОЛЬ АДМИНА: ${ADMIN_STATIC_PASSWORD}`, 
                  "color: #FF9800; font-weight: bold; font-size: 16px; background: #000; padding: 10px; border-radius: 5px;");
    } catch (error) {
      console.error('Ошибка обновления данных админа:', error);
    }

    passwordResetInProgress = false;
    return;
  }

  passwordResetInProgress = true;

  try {
    // Получаем профиль пользователя
    const profile = await pb.collection("profiles").getFirstListItem(`user="${user.id}"`);

    // 🔄 Сбрасываем пароль только если его нет
    if (!profile.currentPassword) {
      console.log(`🔧 У пользователя ${user.email} нет пароля, создаем...`);

      const newPassword = generateNewPassword();
      console.log(`🔧 Сгенерирован пароль для ${user.email}: ${newPassword}`);

      // Сохраняем пароль в PocketBase
      await pb.collection("profiles").update(profile.id, {
        currentPassword: newPassword,
        passwordChanged: true,
        lastPasswordChange: new Date(),
        lastLogin: new Date(),
        isAdmin: false,
        lastSeen: new Date()
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

    } else {
      console.log(`✅ У пользователя ${user.email} уже есть пароль: ${profile.currentPassword}`);
      console.log(`📧 Пользователь может использовать этот пароль для входа на других устройствах`);

      // Обновляем только время последнего входа
      await pb.collection("profiles").update(profile.id, {
        lastLogin: new Date(),
        lastSeen: new Date()
      });
    }

  } catch (error) {
    console.error('❌ Ошибка проверки/сброса пароля:', error);
  } finally {
    setTimeout(() => { passwordResetInProgress = false; }, 3000);
  }
}


/* ====== ПАНЕЛЬ АДМИНИСТРАТОРА (PocketBase) ====== */
async function setupAdminPanel(userEmail) {
  try {
    if (userEmail !== ADMIN_EMAIL) {
      const adminContainer = document.getElementById('adminPanelContainer');
      if (adminContainer) adminContainer.style.display = 'none';
      return;
    }

    console.log(`👑 Пользователь ${userEmail} является администратором`);

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

    console.log(`%c🔐 АДМИНИСТРАТОР: ${ADMIN_EMAIL}`, "color: #FF9800; font-weight: bold;");
    console.log(`%c🔑 ПАРОЛЬ: ${ADMIN_STATIC_PASSWORD}`, "color: #4CAF50; font-family: monospace; font-weight: bold;");

  } catch (error) {
    console.error('Ошибка настройки админ панели:', error);
  }
}

/* ====== ФУНКЦИЯ ПОКАЗА АДМИН ПАНЕЛИ (PocketBase) ====== */
async function showAdminPanel() {
  try {
    const currentUser = pb.authStore.model;
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

    // Вставляем HTML в админ контейнер
    let modalContainer = document.getElementById('adminModalContainer');
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = 'adminModalContainer';
      modalContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 1001;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(modalContainer);
    }
    modalContainer.innerHTML = usersHTML;

    // Закрытие модального окна
    modalContainer.querySelector('.close-modal').onclick = () => {
      modalContainer.style.display = 'none';
    };

    modalContainer.style.display = 'block';

  } catch (error) {
    console.error('Ошибка отображения админ панели:', error);
  }
}


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
  if (e.target === modal) document.body.removeChild(modal);
};

// Загружаем пользователей асинхронно
loadUsersList();

// Функция загрузки пользователей с подсчетом активных сессий
async function loadUsersList() {
  try {
    const usersListDiv = document.getElementById('usersList');
    const loadingDiv = document.getElementById('adminLoading');
    if (!usersListDiv || !loadingDiv) return;

    // Получаем всех пользователей из коллекции users
    const usersRecords = await pb.collection("users").getFullList(200 /* max 200 */);

    const usersWithSessions = [];

    for (const user of usersRecords) {
      if (!user.email) continue;

      // Получаем сессии для каждого пользователя из коллекции "sessions"
      let activeCount = 0;
      try {
        const sessionsRecords = await pb.collection("sessions").getFullList(200, { filter: `user="${user.id}"` });
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        sessionsRecords.forEach(session => {
          const lastActive = new Date(session.lastActive).getTime() || 0;
          const isActive = session.isActive !== false && (now - lastActive) <= fiveMinutes;
          if (isActive) activeCount++;
        });

      } catch (sessionError) {
        console.log(`Не удалось загрузить сессии для ${user.email}:`, sessionError.message);
      }

      usersWithSessions.push({
        id: user.id,
        data: user,
        activeSessionCount: activeCount
      });
    }

    // Сортировка
    usersWithSessions.sort((a, b) => {
      // Сначала администраторы
      if (a.data.email === ADMIN_EMAIL || a.data.isAdmin) return -1;
      if (b.data.email === ADMIN_EMAIL || b.data.isAdmin) return 1;

      // Затем пользователи с доступом
      if (a.data.allowed && !b.data.allowed) return -1;
      if (!a.data.allowed && b.data.allowed) return 1;

      // Затем пользователи с >3 активными сессиями
      const aMany = a.activeSessionCount > 3;
      const bMany = b.activeSessionCount > 3;
      if (aMany && !bMany) return -1;
      if (!aMany && bMany) return 1;

      // По email по алфавиту
      return a.data.email.localeCompare(b.data.email);
    });

    // Скрываем индикатор загрузки
    loadingDiv.style.display = 'none';
    usersListDiv.style.display = 'block';

    // Генерируем HTML для списка пользователей
    usersListDiv.innerHTML = '';
    usersWithSessions.forEach(u => {
      const div = document.createElement('div');
      div.style.cssText = 'padding: 8px; border-bottom: 1px solid #ddd;';
      div.innerHTML = `
        <strong>${u.data.email}</strong>
        - ${u.activeSessionCount} активных сессий
        ${u.data.allowed ? '✅ Доступ открыт' : '❌ Доступ закрыт'}
      `;
      usersListDiv.appendChild(div);
    });

  } catch (error) {
    console.error('Ошибка загрузки пользователей:', error);
    document.getElementById('adminLoading').innerText = 'Ошибка загрузки пользователей';
  }
}

// Генерируем HTML списка пользователей
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
            <span class="admin-status" 
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
            ${data.lastLogin ? `<div>📅 Вход: ${new Date(data.lastLogin).toLocaleString()}</div>` : '<div>📅 Вход: никогда</div>'}
            ${data.lastSeen ? `<div>👁️ Активность: ${new Date(data.lastSeen).toLocaleString()}</div>` : ''}
            <div style="color: ${hasManySessions ? '#f44336' : (activeSessionCount > 0 ? '#4CAF50' : '#9E9E9E')}; font-weight: ${hasManySessions ? 'bold' : 'normal'};">
              📱 Сессий: ${activeSessionCount} ${hasManySessions ? ' ⚠️' : ''}
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 5px; min-width: 200px;">
          <button onclick="forcePasswordReset('${userId}', '${data.email}')" 
                  style="width: 100%; text-align: left; background: #FF9800; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
            🔄 Сбросить пароль
          </button>
          
          <button onclick="viewUserSessions('${userId}', '${data.email}')" 
                  style="width: 100%; text-align: left; background: #9C27B0; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
            📱 Управление сессиями (${activeSessionCount})
          </button>
          
          ${hasAccess ? `<button onclick="terminateAllSessions('${userId}', '${data.email}')" 
                            style="width: 100%; text-align: left; background: #f44336; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;">
                            🚫 Завершить все сессии
                          </button>` : ''}
          
          ${hasManySessions ? `<button onclick="alertUser('${userId}', '${data.email}')" 
                            style="width: 100%; text-align: left; background: #FF5722; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
                            ⚠️ Предупредить пользователя
                          </button>` : ''}
        </div>
      </div>
    </div>
  `;
});

document.getElementById('usersList').innerHTML = usersListHTML;

// Статистика пользователей
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
        ⚠️ Внимание: ${usersWithManySessions} пользователей имеют более 3 активных сессий. Проверьте на предмет несанкционированного доступа.
      </div>` 
      : ''
    }
  </div>
  ${usersListHTML}
`;

// Обновляем DOM
const usersListDiv = document.getElementById('usersList');
const loadingDiv = document.getElementById('adminLoading');

if (usersListDiv && loadingDiv) {
  usersListDiv.innerHTML = usersListHTML;
  loadingDiv.style.display = 'none';
  usersListDiv.style.display = 'block';
}

// Глобальная функция обновления
window.refreshAdminPanel = function() {
  if (loadingDiv) loadingDiv.style.display = 'block';
  if (usersListDiv) usersListDiv.style.display = 'none';
  loadUsersList();
};

// Ошибка загрузки пользователей
window.loadUsersList = async function() {
  try {
    // сюда поместите код загрузки пользователей из PocketBase
  } catch (error) {
    console.error('Ошибка загрузки пользователей:', error);
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (usersListDiv) {
      usersListDiv.innerHTML = `
        <div style="color: #f44336; padding: 40px; text-align: center;">
          <strong>Ошибка загрузки пользователей:</strong><br>
          ${error.message}<br>
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
};

/* ====== ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ ДОСТУПА ====== */
window.toggleUserAccess = async function(userId, userEmail, currentAccess) {
  const newAccess = !currentAccess;

  // Подтверждение действия
  const confirmMsg = newAccess
    ? `Открыть доступ пользователю ${userEmail}?`
    : `Закрыть доступ пользователю ${userEmail}?`;

  const details = newAccess
    ? `• Пользователь сможет войти в систему\n• Пароль будет сгенерирован при первом входе`
    : `• Пользователь будет разлогинен\n• Все его сессии будут завершены`;

  if (!confirm(`${confirmMsg}\n\n${details}`)) return;

  try {
    const userRef = doc(db, 'users', userId);

    // Подготовка данных для обновления
    const updateData = {
      allowed: newAccess,
      [`status_${Date.now()}`]: {
        action: newAccess ? 'access_granted' : 'access_revoked',
        by: auth.currentUser?.email || 'admin',
        timestamp: serverTimestamp()
      }
    };

    // Если закрываем доступ — завершить все сессии
    if (!newAccess && currentAccess) {
      updateData.activeSessions = [];

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

    // Сохраняем изменения в пользователе
    await updateDoc(userRef, updateData);

    // Если открываем доступ — показываем пароль
    if (newAccess && !currentAccess) {
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data();

      let passwordMsg = '';
      if (userData.currentPassword) {
        passwordMsg = `\n🔑 Текущий пароль: ${userData.currentPassword}\nПользователь может использовать его для входа.`;
      } else {
        passwordMsg = `\n⚠️ Пароль будет сгенерирован при первом входе пользователя.`;
      }

      alert(`✅ Доступ открыт для ${userEmail}${passwordMsg}`);
    } else {
      alert(`✅ Доступ ${newAccess ? 'открыт' : 'закрыт'} для ${userEmail}`);
    }

    // Логирование действия администратора
    await updateDoc(doc(db, 'admin_logs', `${Date.now()}_${userId}`), {
      userId: userId,
      userEmail: userEmail,
      action: newAccess ? 'access_granted' : 'access_revoked',
      admin: auth.currentUser?.email || 'unknown',
      timestamp: serverTimestamp(),
      details: `Changed access from ${currentAccess} to ${newAccess}`
    });

    // Обновляем панель администратора
    window.refreshAdminPanel();

  } catch (error) {
    console.error('Ошибка переключения доступа:', error);
    alert(`❌ Ошибка: ${error.message}`);
  }
};

/* ====== ФУНКЦИЯ МАССОВОГО УПРАВЛЕНИЯ ДОСТУПОМ ====== */
window.bulkAccessControl = async function(action) {
  // action: 'grant_all', 'revoke_all'

  try {
    // Загружаем всех пользователей, кроме админа
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

    if (users.length === 0) {
      alert('⚠️ Нет пользователей для обработки.');
      return;
    }

    // Определяем действие
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
        console.warn('Неизвестное действие:', action);
        return;
    }

    if (!confirm(confirmMsg)) return;

    // Создаем модальное окно с прогрессом
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div class="admin-modal" style="display: flex; justify-content: center; align-items: center; position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.5); z-index:10000;">
        <div class="admin-modal-content" style="background:white; max-width: 500px; padding: 20px; border-radius: 8px; text-align: center;">
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

    // Выполняем массовое обновление пользователей
    let completed = 0;
    const total = users.length;

    for (const user of users) {
      try {
        // Обновляем доступ и при закрытии доступ удаляем активные сессии
        await updateDoc(doc(db, 'users', user.id), {
          allowed: newAccess,
          ...(newAccess === false ? { activeSessions: [] } : {})
        });

        completed++;
        const percent = Math.round((completed / total) * 100);

        // Обновляем прогресс
        document.getElementById('bulkProgress').innerText = 
          `${newAccess ? 'Открываем доступ' : 'Закрываем доступ'}: ${completed} из ${total}`;
        document.getElementById('progressFill').style.width = `${percent}%`;
        document.getElementById('statusText').innerText = 
          `Обработан: ${user.email} (${user.allowed ? 'был доступ' : 'без доступа'})`;

        // Небольшая задержка для безопасности
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (userError) {
        console.error(`Ошибка для пользователя ${user.email}:`, userError);
      }
    }

    // Завершение и очистка модального окна
    setTimeout(() => {
      document.body.removeChild(modal);
      alert(`✅ Массовое обновление завершено!\n\nОбработано: ${completed} из ${total} пользователей\nДоступ: ${newAccess ? 'открыт' : 'закрыт'}`);
      window.refreshAdminPanel();
    }, 500);

  } catch (error) {
    console.error('Ошибка массового управления доступом:', error);
    alert(`❌ Ошибка массового управления: ${error.message}`);
  }
};

/* ====== ФУНКЦИИ ДЛЯ АДМИНИСТРАТОРА ====== */

// Очистка старых (неактивных) сессий всех пользователей
window.cleanupOldSessions = async function() {
  if (!confirm('Очистить все неактивные сессии (старше 5 минут)?')) return;

  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    let cleanedCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const sessionsSnapshot = await getDocs(collection(db, 'users', userId, 'sessions'));

      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionData = sessionDoc.data();
        const lastActive = sessionData.lastActive?.toDate?.()?.getTime() || 0;

        if (now - lastActive > fiveMinutes) {
          const sessionRef = doc(db, 'users', userId, 'sessions', sessionDoc.id);

          await updateDoc(sessionRef, { isActive: false });

          // Обновляем массив активных сессий пользователя
          await updateDoc(doc(db, 'users', userId), {
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

// Завершение всех активных сессий конкретного пользователя
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

      // Пропускаем текущую сессию текущего пользователя
      if (isCurrentUser && sessionData.deviceId === deviceId) {
        console.log('Пропускаем текущую сессию администратора');
        continue;
      }

      // Завершаем только активные сессии
      if (isRecentlyActive && sessionData.isActive !== false) {
        const sessionRef = doc(db, 'users', userId, 'sessions', sessionDoc.id);

        await updateDoc(sessionRef, {
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
    document.querySelector('.admin-modal')?.remove();
    await showAdminPanel();

  } catch (error) {
    console.error('Ошибка завершения сессий:', error);
    alert('Ошибка завершения сессий: ' + error.message);
  }
};

// Просмотр сессий пользователя — показываем только активные
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

    // Модальное окно
    let sessionsHTML = '<div class="admin-modal-content" style="max-width: 900px;">';
    sessionsHTML += `<h3>📱 Активные сессии пользователя: ${userEmail}</h3>`;
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

    const sessionsSnapshot = await getDocs(collection(db, 'users', userId, 'sessions'));
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    let activeSessions = [];

    sessionsSnapshot.forEach(docSnap => {
      const session = docSnap.data();
      const lastActive = session.lastActive?.toDate?.()?.getTime() || 0;
      const isRecentlyActive = (now - lastActive) <= fiveMinutes;
      const isActive = isRecentlyActive && session.isActive !== false;

      if (isActive) {
        activeSessions.push({
          ...session,
          id: docSnap.id
        });
      }
    });

    if (activeSessions.length === 0) {
      sessionsHTML += '<p style="color: #666; text-align: center; padding: 20px;">Нет активных сессий</p>';
    } else {
      activeSessions.forEach(s => {
        sessionsHTML += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; margin-bottom: 8px; border: 1px solid #ccc; border-radius: 5px;">
            <div style="flex: 1;">
              <strong>Устройство:</strong> ${s.deviceId}<br>
              <small>Последняя активность: ${new Date(s.lastActive?.toDate()).toLocaleString()}</small>
            </div>
            <button onclick="terminateSession('${userId}', '${s.id}', '${userEmail}')" 
                    style="background: #FF9800; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;">
              🔄 Завершить
            </button>
          </div>
        `;
      });
    }

    sessionsHTML += '</div>';

    // Создаем модальное окно
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = sessionsHTML;
    document.body.appendChild(modal);

    // Закрытие модального окна
    modal.querySelector('.close-modal').onclick = () => document.body.removeChild(modal);
    modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };

  } catch (error) {
    console.error('Ошибка загрузки сессий:', error);
    alert('Ошибка загрузки сессий: ' + error.message);
  }
};

// Функция для обновления списка сессий в модальном окне
window.refreshSessionsView = function(userId, userEmail) {
  document.querySelector('.admin-modal')?.remove();
  viewUserSessions(userId, userEmail);
};

// Просмотр сессий пользователя
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

    // Загружаем сессии
    const sessionsSnapshot = await getDocs(collection(db, 'users', userId, 'sessions'));
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    let activeSessions = [];
    let inactiveSessions = [];
    let totalActive = 0;

    sessionsSnapshot.forEach(docSnap => {
      const session = docSnap.data();
      const lastActive = session.lastActive?.toDate?.()?.getTime() || 0;
      const isRecentlyActive = (now - lastActive) <= fiveMinutes;
      const isActive = isRecentlyActive && session.isActive !== false;

      if (isActive) {
        totalActive++;
        activeSessions.push({ ...session, id: docSnap.id, isActive: true });
      } else {
        inactiveSessions.push({ ...session, id: docSnap.id, isActive: false });
      }
    });

    // Активные сессии
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

    // Неактивные сессии (сворачиваемый список)
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

    sessionsHTML += '</div>';

    // Создание модального окна
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = sessionsHTML;
    document.body.appendChild(modal);

    modal.querySelector('.close-modal').onclick = () => document.body.removeChild(modal);
    modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };

  } catch (error) {
    console.error('Ошибка загрузки сессий:', error);
    alert('Ошибка загрузки сессий: ' + error.message);
  }
};

// Функция сворачивания/разворачивания неактивных сессий
window.toggleInactiveSessions = function() {
  const list = document.getElementById('inactiveSessionsList');
  if (list) list.style.display = list.style.display === 'none' ? 'block' : 'none';
};

/* ====== ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ НЕАКТИВНЫХ СЕССИЙ ====== */
window.toggleInactiveSessions = function() {
  const list = document.getElementById('inactiveSessionsList');
  const header = document.querySelector('h4[onclick="toggleInactiveSessions()"]');
  if (!list || !header) return;

  if (list.style.display === 'none') {
    list.style.display = 'block';
    header.innerHTML = header.innerHTML.replace('▼', '▲');
  } else {
    list.style.display = 'none';
    header.innerHTML = header.innerHTML.replace('▲', '▼');
  }
};

/* ====== ФУНКЦИЯ ОБНОВЛЕНИЯ ВИДА СЕССИЙ ====== */
window.refreshSessionsView = function(userId, userEmail) {
  document.querySelector('.admin-modal')?.remove();
  viewUserSessions(userId, userEmail);
};

/* ====== ФУНКЦИЯ ПРИНУДИТЕЛЬНОГО СБРОСА ПАРОЛЯ ====== */
window.forcePasswordReset = async function(userId, userEmail) {
  if (userEmail === ADMIN_EMAIL) {
    alert(`❌ Нельзя сбросить пароль администратора!\nСтатичный пароль: ${ADMIN_STATIC_PASSWORD}`);
    return;
  }

  if (!confirm(`Сбросить пароль для ${userEmail}?\nНовый пароль будет сгенерирован.`)) return;

  try {
    const newPassword = generateNewPassword();

    console.log(`🔧 Генерация пароля для ${userEmail}: ${newPassword}`);

    await updateDoc(doc(db, 'users', userId), {
      currentPassword: newPassword,
      passwordChanged: true,
      lastPasswordChange: serverTimestamp(),
      securityAlerts: arrayUnion({
        type: 'password_reset_by_admin',
        message: `Пароль сброшен администратором. Новый пароль: ${newPassword}`,
        timestamp: serverTimestamp(),
        read: false
      })
    });

    alert(`✅ Пароль сброшен!\n\nEmail: ${userEmail}\nНовый пароль: ${newPassword}\nОтправьте пароль пользователю.`);

    // Логирование в консоли
    console.log(`%c🔧 АДМИН: Принудительный сброс пароля`, "color: #FF9800; font-weight: bold; font-size: 16px;");
    console.log(`%c📧 Email: ${userEmail}`, "color: #2196F3; font-size: 14px;");
    console.log(`%c🔑 Пароль: ${newPassword}`, "color: #FF9800; font-family: monospace; font-size: 16px; font-weight: bold;");

    // Обновляем админ-панель
    document.querySelector('.admin-modal')?.remove();
    await showAdminPanel();

  } catch (error) {
    console.error('Ошибка принудительного сброса пароля:', error);
    alert('Ошибка сброса пароля: ' + error.message);
  }
};

/* ====== ФУНКЦИЯ ПОКАЗА СТАТИСТИКИ ДОСТУПА ====== */
window.showAccessStatistics = async function() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const stats = {
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
      data.allowed ? stats.withAccess++ : stats.withoutAccess++;

      if (data.activeSessions) stats.activeSessions += data.activeSessions.length;

      if (data.lastLogin) {
        const lastLoginTime = data.lastLogin.toDate().getTime();
        if (now - lastLoginTime < oneDay) stats.recentLogins++;
      }
    }

    // Формируем HTML статистики
    const statsHTML = `
      <div class="admin-modal-content" style="max-width: 600px; padding: 20px;">
        <h3>📊 Статистика пользователей</h3>
        <button class="close-modal">✕</button>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; text-align: center; margin-top: 20px;">
          <div><strong>${stats.total}</strong><br><small>Всего пользователей</small></div>
          <div style="color: #4CAF50;"><strong>${stats.withAccess}</strong><br><small>С доступом</small></div>
          <div style="color: #FF9800;"><strong>${stats.withoutAccess}</strong><br><small>Без доступа</small></div>
          <div style="color: #2196F3;"><strong>${stats.activeSessions}</strong><br><small>Активные сессии</small></div>
          <div style="color: #9E9E9E;"><strong>${stats.recentLogins}</strong><br><small>Вход за 24ч</small></div>
        </div>
      </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = statsHTML;
    document.body.appendChild(modal);

    modal.querySelector('.close-modal').onclick = () => document.body.removeChild(modal);
    modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };

  } catch (error) {
    console.error('Ошибка загрузки статистики:', error);
    alert('Ошибка загрузки статистики: ' + error.message);
  }
};

window.showAccessStatistics = async function() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const stats = {
      total: 0,
      withAccess: 0,
      withoutAccess: 0,
      activeSessions: 0
    };

    // Считаем статистику
    usersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      stats.total++;
      if (data.allowed) stats.withAccess++;
      else stats.withoutAccess++;

      if (data.activeSessions) stats.activeSessions += data.activeSessions.length;
    });

    // Защита от деления на 0
    const percentWithAccess = stats.total ? ((stats.withAccess / stats.total) * 100).toFixed(1) : 0;
    const percentWithoutAccess = stats.total ? ((stats.withoutAccess / stats.total) * 100).toFixed(1) : 0;

    const html = `
      <div class="admin-modal">
        <div class="admin-modal-content" style="max-width: 600px;">
          <h3>📊 Статистика доступа пользователей</h3>
          <button class="close-modal">✕</button>

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
                <span>С доступом:</span><span>${percentWithAccess}%</span>
              </div>
              <div style="height: 20px; background: #eee; border-radius: 10px; overflow: hidden;">
                <div style="height: 100%; width: ${percentWithAccess}%; background: #4CAF50;"></div>
              </div>
            </div>
            <div style="margin: 10px 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Без доступа:</span><span>${percentWithoutAccess}%</span>
              </div>
              <div style="height: 20px; background: #eee; border-radius: 10px; overflow: hidden;">
                <div style="height: 100%; width: ${percentWithoutAccess}%; background: #FF9800;"></div>
              </div>
            </div>
          </div>

          <div style="margin-top: 20px; text-align: center;">
            <button onclick="bulkAccessControl('grant_all')" 
                    style="background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
              ✅ Открыть доступ всем
            </button>
            <button class="close-modal-btn" 
                    style="background: #9E9E9E; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">
              Закрыть
            </button>
          </div>
        </div>
      </div>
    `;

    // Добавляем модалку в DOM
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    // Навешиваем события закрытия
    const modal = document.querySelector('.admin-modal');
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.querySelector('.close-modal-btn').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  } catch (error) {
    console.error('Ошибка загрузки статистики:', error);
    alert('Ошибка загрузки статистики: ' + error.message);
  }
};

// Пользователь вошёл
if (authOverlay) {
  authOverlay.setAttribute('inert', '');
  authOverlay.style.display = 'none';
}

if (userEmailSpan) userEmailSpan.innerText = user.email || '';

deviceId = generateDeviceId();
await registerSession(user.uid);
await checkActiveSessions(user.uid, user.email);

// Обновляем активность сессии каждые 30 секунд
sessionCheckInterval = setInterval(async () => {
  if (user) {
    await updateSessionActivity(user.uid);
  }
}, 30000);

// Настройка панели администратора (если пользователь — админ)
await setupAdminPanel(user.email);

const uDocRef = doc(db, 'users', user.uid);
progressDocRef = doc(db, 'usersanswer', user.uid);

// Создание документа пользователя, если его нет
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

// Realtime слушатель документа пользователя
userUnsubscribe = onSnapshot(uDocRef, async (docSnap) => {
  if (!docSnap.exists()) return;

  const data = docSnap.data();
  const allowed = data.allowed === true;

  if (allowed) {
    if (authOverlay) authOverlay.style.display = 'none';
    if (waitOverlay) waitOverlay.style.display = 'none';
    if (appDiv) appDiv.style.display = 'block';
    setStatus('');

    // 🔄 Проверка необходимости сброса пароля
    try {
      let shouldReset = false;
      let reason = '';

      if (!data.passwordChanged) {
        shouldReset = true;
        reason = 'пароль никогда не менялся';
      } else if (!data.currentPassword) {
        shouldReset = true;
        reason = 'текущий пароль отсутствует в базе';
      }

      // ❌ Не сбрасываем пароль для администратора
      if (user.email === ADMIN_EMAIL) {
        console.log('🔒 Администратор: пароль остается статичным');
        shouldReset = false;
      }

      if (shouldReset && !passwordResetInProgress) {
        console.log(`🔄 Запуск сброса пароля (${reason})...`);
        // Даем время для загрузки интерфейса
        setTimeout(async () => {
          await resetUserPassword(user);
        }, 1000);
      } else if (passwordResetInProgress) {
        console.log('Сброс пароля уже в процессе...');
      } else if (user.email === ADMIN_EMAIL) {
        console.log('✅ Администратор: статичный пароль актуален');
      } else {
        console.log('✅ Пароль актуален, пользователь может входить на других устройствах');
        // Обновляем время последнего входа
        try {
          await updateDoc(uDocRef, {
            lastLogin: serverTimestamp(),
            lastSeen: serverTimestamp()
          });
        } catch (error) {
          console.error('Ошибка обновления времени входа:', error);
        }
      }
    } catch (error) {
      console.error('Ошибка при проверке сброса пароля:', error);
    }

    // Инициализация теста, если ещё не запущен
    if (!quizInitialized) {
      quizInstance = initQuiz(progressDocRef);
      quizInitialized = true;
    }

  } else {
    // Пользователю закрыт доступ
    if (authOverlay) authOverlay.style.display = 'none';
    if (waitOverlay) waitOverlay.style.display = 'flex';
    if (appDiv) appDiv.style.display = 'none';
    setStatus('Доступ закрыт администратором.');
  }
}, (err) => {
  console.error('Ошибка realtime-слушателя пользователя:', err);
});

/* ====== СИСТЕМА ТЕСТА С СИНХРОНИЗАЦИЕЙ ====== */
function initQuiz(progressRef) {
  // ====== Инициализация состояния ======
  const state = JSON.parse(localStorage.getItem("bioState")) || {
    queueType: "main",       // "main" или "errors"
    index: 0,                // текущий индекс в очереди
    mainIndex: 0,            // индекс в основной очереди
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

  // ====== Кнопка выхода из режима ошибок ======
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

  // ====== Асинхронная загрузка прогресса из Firestore ======
  (async () => {
    if (!progressRef) return;

    try {
      const snap = await getDoc(progressRef);

      if (snap.exists()) {
        const data = snap.data();
        if (data.progress) {
          try {
            const savedState = JSON.parse(data.progress);

            if (data.updatedAt) {
              const remoteTime = data.updatedAt.toMillis();
              const localTime = state.lastSyncTimestamp || 0;

              // Синхронизация: если прогресс на сервере свежее
              if (remoteTime > localTime) {
                console.log('📥 Загружаем прогресс с сервера...');

                const currentIndex = state.index;
                const currentQueueType = state.queueType;

                Object.assign(state, savedState);
                state.lastSyncTimestamp = remoteTime;

                const queueLength = state.queueType === "main"
                  ? (state.mainQueue?.length || 0)
                  : (state.errorQueue?.length || 0);

                // Сохраняем текущий индекс в пределах новой очереди
                if (currentQueueType === state.queueType) {
                  state.index = Math.min(currentIndex, Math.max(0, queueLength - 1));
                }

                console.log('✅ Прогресс синхронизирован с сервера');
              }
            }
          } catch (err) {
            console.error('Ошибка разбора сохранённого состояния:', err);
          }
        }
      } else {
        // Создание нового документа прогресса
        await setDoc(progressRef, {
          progress: JSON.stringify(state),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          email: auth.currentUser?.email || '',
          lastSync: Date.now(),
          deviceId: deviceId
        });
        console.log('📝 Создан новый документ прогресса');
      }
    } catch (e) {
      console.error('Ошибка загрузки прогресса:', e);
    }

    // ====== Загрузка вопросов ======
    loadQuestions();
  })();
}

// ====== Сохранение прогресса ======
function saveState() {
  try {
    const timestamp = Date.now();
    state.lastSyncTimestamp = timestamp;

    // Локальное сохранение
    localStorage.setItem("bioState", JSON.stringify(state));

    // Firestore
    if (progressRef) {
      updateDoc(progressRef, {
        progress: JSON.stringify(state),
        updatedAt: serverTimestamp(),
        email: auth.currentUser?.email || '',
        lastUpdated: timestamp,
        deviceId: deviceId,
        selectedAnswers: state.history
      }).then(() => {
        console.log('💾 Прогресс сохранен в Firestore');
      }).catch(err => {
        console.error('❌ Ошибка сохранения прогресса:', err);
      });
    }
  } catch (error) {
    console.error('❌ Ошибка в saveState:', error);
  }
}

// ====== Функция перемешивания массива ======
function shuffleArray(arr) {
  const newArr = [...arr];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

// ====== Загрузка вопросов ======
function loadQuestions() {
  fetch("questions.json")
    .then(response => response.json())
    .then(data => {
      // Инициализация вопросов
      questions = data.map(q => ({
        text: q.text,
        answers: q.answers.slice(),
        correct: Array.isArray(q.correct) ? q.correct.slice() : q.correct
      }));

      // Подготовка очередей и порядка ответов
      state.answersOrder = state.answersOrder || {};
      state.mainQueue = state.mainQueue || null;
      state.errorQueue = state.errorQueue || [];

      // Основная очередь
      if (!state.mainQueue || state.mainQueue.length !== questions.length) {
        mainQueue = [...Array(questions.length).keys()];
        mainQueue = shuffleArray(mainQueue);
      } else {
        mainQueue = state.mainQueue.slice();

        // Перемешиваем только непроверенные вопросы
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

      // Перемешивание вариантов ответов для каждого вопроса
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

      // Очередь ошибок
      errorQueue = state.errorQueue.length ? state.errorQueue.slice() : (state.errors ? state.errors.slice() : []);
      state.errorQueue = errorQueue.slice();

      // Сохраняем состояние и рендерим
      saveState();
      render();
    })
    .catch(err => {
      console.error('❌ Ошибка загрузки вопросов:', err);
      if (qText) qText.innerText = "Не удалось загрузить вопросы ❌";
    });
}

// ====== Хелперы для очередей ======
function currentQueue() {
  return state.queueType === "main" ? mainQueue : errorQueue;
}

function allChecked() {
  return currentQueue().every(qId => state.history[qId]?.checked);
}

// ====== Кнопка "Prev" ======
if (prevBtn) {
  prevBtn.onclick = () => {
    if (state.index > 0) {
      state.index--;
      render();
    }
  };
}

// ====== Рендер панели вопросов с постраничной навигацией ======
function renderQuestionPanel() {
  const queue = currentQueue();
  if (!questionPanel) return;

  const questionsPerPage = 50;
  const page = Math.floor(state.index / questionsPerPage);

  // Сохраняем текущую страницу для main/error очереди
  if (state.queueType === "main") currentPanelPage = page;
  else currentPanelPageErrors = page;

  const start = page * questionsPerPage;
  const end = Math.min(start + questionsPerPage, queue.length);

  // Очистка панели
  questionPanel.innerHTML = "";

  // Создаем кнопки вопросов на странице
  queue.slice(start, end).forEach((qId, idx) => {
    const btn = document.createElement("button");
    btn.innerText = start + idx + 1;

    const status = getButtonStatus(qId);   // например: "correct", "wrong", "unchecked"
    applyButtonStyles(btn, status);

    btn.onclick = () => {
      state.index = queue.indexOf(qId);
      render();
    };

    questionPanel.appendChild(btn);
  });

  // ====== Навигация по страницам ======
  if (!pageNav) return;
  pageNav.innerHTML = "";

  const totalPages = Math.ceil(queue.length / questionsPerPage);
  const startPage = Math.max(page - 1, 0);
  const endPage = Math.min(page + 1, totalPages - 1);

  for (let p = startPage; p <= endPage; p++) {
    const navBtn = document.createElement("button");
    navBtn.innerText = p + 1;

    const activePage = state.queueType === "main" ? currentPanelPage : currentPanelPageErrors;
    navBtn.classList.toggle("active", p === activePage);

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

// ====== Определение статуса кнопки ======
function getButtonStatus(qId) {
  const history = state.history[qId];
  if (!history) return "unchecked";

  const selected = history.selected || [];
  const correct = Array.isArray(questions[qId].correct)
    ? questions[qId].correct
    : [questions[qId].correct];

  if (history.checked) {
    const ok = correct.every(c => selected.includes(c)) && selected.length === correct.length;
    return ok ? "correct" : "wrong";
  } 
  if (selected.length > 0) return "selected";
  return "unchecked";
}

// ====== Применение стилей к кнопке ======
function applyButtonStyles(btn, status) {
  const styles = {
    correct: ["#4caf50", "#fff"],
    wrong: ["#e53935", "#fff"],
    selected: ["#2196F3", "#fff"],
    unchecked: ["#fff", "#000"]
  };

  const [bg, color] = styles[status] || ["#fff", "#000"];
  btn.style.background = bg;
  btn.style.color = color;
  btn.style.borderColor = bg;

  const btnNumber = parseInt(btn.innerText) - 1;
  if (state.index === btnNumber) {
    btn.style.border = "2px solid #2196F3";
    btn.style.boxShadow = "0 0 8px rgba(33,150,243,0.7)";
  } else {
    btn.style.border = `1px solid ${btn.style.borderColor || "#ccc"}`;
    btn.style.boxShadow = "none";
  }
}

// ====== Подсветка правильных/неправильных ответов ======
function highlightAnswers(qId) {
  const q = questions[qId];
  const correctIndexes = Array.isArray(q.correct) ? q.correct : [q.correct];
  [...answersDiv.children].forEach((el, i) => {
    el.classList.remove("correct", "wrong");
    if (correctIndexes.includes(i)) el.classList.add("correct");
    if (state.history[qId]?.selected?.includes(i) && !correctIndexes.includes(i))
      el.classList.add("wrong");
  });
}

// ====== Сохранение выбранных ответов ======
function saveSelectedAnswers(qId) {
  if (!state.history[qId]) state.history[qId] = { selected: [], checked: false, counted: false };
  state.history[qId].selected = [...selected];
  saveState();
}

// ====== Рендер вопроса ======
function render() {
  const queue = currentQueue();
  if (exitErrorsBtn) exitErrorsBtn.style.display = state.queueType === "errors" ? "inline-block" : "none";
  if (!qText || !answersDiv) return;

  if (!queue.length) {
    qText.innerText = "Вопросов нет 😎";
    answersDiv.innerHTML = "";
    if (submitBtn) submitBtn.style.display = nextBtn.style.display = "none";
    return;
  }

  if (state.index >= queue.length) {
    state.queueType === "errors" ? exitErrorsBtn.click() : showResult();
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
        selected.has(i) ? selected.delete(i) : selected.add(i);
        el.classList.toggle("selected");
        el.classList.toggle("highlight");
        saveSelectedAnswers(qId);
      }
    };

    answersDiv.appendChild(el);
  });

  if (checked || state.queueType === "errors") highlightAnswers(qId);
  if (submitBtn) submitBtn.disabled = checked;
  updateUI();
}

// ====== Проверка и подсчет ответов ======
if (submitBtn) submitBtn.onclick = () => {
  if (!checked) checkAnswers();
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
  state.history[qId].selected = [...selected];
  state.history[qId].checked = true;

  if (!state.answersOrder[qId] && q._currentOrder) {
    state.answersOrder[qId] = [...q._currentOrder];
  }

  const isCorrect =
    correctSet.size === selectedSet.size &&
    [...correctSet].every(c => selectedSet.has(c));

  // Работа с ошибками
  if (isCorrect) {
    state.errors = state.errors.filter(id => id !== qId);
    state.errorQueue = state.errorQueue.filter(id => id !== qId);
  } else {
    if (!state.errors.includes(qId)) state.errors.push(qId);
    if (!state.errorQueue.includes(qId)) state.errorQueue.push(qId);
  }

  // Подсчет статистики только для основной очереди
  if (!state.history[qId].counted && state.queueType === "main") {
    state.stats[isCorrect ? "correct" : "wrong"]++;
    state.history[qId].counted = true;
  }

  // Подсчет попыток в режиме ошибок
  if (state.queueType === "errors") {
    state.errorAttempts[qId] = (state.errorAttempts[qId] || 0) + 1;
  }

  highlightAnswers(qId);
  state.mainQueue = [...mainQueue];
  state.errorQueue = [...state.errorQueue];
  saveState();
  renderQuestionPanel();
}

// ====== Кнопка "Следующий" ======
if (nextBtn) nextBtn.onclick = () => {
  const queue = currentQueue();
  const allDone = allChecked();

  if (state.index < queue.length - 1) {
    state.index++;
  } else if (allDone) {
    state.queueType === "errors" ? exitErrorsBtn.click() : showResult();
  } else {
    const nextUnanswered = queue.findIndex(qId => !state.history[qId]?.checked);
    if (nextUnanswered !== -1) state.index = nextUnanswered;
  }

  render();
};

// ====== Режим ошибок ======
if (errorsBtn) errorsBtn.onclick = () => {
  if (!state.errors.length) {
    alert("Ошибок пока нет 👍");
    return;
  }

  if (state.queueType !== "errors") state.mainIndex = state.index;
  state.queueType = "errors";
  state.index = 0;
  errorQueue = state.errors.slice();
  state.errorQueue = errorQueue.slice();
  saveState();
  render();
};

// ====== Обновление UI ======
function updateUI() {
  const queue = currentQueue();
  if (progressText)
    progressText.innerText = `Вопрос ${state.index + 1} из ${queue.length}`;
  if (progressFill)
    progressFill.style.width = `${queue.length ? (state.index / queue.length) * 100 : 0}%`;
  if (statsDiv)
    statsDiv.innerText = `✔ ${state.stats.correct} ✖ ${state.stats.wrong}`;
}

// ====== Показ результатов ======
function showResult() {
  const total = state.stats.correct + state.stats.wrong;
  const correctPercent = total ? ((state.stats.correct / total) * 100).toFixed(1) : 0;
  const wrongPercent = total ? ((state.stats.wrong / total) * 100).toFixed(1) : 0;

  if (qText) qText.innerText = "Тест завершён 🎉";
  if (answersDiv) answersDiv.innerHTML = `
    <div>✔ Правильные: ${state.stats.correct} (${correctPercent}%)</div>
    <div>✖ Неправильные: ${state.stats.wrong} (${wrongPercent}%)</div>
  `;

  [submitBtn, nextBtn, exitErrorsBtn].forEach(btn => {
    if (btn) btn.style.display = "none";
  });

  updateUI();
}

// ====== Сброс теста ======
if (resetBtn) resetBtn.onclick = () => {
  if (!confirm("Вы уверены? Это удалит весь прогресс!")) return;

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

  const saveAndReload = () => location.reload();

  if (progressRef) {
    updateDoc(progressRef, {
      progress: JSON.stringify(resetState),
      updatedAt: serverTimestamp()
    }).then(saveAndReload).catch(err => {
      console.error('Ошибка сброса:', err);
      saveAndReload();
    });
  } else {
    saveAndReload();
  }
};

// ====== Глобальный доступ ======
window.initQuiz = initQuiz;

// ====== Инициализация overlays ======
if (authOverlay) authOverlay.style.display = 'flex';
if (waitOverlay) waitOverlay.style.display = 'none';


