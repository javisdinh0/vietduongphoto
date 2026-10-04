# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Đây là gì

**VietDuong Photo** — thư viện ảnh đọc từ Google Drive, chạy hoàn toàn phía client (ES modules thuần, **không build**), host tĩnh trên GitHub Pages: https://javisdinh0.github.io/vietduongphoto/. Repo này được tách từ repo `ividlab` (2026-10-04, giữ lịch sử); repo `ividlab` không còn chứa mã của nó. Tài liệu chi tiết (tính năng, tối ưu, proxy, đăng nhập một lần): [docs/README.md](docs/README.md).

## Lệnh

```bash
npm test          # node:test — tests/*.test.mjs (logic thuần, tích hợp Drive giả + proxy, auth worker)
npm run lint      # eslint .
npm run test:ui   # Playwright (Chromium, chế độ demo, tests/ui/*.spec.mjs) — cần: npx playwright install chromium
npx http-server . # chạy cục bộ; thêm ?demo=1 để dùng dữ liệu Drive giả, không cần đăng nhập
```

CI (`.github/workflows`): lint + `npm test` + `npm run test:ui` trên mỗi push/PR vào `main`. Chạy ít nhất `npm run lint && npm test` trước khi push.

Windows: Node không có trong PATH của shell mới — dùng PowerShell với `$env:Path = "C:\Program Files\nodejs;" + $env:Path`. Repo có `core.autocrlf=true` nên git hay cảnh báo LF→CRLF (vô hại).

## Kiến trúc

- Site ở **gốc repo**: `index.html` + các module `app.js` (nối sự kiện, khởi động), `state.js`, `util.js`, `i18n.js` (bảng `vi`/`en` tự viết, không dùng thư viện), `auth.js`, `library.js` (tải + stale-while-revalidate), `cache.js` (IndexedDB), `router.js` (hash router), `gallery.js`, `select.js`, `zipdl.js`, `albums.js`, `lightbox.js`, `settings.js`.
- `lib.js` là **logic thuần** (không đụng DOM/localStorage): ghép JPG↔RAW, lọc, gộp ngày/tháng, router parse, delta, batch. `thumbAt` ở đây tạo URL thumbnail Drive. Muốn test được thì để logic mới ở đây.
- `backend.js`: `createDrive` (Drive thật, `retryFetch` backoff cho 429/5xx/403 rateLimit), Firestore (album ảo `photoAlbums`, yêu cầu truy cập `photoRequests`, admin = `config/owners`) và backend **demo** (`?demo=1`).
- `zip.js` / `zipclient.js` / `zipworker.js`: zip store + CRC, ghi luồng ra file ở Chrome/Edge desktop, còn lại gom trong RAM; chạy trong Web Worker.
- `sw.js`: file của trang network-first, thumbnail `googleusercontent.com` cache-first; **không** cache Drive API/dữ liệu riêng tư.
- `proxy/` — Cloudflare Worker tuỳ chọn (`worker.js` chuyển tiếp Drive với token của chính người dùng; `auth.js` đổi code → refresh token mã hoá AES-GCM). Chưa deploy thật; cần tài khoản Cloudflare + secret.
- `firestore.rules` là **bản đầy đủ của Firebase project dùng chung `ividlab-rficonsole`** (RFI Console, admin… của site ividlab dùng chung). Khối của app này là `photoAlbums` + `photoRequests`. Sửa file này **không tự có hiệu lực**: phải dán toàn bộ vào Firebase Console › Firestore › Rules › Publish. Đừng xoá phần của site khác.

## Quy ước & điều dễ vấp

