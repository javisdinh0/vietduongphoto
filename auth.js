import { S, cfg } from './state.js';
import { DEMO, lsSet, show, $, lsDel, QS, lsGet, toast } from './util.js';
import { ADMIN_FALLBACK, createDemo, createDrive, createStore } from './backend.js';
import { showError, loadLibrary } from './library.js';

let tokenClient = null;
let codeClient = null; // có proxy: luồng authorization code + refresh token (đăng nhập 1 lần)
let tokenExpiry = 0;
let refreshTimer = null;

// ============================ Đăng nhập ============================
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly email';
const useCode = () => !!cfg.proxyUrl && !DEMO;
async function authPost(path, body) {
  const r = await fetch(cfg.proxyUrl.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status });
  return j;
}
// Xin access token mới: qua proxy (refresh token) nếu có, không thì thử im lặng bằng phiên Google. Trả true nếu đã có token mới.
async function renew() {
  const rt = lsGet('vd_photo_rt');
  if (rt && useCode()) {
    try { const j = await authPost('/auth/refresh', { rt }); await onToken(j.access_token, +j.expires_in || 3600); return true; }
    catch (e) { if (e.status === 401) lsDel('vd_photo_rt'); return false; } // 401 = refresh token bị thu hồi/hết hiệu lực; lỗi mạng thì giữ lại thử sau
  }
  if (tokenClient) { try { tokenClient.requestAccessToken({ prompt: '', hint: lsGet('vd_photo_email') || undefined }); } catch (e) { /* bỏ qua */ } }
  return false;
}

const waitGoogle = () => new Promise((res) => { const i = setInterval(() => { if (window.google && google.accounts && google.accounts.oauth2) { clearInterval(i); res(); } }, 100); });

async function onToken(accessToken, expiresIn) {
  S.token = accessToken;
  if (!DEMO) {
    lsSet('vd_photo_access_token', accessToken);
    tokenExpiry = Date.now() + expiresIn * 1000 - 60000;
    lsSet('vd_photo_token_expiry', String(tokenExpiry));
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(renew, Math.max(60000, expiresIn * 1000 - 120000));
  }
  if (S.loaded) return; // làm mới token im lặng: không tải lại thư viện
  await afterLogin();
}

async function afterLogin() {
  show($('#loginScreen'), false); show($('#loginBtn'), false); show($('#logoutBtn'));
  try {
    S.email = await S.backend.drive.userEmail();
    if (!DEMO && S.email) lsSet('vd_photo_email', S.email); // nhớ tài khoản để lần sau tự đăng nhập im lặng
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
  const onErr = () => { /* người dùng đóng popup */ };
  if (useCode()) {
    codeClient = google.accounts.oauth2.initCodeClient({
      client_id: cfg.clientId, scope: SCOPE, ux_mode: 'popup', error_callback: onErr,
      callback: async (r) => {
        if (!r || !r.code) return;
        try { const j = await authPost('/auth/code', { code: r.code }); if (j.rt) lsSet('vd_photo_rt', j.rt); onToken(j.access_token, +j.expires_in || 3600); }
        catch (e) { toast('Đăng nhập qua proxy lỗi: ' + e.message); }
      },
    });
  } else {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId, scope: SCOPE, error_callback: onErr,
      callback: (r) => { if (r && r.access_token) onToken(r.access_token, +r.expires_in || 3600); },
    });
  }
  // Máy ngủ/tab nền làm hẹn giờ trễ: khi quay lại mà token sắp hết thì làm mới ngay.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.token && Date.now() > tokenExpiry - 30000) renew(); });
  const tok = lsGet('vd_photo_access_token'); const exp = +lsGet('vd_photo_token_expiry', '0');
  if (tok && Date.now() < exp) onToken(tok, Math.floor((exp - Date.now()) / 1000) + 60);
  else if (lsGet('vd_photo_rt') || lsGet('vd_photo_email')) renew(); // token hết hạn: xin lại im lặng; không được thì giữ nút Đăng nhập
}

// Đăng xuất chủ động: quên tài khoản để không tự đăng nhập lại.
export function forgetLogin() {
  const rt = lsGet('vd_photo_rt'); lsDel('vd_photo_rt'); lsDel('vd_photo_email');
  if (rt && useCode()) authPost('/auth/revoke', { rt }).catch(() => {});
}

export function requestLogin() {
  if (codeClient) return codeClient.requestCode();
  if (!tokenClient) return toast('Google chưa sẵn sàng');
  tokenClient.requestAccessToken();
}
