import { lsGet, lsSet, $ } from './util.js';

// ============================ i18n ============================
const I18N = {
  vi: {
    login: 'Đăng nhập', logout: 'Đăng xuất', loginTitle: 'Yêu cầu đăng nhập', loginBtn: 'Đăng nhập bằng Google',
    loginDesc: 'Trang web này yêu cầu đăng nhập bằng tài khoản Google để kiểm tra quyền truy cập thư viện ảnh.',
    loading: 'Đang tải ảnh...', reqAccess: 'Gửi yêu cầu truy cập', reqMail: 'Gửi email xin truy cập',
    search: 'Tìm theo tên ảnh...', rawOnly: 'Có RAW', favOnly: 'Yêu thích', select: 'Chọn', withRaw: 'kèm RAW',
    selAll: 'Chọn tất cả', zip: 'Tải zip', addAlbum: 'Thêm vào album', setCover: 'Làm bìa', removeFromAlbum: 'Bỏ khỏi album',
    cancel: 'Huỷ', settingsTitle: 'Cài đặt Google Drive API', settingsHelp: 'Nhập thông tin OAuth để kết nối với Google Drive.',
    requests: 'Yêu cầu truy cập', save: 'Lưu cấu hình', existAlbum: 'Album có sẵn', newAlbum: 'Hoặc tạo album mới', ok: 'Thêm',
    dlRaw: 'Tải file RAW', dl: 'Tải ảnh', home: 'Thư viện', all: 'Tất cả ảnh', fav: 'Yêu thích', albums: 'Album',
    virtualAlbums: 'Album tuyển chọn', unsorted: 'Ảnh ở thư mục gốc', photos: 'ảnh', allYears: 'Mọi năm', empty: 'Không có ảnh nào.',
    noPerm: 'Bạn chưa có quyền truy cập vào thư mục ảnh này.', month: 'Tháng', sessionExpired: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
    notFound: 'Không tìm thấy album.', share: 'Sao chép link', copied: 'Đã sao chép link', rename: 'Đổi tên', del: 'Xoá album',
    confirmDel: 'Xoá album này? (ảnh trên Drive không bị ảnh hưởng)', renamePrompt: 'Tên album mới:', added: 'Đã thêm vào album',
    removed: 'Đã bỏ khỏi album', coverSet: 'Đã đặt ảnh bìa', reqSent: 'Đã gửi yêu cầu cho chủ thư viện', saveErr: 'Không lưu được (Firestore từ chối hoặc chưa bật Google sign-in)',
    zipping: 'Đang nén', zipBig: 'Tổng dung lượng khoảng {mb} MB, tiếp tục?', nothing: 'Chưa chọn ảnh nào', pickOne: 'Chọn đúng 1 ảnh làm bìa',
    subAlbums: 'Album con', photosHere: 'Ảnh trong album', openDrive: 'Đang tải cây thư mục...', selected: 'đã chọn',
    updated: 'Đã cập nhật thư viện', tabSettings: 'Cài đặt', shareBtn: 'Chia sẻ công khai', shareTitle: 'Chia sẻ album công khai', shareHelp: 'Ai có link đều xem được album này, không cần đăng nhập. Ảnh vẫn nằm trên Drive của bạn, thu hồi link bất cứ lúc nào.', shareNeedWorker: 'Cần bật Worker đăng nhập một lần (Cài đặt → Proxy URL, rồi đăng nhập lại) và KV chia sẻ mới tạo được link. Xem docs/README.md.', shareExpire: 'Hiệu lực', shareDays: '{n} ngày', shareNever: 'Không hết hạn', shareAllowDl: 'Cho phép tải ảnh gốc', shareCreate: 'Tạo link', shareCopy: 'Sao chép', shareCopied: 'Đã sao chép link chia sẻ', shareList: 'Link đang hoạt động', shareNone: 'Chưa có link nào', shareRevoke: 'Thu hồi', shareRevoked: 'Đã thu hồi link', shareErr: 'Không thực hiện được', shareGone: 'Link này không tồn tại hoặc đã hết hạn.', shareExpiresOn: 'hết hạn', shareNoDl: 'chỉ xem', shareDlOk: 'cho tải', shareVia: 'Chia sẻ qua', saveToPhotos: 'Lưu vào Ảnh', updateReady: 'Có bản mới của trang.', updateReload: 'Tải lại', updateLater: 'Để sau', swOff: 'Đã tắt và xoá bộ nhớ ngoại tuyến. Tải lại trang để dùng bản mới nhất.', origManual: 'Chạm để tải ảnh gốc', previewRetry: 'Không tải được ảnh nét. Chạm để thử lại', origLazy: 'Bản xem trước. Bấm Tải ảnh để lấy ảnh gốc', origLoading: 'Đang tải ảnh gốc', origReady: 'Ảnh gốc, giữ ảnh để lưu', origFail: 'Không tải được ảnh gốc, hãy dùng nút Tải ảnh', origPreview: 'Bản xem trước, dùng nút Tải để lấy file gốc', heroEyebrow: 'Thư viện ảnh', heroA: 'Những khoảnh khắc đáng nhớ, ', heroB: 'gọn gàng', heroC: ' một chỗ', heroDesc: 'Ảnh được xếp theo từng chuyến đi và từng ngày chụp. Chỉ cần chọn album là xem, tải hoặc chia sẻ.', by_day: 'Theo ngày', by_month: 'Theo tháng', by_year: 'Theo năm', cancelled: 'Đã huỷ',
    infoName: 'Tên', infoDate: 'Ngày chụp', infoSize: 'Kích thước', infoFile: 'Dung lượng', infoCam: 'Máy ảnh', infoLens: 'Ống kính', infoExp: 'Thông số',
  },
  en: {
    login: 'Sign in', logout: 'Sign out', loginTitle: 'Sign-in required', loginBtn: 'Sign in with Google',
    loginDesc: 'This site requires a Google sign-in to check your access to the photo library.',
    loading: 'Loading photos...', reqAccess: 'Request access', reqMail: 'Email to request access',
    search: 'Search by file name...', rawOnly: 'Has RAW', favOnly: 'Favorites', select: 'Select', withRaw: 'with RAW',
    selAll: 'Select all', zip: 'Download zip', addAlbum: 'Add to album', setCover: 'Set cover', removeFromAlbum: 'Remove from album',
    cancel: 'Cancel', settingsTitle: 'Google Drive API settings', settingsHelp: 'Enter OAuth details to connect to Google Drive.',
    requests: 'Access requests', save: 'Save', existAlbum: 'Existing album', newAlbum: 'Or create a new album', ok: 'Add',
    dlRaw: 'Download RAW', dl: 'Download', home: 'Library', all: 'All photos', fav: 'Favorites', albums: 'Albums',
    virtualAlbums: 'Curated albums', unsorted: 'Photos in root folder', photos: 'photos', allYears: 'All years', empty: 'No photos.',
    noPerm: 'You do not have access to this photo folder.', month: 'Month', sessionExpired: 'Session expired, please sign in again.',
    notFound: 'Album not found.', share: 'Copy link', copied: 'Link copied', rename: 'Rename', del: 'Delete album',
    confirmDel: 'Delete this album? (Drive photos are not affected)', renamePrompt: 'New album name:', added: 'Added to album',
    removed: 'Removed from album', coverSet: 'Cover set', reqSent: 'Request sent to the library owner', saveErr: 'Could not save (Firestore denied or Google sign-in not enabled)',
    zipping: 'Zipping', zipBig: 'Total about {mb} MB, continue?', nothing: 'Nothing selected', pickOne: 'Select exactly 1 photo for the cover',
    subAlbums: 'Sub-albums', photosHere: 'Photos in album', openDrive: 'Loading folder tree...', selected: 'selected',
    updated: 'Library updated', tabSettings: 'Settings', shareBtn: 'Public link', shareTitle: 'Share album publicly', shareHelp: 'Anyone with the link can view this album without signing in. Photos stay in your Drive and you can revoke the link at any time.', shareNeedWorker: 'Needs the one-time sign-in Worker (Settings → Proxy URL, then sign in again) and the share KV. See docs/README.md.', shareExpire: 'Valid for', shareDays: '{n} days', shareNever: 'Never expires', shareAllowDl: 'Allow downloading originals', shareCreate: 'Create link', shareCopy: 'Copy', shareCopied: 'Share link copied', shareList: 'Active links', shareNone: 'No links yet', shareRevoke: 'Revoke', shareRevoked: 'Link revoked', shareErr: 'Could not complete', shareGone: 'This link does not exist or has expired.', shareExpiresOn: 'expires', shareNoDl: 'view only', shareDlOk: 'downloads allowed', shareVia: 'Shared via', saveToPhotos: 'Save to Photos', updateReady: 'A new version is available.', updateReload: 'Reload', updateLater: 'Later', swOff: 'Offline cache turned off and cleared. Reload the page to get the latest version.', origManual: 'Tap to load the original', previewRetry: 'Could not load the sharp image. Tap to retry', origLazy: 'Preview. Tap Download to get the original', origLoading: 'Loading original', origReady: 'Original, press and hold to save', origFail: 'Could not load the original, use the Download button', origPreview: 'Preview only, use Download for the original file', heroEyebrow: 'Photo library', heroA: 'Memories worth keeping, ', heroB: 'neatly', heroC: ' in one place', heroDesc: 'Photos are organised by trip and by day. Pick an album to view, download or share.', by_day: 'By day', by_month: 'By month', by_year: 'By year', cancelled: 'Cancelled',
    infoName: 'Name', infoDate: 'Taken', infoSize: 'Dimensions', infoFile: 'File size', infoCam: 'Camera', infoLens: 'Lens', infoExp: 'Exposure',
  },
};
let lang = lsGet('vdphoto_lang', lsGet('ividlab-lang', 'vi')) === 'en' ? 'en' : 'vi';
export const getLang = () => lang;
// "1 photo" / "2 photos" (tiếng Việt không chia số ít/nhiều).
export const photoCount = (n) => `${n} ${n === 1 && lang === 'en' ? 'photo' : t('photos')}`;
export function setLang(l) { lang = l; lsSet('vdphoto_lang', lang); }
export const t = (k) => I18N[lang][k] || k;
export function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
  $('#langBtn').textContent = lang.toUpperCase();
}

// ============================ Theme ============================
export function applyTheme(th) {
  document.documentElement.setAttribute('data-theme', th);
  lsSet('vdphoto_theme', th);
  $('#themeBtn').innerHTML = th === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}
