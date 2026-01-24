const supabaseUrl = 'sb_publishable_txbkLZsGJl0lZTXWR5Tjwg_cuq9O8ud';
const supabaseKey = 'sb_secret_0YW2EkwtY07k81BoFCKBtw_zqXUHK7F';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

async function signUp() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) alert(error.message);
  else alert('Регистрация успешна! Проверь почту.');
}
