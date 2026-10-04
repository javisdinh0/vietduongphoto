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
    updated: 'Đã cập nhật thư viện', by_day: 'Theo ngày', by_month: 'Theo tháng', by_year: 'Theo năm', cancelled: 'Đã huỷ',
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
    updated: 'Library updated', by_day: 'By day', by_month: 'By month', by_year: 'By year', cancelled: 'Cancelled',
    infoName: 'Name', infoDate: 'Taken', infoSize: 'Dimensions', infoFile: 'File size', infoCam: 'Camera', infoLens: 'Lens', infoExp: 'Exposure',
  },
};
let lang = lsGet('vdphoto_lang', lsGet('ividlab-lang', 'vi')) === 'en' ? 'en' : 'vi';
export const getLang = () => lang;
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
