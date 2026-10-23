'use strict';
const form = document.querySelector('#registro');
const status = document.querySelector('#estado');
const resend = document.querySelector('#reenvio');
const submit = form.querySelector('button');
const profile = form.elements.perfil;
let captchaToken = '';
let widgetId;
let pendingAccount;
function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}
function updateFields() {
  const buyer = profile.value === 'comprador';
  document.querySelector('#comprador').hidden = !buyer;
  form.elements.numeroDocumento.required = buyer;
  document.querySelector('#documento-label').textContent = form.elements.pais.value === 'AR' ? 'Número de DNI' : 'Número de CI';
}
const requestedProfile = new URLSearchParams(location.search).get('perfil');
if (requestedProfile === 'cargador') profile.value = requestedProfile;
profile.addEventListener('change', updateFields);
form.elements.pais.addEventListener('change', updateFields);
updateFields();
async function post(path, data) {
  const response = await fetch(`/api/mercado/v1/auth/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'No se pudo completar la solicitud.');
  return body;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!captchaToken || submit.disabled || !form.reportValidity()) return;
  submit.disabled = true;
  const data = Object.fromEntries(new FormData(form));
  data.captcha = captchaToken;
  if (profile.value === 'comprador') data.tipoDocumento = data.pais === 'AR' ? 'DNI' : 'CI_PY';
  try {
    const result = await post(profile.value === 'comprador' ? 'registro' : 'registro-cargador', data);
    if (result.pendiente !== true) throw new Error('El servidor no confirmó el estado del alta.');
    pendingAccount = { email: data.email, perfil: profile.value };
    form.elements.password.value = '';
    form.hidden = true;
    resend.hidden = false;
    message(result.aviso || 'Revisá tu correo para confirmar la cuenta y volvé a ingresar en la app.');
  } catch (error) {
    message(error.name === 'TimeoutError' ? 'La solicitud tardó demasiado. Revisá tu correo antes de reintentar.' : error.message || 'No se pudo conectar.', true);
  } finally {
    captchaToken = '';
    if (widgetId !== undefined) window.turnstile.reset(widgetId);
  }
});
resend.addEventListener('submit', async event => {
  event.preventDefault();
  const button = resend.querySelector('button');
  if (button.disabled || !pendingAccount) return;
  button.disabled = true;
  try {
    const result = await post('reenviar', pendingAccount);
    message(result.aviso);
  } catch (error) {
    message(error.message || 'No se pudo reenviar.', true);
  } finally { button.disabled = false; }
});
(async () => {
  try {
    const response = await fetch('/api/mercado/v1/auth/config', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('No se pudo comprobar el registro.');
    const config = await response.json();
    if (!config.registroDisponible || !config.siteKey) throw new Error('El registro no está disponible: falta habilitar captcha y correo en este servidor. Podés seguir ingresando desde la app con una cuenta existente.');
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload = () => {
      form.hidden = false;
      widgetId = window.turnstile.render('#captcha', {
        sitekey: config.siteKey,
        callback: token => { captchaToken = token; submit.disabled = false; },
        'expired-callback': () => { captchaToken = ''; submit.disabled = true; },
        'error-callback': () => { captchaToken = ''; submit.disabled = true; message('No se pudo verificar el captcha. Recargá la página.', true); },
      });
      message('Completá tus datos y la verificación de seguridad.');
    };
    script.onerror = () => message('No se pudo cargar el captcha. Recargá la página.', true);
    document.head.append(script);
  } catch (error) { message(error.message || 'No se pudo conectar.', true); }
})();