- **Đường dẫn tương đối.** Site chạy ở thư mục con `/vietduongphoto/` nên favicon/manifest/`sw.js`… phải là đường dẫn tương đối, không dùng `/xxx` tuyệt đối.
- **Origin của proxy** (`ALLOWED_ORIGIN` trong `proxy/wrangler.toml`, `worker.js`, test) là `https://javisdinh0.github.io` — origin không kèm đường dẫn. Đổi domain thì phải đổi cả ba + OAuth + Firebase.
- **Thumbnail giữ đúng tỉ lệ:** Drive trả `width/height` chưa xoay EXIF; `LIST_FIELDS` xin thêm `rotation` và `buildLibrary` đổi chỗ `w`/`h` khi rotation lẻ. Thiếu kích thước thì `setCardRatio` lấy từ `naturalWidth/Height` khi ảnh tải xong. Giữ nguyên khi sửa lưới ảnh.
- **Nút tải về** (`#downloadBtn`/`#downloadRawBtn` trong lightbox) tự fetch blob qua Drive API (`alt=media`) rồi lưu bằng `<a download>`: thuộc tính `download` bị bỏ qua với link khác origin, và `target=_blank` mở tab mới trên điện thoại. Đừng quay lại dùng link thẳng.
- **Lightbox tải ảnh gốc:** `lightbox.js` hiện thumbnail 600px → 2000px ngay, rồi sau khi dừng ở một ảnh ~0,35s thì tải file gốc thành blob (`drive.blob(p, signal)`, huỷ được bằng `AbortController`) và gán làm `src`, để nhấn giữ/chuột phải "Lưu ảnh" ra đúng bản gốc. `img.dataset.quality` là `preview` hoặc `original` (ảnh 2000px không được ghi đè lên ảnh gốc đã nạp; test UI dựa vào thuộc tính này). Chỉ áp dụng cho jpg/png/webp/gif/bmp; HEIC/RAW/lỗi mạng giữ bản xem trước. Lướt nhanh thì huỷ, nhớ `lbCancelOriginal()` (thu hồi blob URL) khi thêm đường thoát mới khỏi lightbox.
- **Đăng nhập:** Google Identity Services (scope `drive.readonly email`); access token được đổi sang phiên Firebase bằng `signInWithCredential` — cần bật provider Google ở Firebase Auth **và** safelist client ID OAuth của app (xem docs/README.md). Google OAuth Client phải có origin `https://javisdinh0.github.io`, Firebase Authorized domains phải có `javisdinh0.github.io`.
- Admin phía client có fallback email, nhưng rules chỉ tin `config/owners.emails` (chữ thường).
- Key localStorage: `vdphoto_theme`, `vdphoto_lang` (đọc thêm `ividlab-*` cũ làm dự phòng, không ghi), `vdphoto_layout`, `vdphoto_tl`, `vd_photo_email`, `vd_photo_rt`.
- **Giao diện (theme ấm tối giản):** nền kem, tiêu đề serif *Newsreader*, chữ *Be Vietnam Pro* (Google Fonts, nạp trong `index.html`), màu nhấn terracotta `#b4533a` (cũng là `theme-color` và `manifest`). Trang chủ (`#/`) có hero (`renderHero` trong `router.js`, chuỗi `heroEyebrow/heroA/B/C/heroDesc` trong `i18n.js` cho cả `vi` và `en`, mosaic 3 ảnh mới nhất) và **không hiện timeline** (`S.route.type !== 'home'`). Thanh chọn nổi, chip lọc, lightbox đều dùng biến màu trong `style.css` — sửa màu ở biến, đừng hard-code. Thêm chuỗi giao diện thì thêm ở cả `vi` lẫn `en`.
- Không còn nạp `traffic-track.js` của ividlab, nên site này không đẩy lượt xem vào dashboard `/admin` của ividlab.
- Repo **public**: không commit secret. Client secret/`TOKEN_KEY` của proxy chỉ đặt bằng `wrangler secret put`.

## Triển khai

Push lên `main` → GitHub Pages tự phục vụ (nguồn: nhánh `main`, thư mục gốc, không có bước build). Custom domain `vietduongphoto.name.vn` đã được thử rồi gỡ (không có `CNAME`); địa chỉ chính là github.io. Không dùng nhánh `gh-pages`.

Quy trình thường dùng: nhánh `vid/<tên>` → PR vào `main` (squash) → xoá nhánh. `git push` từ shell của Claude cần `gh auth login` + `gh auth setup-git` đã chạy trên máy.
