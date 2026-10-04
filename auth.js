import { S, cfg } from './state.js';
import { DEMO, lsSet, show, $, lsDel, QS, lsGet, toast } from './util.js';
import { ADMIN_FALLBACK, createDemo, createDrive, createStore } from './backend.js';
import { showError, loadLibrary } from './library.js';

let tokenClient = null;
let refreshTimer = null;

// ============================ Đăng nhập ============================
const waitGoogle = () => new Promise((res) => { const i = setInterval(() => { if (window.google && google.accounts && google.accounts.oauth2) { clearInterval(i); res(); } }, 100); });

async function onToken(accessToken, expiresIn) {
  S.token = accessToken;
  if (!DEMO) {
    lsSet('vd_photo_access_token', accessToken);
    lsSet('vd_photo_token_expiry', String(Date.now() + expiresIn * 1000 - 60000));
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { try { tokenClient.requestAccessToken({ prompt: '' }); } catch (e) { /* bỏ qua */ } }, Math.max(60000, expiresIn * 1000 - 120000));
  }
  if (S.loaded) return; // làm mới token im lặng: không tải lại thư viện
  await afterLogin();
}

async function afterLogin() {
  show($('#loginScreen'), false); show($('#loginBtn'), false); show($('#logoutBtn'));
  try {
    S.email = await S.backend.drive.userEmail();
    await S.backend.store.signIn(S.token);
    S.isAdmin = S.email === ADMIN_FALLBACK || await S.backend.store.isOwner(S.email);
  } catch (e) { if (e.message === 'UNAUTH') return showError(e); S.isAdmin = S.email === ADMIN_FALLBACK; }
  show($('#settingsBtn'), S.isAdmin);
  document.querySelectorAll('.admin-only').forEach((b) => show(b, S.isAdmin));
  await loadLibrary(false);
}

export function doLogoutState() {
  S.token = null; S.loaded = false; S.isAdmin = false; S.selectMode = false; S.selected.clear();
  clearTimeout(refreshTimer); lsDel('vd_photo_access_token'); lsDel('vd_photo_token_expiry');
  show($('#logoutBtn'), false); show($('#loginBtn')); show($('#settingsBtn'), false);
  show($('#app'), false); show($('#timeline'), false); show($('#selectBar'), false); show($('#loginScreen'));
}

export async function initAuth() {
  if (DEMO) {
    S.backend = createDemo(QS.get('guest') === '1');
    await onToken('demo', 3600); return;
  }
  S.backend = { demo: false, drive: createDrive(() => S.token, cfg.apiKey, cfg.proxyUrl || undefined), store: createStore() };
  if (!cfg.clientId) { show($('#loginScreen'), false); show($('#errorMessage')); $('#errorText').textContent = 'Chưa cấu hình OAuth.'; show($('#settingsBtn')); return; }
  show($('#loginBtn'));
  await waitGoogle();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: cfg.clientId, scope: 'https://www.googleapis.com/auth/drive.readonly email',
    callback: (r) => { if (r && r.access_token) onToken(r.access_token, +r.expires_in || 3600); },
    error_callback: () => { /* người dùng đóng popup */ },
  });
  const tok = lsGet('vd_photo_access_token'); const exp = +lsGet('vd_photo_token_expiry', '0');
  if (tok && Date.now() < exp) onToken(tok, Math.floor((exp - Date.now()) / 1000) + 60);
}

export function requestLogin() { if (!tokenClient) return toast('Google chưa sẵn sàng'); tokenClient.requestAccessToken(); }
