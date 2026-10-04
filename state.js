import { lsGet } from './util.js';

// ============================ Cấu hình mặc định ============================
const DEFAULT_CLIENT_ID = '110344757733-bnomi4d63vsrb144pt5qpss8246supmd.apps.googleusercontent.com';
const DEFAULT_FOLDER_ID = '1MurjCwIStG_1KkT8Au492FT9_2-rPSP6';
export const CACHE_TTL = 5 * 60 * 1000; // dưới mức này: dùng cache, không hỏi Drive
export const FULL_REFRESH = 24 * 3600 * 1000; // quá mức này: tải lại toàn bộ thay vì đồng bộ tăng dần
export const PAGE = 80;

// Cấu hình có thể đổi trong Cài đặt (đọc/ghi qua cfg để các module dùng chung giá trị mới nhất).
export const cfg = {
  clientId: lsGet('vd_photo_client_id') || DEFAULT_CLIENT_ID,
  folderId: lsGet('vd_photo_folder_id') || DEFAULT_FOLDER_ID,
  apiKey: lsGet('vd_photo_api_key') || '',
  proxyUrl: lsGet('vd_photo_proxy') || '',
};

// ============================ State ============================
export const S = {
  token: null, email: '', isAdmin: false, backend: null,
  folders: new Map(), photos: [], byId: new Map(), vAlbums: [],
  filters: { q: '', year: '', raw: false, fav: false },
  visible: [], selectMode: false, selected: new Set(), route: { type: 'home' },
  favs: new Set(JSON.parse(lsGet('vdphoto_fav', '[]') || '[]')),
  loaded: false, partial: false, justified: lsGet('vdphoto_layout') === 'justified',
};

export const LB = { idx: 0, zoom: false, x: 0, y: 0, drag: null, play: null, pre: [], orig: { url: null, timer: null, ctrl: null }, cache: new Map(), big: null, bigTimer: null, retry: null, preSet: new Set() };
