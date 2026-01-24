const supabaseUrl = 'sb_publishable_txbkLZsGJl0lZTXWR5Tjwg_cuq9O8ud';
const supabaseKey = 'sb_secret_0YW2EkwtY07k81BoFCKBtw_zqXUHK7F';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// ====== Регистрация ======
async function signUp() {
  const email = prompt("Введите email для регистрации:");
  const password = prompt("Введите пароль:");
  if (!email || !password) return alert("Email и пароль обязательны!");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) alert("Ошибка регистрации: " + error.message);
  else alert("Регистрация успешна! Проверьте почту.");
}

// ====== Вход ======
async function signIn() {
  const email = prompt("Введите email для входа:");
  const password = prompt("Введите пароль:");
  if (!email || !password) return alert("Email и пароль обязательны!");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) alert("Ошибка входа: " + error.message);
  else alert("Вход успешен! Добро пожаловать, " + data.user.email);
}

// ====== Одноразовый пароль (OTP) ======
async function checkOTP() {
  const code = prompt("Введите одноразовый код:");
  if (!code) return alert("Введите код!");

  const { data, error } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('code', code)
    .eq('used', false)
    .single();

  if (error) return alert("Ошибка проверки: " + error.message);

  if (data) {
    // Отмечаем код как использованный
    await supabase.from('otp_codes').update({ used: true }).eq('id', data.id);
    alert("Доступ разрешён! Можешь пользоваться тестом.");
  } else {
    alert("Неверный или уже использованный код!");
  }
}
