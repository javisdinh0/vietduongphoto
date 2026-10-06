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

- Site ở **gốc repo**: `index.html` + các module `app.js` (nối sự kiện, khởi động), `state.js`, `util.js`, `i18n.js` (bảng `vi`/`en` tự viết, không dùng thư viện), `auth.js`, `library.js` (tải + stale-while-revalidate), `cache.js` (IndexedDB), `router.js` (hash router), `gallery.js`, `select.js`, `zipdl.js`, `albums.js`, `lightbox.js`, `share.js` (chia sẻ album công khai: hộp thoại admin + chế độ người xem `?w=<Worker>#/s/<token>`), `settings.js`.
- `lib.js` là **logic thuần** (không đụng DOM/localStorage): ghép JPG↔RAW, lọc, gộp ngày/tháng, router parse, delta, batch. `thumbAt` ở đây tạo URL thumbnail Drive. Muốn test được thì để logic mới ở đây.
- `backend.js`: `createDrive` (Drive thật, `retryFetch` backoff cho 429/5xx/403 rateLimit), Firestore (album ảo `photoAlbums`, yêu cầu truy cập `photoRequests`, admin = `config/owners`) và backend **demo** (`?demo=1`).
- `zip.js` / `zipclient.js` / `zipworker.js`: zip store + CRC, ghi luồng ra file ở Chrome/Edge desktop, còn lại gom trong RAM; chạy trong Web Worker.
- `zoom.js`: cử chỉ zoom/kéo của lightbox (chụm 2 ngón, chạm đúp, kéo, vuốt chuyển ảnh, lăn chuột/trackpad); `lightbox.js` chỉ gọi `createZoom({stage,img,onSwipe,onBackdropTap,onZoomIn})`. Không dùng `setPointerCapture` ở đây (click sẽ bị chuyển về `#lbStage` và đóng nhầm lightbox). Phóng quá ~1,5x tự yêu cầu ảnh gốc.
- `sw.js`: file của trang network-first, thumbnail `googleusercontent.com` cache-first; **không** cache Drive API/dữ liệu riêng tư.
- `proxy/` — Cloudflare Worker tuỳ chọn: `worker.js` (chuyển tiếp Drive với token của chính người dùng, cache metadata), `auth.js` (đổi code → refresh token mã hoá AES-GCM, `/auth/*`), `share.js` (chia sẻ album công khai `/share/*`, token 128-bit trong KV `SHARES`, chỉ email thuộc `OWNER_EMAILS` tạo/thu hồi, chỉ phục vụ ảnh có trong link). **Chưa thấy deploy thật** — chia sẻ album, đăng nhập một lần và proxy đều cần nó; hướng dẫn ở mục "Hướng dẫn triển khai Worker" trong `docs/README.md`.
- `firestore.rules` là **bản đầy đủ của Firebase project dùng chung `ividlab-rficonsole`** (RFI Console, admin… của site ividlab dùng chung). Khối của app này là `photoAlbums` + `photoRequests`. Sửa file này **không tự có hiệu lực**: phải dán toàn bộ vào Firebase Console › Firestore › Rules › Publish. Đừng xoá phần của site khác.

## Quy ước & điều dễ vấp

- **Đường dẫn tương đối.** Site chạy ở thư mục con `/vietduongphoto/` nên favicon/manifest/`sw.js`… phải là đường dẫn tương đối, không dùng `/xxx` tuyệt đối.
- **Origin của proxy** (`ALLOWED_ORIGIN` trong `proxy/wrangler.toml`, `worker.js`, test) là `https://javisdinh0.github.io` — origin không kèm đường dẫn. Đổi domain thì phải đổi cả ba + OAuth + Firebase.
- **Thumbnail giữ đúng tỉ lệ:** Drive trả `width/height` chưa xoay EXIF; `LIST_FIELDS` xin thêm `rotation` và `buildLibrary` đổi chỗ `w`/`h` khi rotation lẻ. Thiếu kích thước thì `setCardRatio` lấy từ `naturalWidth/Height` khi ảnh tải xong. Giữ nguyên khi sửa lưới ảnh.
- **Nút tải về** (`#downloadBtn`/`#downloadRawBtn` trong lightbox) tự fetch blob qua Drive API (`alt=media`) rồi lưu bằng `<a download>`: thuộc tính `download` bị bỏ qua với link khác origin, và `target=_blank` mở tab mới trên điện thoại. Đừng quay lại dùng link thẳng.
- **Lightbox (`lightbox.js`) — tải tuần tự, huỷ được, luôn ưu tiên ảnh hiện tại:** (1) hiện ngay ảnh đã có trong lưới hoặc thumbnail 600px (ảnh lân cận ±2 preload ở 600px); (2) sau ~150ms dừng lại → 1000px → 1600px (cảm ứng) / 2000px; (3) rồi mới tải ảnh gốc (`drive.original(p, signal, onProgress)`, hiện tiến độ ở `#lbQuality`). Lướt nhanh thì `lbCancelPreviews()` / `lbCancelOriginal()` huỷ yêu cầu cũ; link thumbnail hết hạn/lỗi thì `renewOnce` xin link mới. `img.dataset.quality` là `preview` hoặc `original` (bản preview không được ghi đè lên ảnh gốc đã nạp; test UI dựa vào nó). Thêm đường thoát mới khỏi lightbox thì nhớ gọi `lbCancelOriginal()`/`lbCancelPreviews(true)` (thu hồi blob URL).
- **Ảnh gốc theo thiết bị:** máy tính tự tải ảnh gốc thành `blob:` sau ~250ms. **Màn hình cảm ứng** (`isCoarse()` trong `util.js`) hoặc bật Tiết kiệm dữ liệu: *chỉ tải khi người dùng bấm Tải ảnh/chạm nhãn* (`loadOriginalForSave`, nối ở `app.js`), dùng `data:` URL (≤40 MB; iOS không lưu được `blob:`), có nút "Lưu vào Ảnh" (Web Share với file gốc), cache ảnh gốc tối đa 1 mục. Chỉ JPG/PNG/WEBP/GIF/BMP; HEIC/RAW/lỗi giữ bản xem trước và báo rõ. Trình chiếu thì không tải ảnh gốc.
- **Tiết kiệm RAM trên điện thoại (iOS Safari bỏ ảnh đã giải mã khi thiếu RAM):** lưới chỉ xin 400/600px, cửa sổ recycling hẹp hơn, giải phóng ảnh đã gỡ khỏi DOM. Đừng nới các giới hạn này mà không chạy `tests/ui/memory.spec.mjs`.
- **Chia sẻ album công khai:** người xem qua link không đăng nhập và không đọc/gửi token nào của trình duyệt; UI ẩn đăng nhập/cài đặt/chọn ảnh; link chỉ-xem (`S.share.allowDownload=false`) không có nút tải và không bao giờ gọi `/dl`. Tạo link cần refresh token (đăng nhập một lần qua Worker). Test: `tests/share-worker.test.mjs`, `tests/ui/share.spec.mjs`.
- **Đăng nhập:** Google Identity Services (scope `drive.readonly email`); access token được đổi sang phiên Firebase bằng `signInWithCredential` — cần bật provider Google ở Firebase Auth **và** safelist client ID OAuth của app (xem docs/README.md). Google OAuth Client phải có origin `https://javisdinh0.github.io`, Firebase Authorized domains phải có `javisdinh0.github.io`.
- Admin phía client có fallback email, nhưng rules chỉ tin `config/owners.emails` (chữ thường).
- Key localStorage: `vdphoto_lang` (đọc thêm `ividlab-*` cũ làm dự phòng, không ghi), `vdphoto_layout`, `vdphoto_tl`, `vd_photo_email`, `vd_photo_rt`.
- **Giao diện (Neumorphism / Soft UI, chỉ chế độ sáng):** một bề mặt xám lạnh `#E0E5EC`, không viền — mọi cạnh do bóng đôi tạo ra (biến `--sh-ext*`, `--sh-inset*` trong `style.css`); chữ `#3D4852`/`#6B7280`, nhấn tím `#6C63FF` (cũng là `theme-color` `#E0E5EC`, favicon/icon PWA `#6C63FF`); bo 32px (card/modal) và 16px (nút/ô nhập); font *Plus Jakarta Sans* (tiêu đề, biến `--display`) + *DM Sans* (nội dung). **Đã bỏ dark mode và nút `#themeBtn`.** Header không dùng `backdrop-filter` (`scroll.spec` kiểm tra). Lightbox giữ nền tối riêng (`#151921`) để ảnh nổi bật. Trang chủ (`#/`) có hero (`renderHero` trong `router.js`, chuỗi `heroEyebrow/heroA/B/C/heroDesc` trong `i18n.js` cho cả `vi` và `en`, mosaic 3 ảnh mới nhất, hiệu ứng `float`) và **không hiện timeline** (`S.route.type !== 'home'`). Sửa màu/bóng ở biến, đừng hard-code. Thêm chuỗi giao diện thì thêm ở cả `vi` lẫn `en`. Đổi màu icon PWA: sửa `COLOR` trong `scripts/make-icons.mjs` rồi chạy lại.
- **Đo hiệu năng trên điện thoại (`?perf=1`):** `perf.js` được **import động** chỉ khi bật (không nằm trong đồ thị import tĩnh/`modulepreload`, nhưng có trong `SHELL_FILES` của sw.js — test kiểm tra). Mã ứng dụng chỉ gọi `perfMark/perfAdd/perfCount/perfLb` từ `util.js` (tắt thì chỉ kiểm tra một boolean). Muốn đo thêm gì thì thêm điểm gắn đo + xử lý trong `sink()` của perf.js + dòng trong `buildReport()`; cách dùng và cách đọc báo cáo ở docs/README.md.
- **Khi đọc số đo từ iPhone của người dùng:** họ hay bật *Chế độ nguồn điện thấp* (pin vàng) → Safari giới hạn ~30 khung/giây (bảng hiện `30fps`) và họ dùng *Edge trên iOS* (báo cáo thực tế cho thấy service worker **có** chạy ở đó — đừng giả định ngược lại; trạng thái thật nằm ở dòng "Service worker:" của báo cáo). Báo cáo `?perf=1` tự nhận diện cả hai; đừng kết luận "giật" chỉ từ số khung >25 ms ở 30 Hz.
- **Service worker (`sw.js`, `pwa.js`):** khung ứng dụng được lưu sẵn thành một phiên bản nguyên khối và phục vụ từ cache; cập nhật ngầm rồi hiện thanh "Có bản mới". **Thêm module/file tĩnh mới thì thêm vào `SHELL_FILES` (sw.js) cùng với `modulepreload` (index.html)** — `tests/sw.test.mjs` fail nếu thiếu. Sau mỗi deploy lần mở đầu vẫn thấy bản cũ (chủ ý). Sự cố: mở `?nosw=1` để gỡ SW + xoá cache; thử SW trên localhost bằng `?sw=1`. Không cache Drive API / dữ liệu riêng tư. Tin "có bản mới" SW gửi lúc trang đang nạp có thể bị lỡ, nên trang tự hỏi lại (`status` → `stale`, SW nhớ trang nào nạp bản nào trong RAM) và nút "Kiểm tra bản mới" ở bảng `?perf=1` gửi `check` + `force`.
- **Biểu tượng:** không còn Font Awesome từ CDN; `icons.css` (sinh bởi `npm run icons:css`) định nghĩa `.fa-xxx` bằng CSS mask nên markup `<i class="fas fa-xxx">` giữ nguyên. Dùng biểu tượng mới thì chạy lại lệnh đó và commit `icons.css` (test kiểm tra). Đừng đặt `background` lên thẻ `<i>` (bị cắt theo hình biểu tượng); vẽ trên phần tử bao ngoài.
- **`modulepreload` trong `index.html` phải khớp đồ thị import của `app.js`:** thêm/bớt/đổi tên module thì sửa các thẻ `<link rel="modulepreload">` (`tests/assets.test.mjs` fail nếu lệch). Thẻ ảnh trong lưới chỉ gửi **một** yêu cầu ảnh (đã bỏ nền mờ 32px — đừng thêm lại, nó gấp đôi số yêu cầu và làm tăng lỗi 429 của Google). Biểu tượng PNG sinh bằng `scripts/make-icons.mjs`.
- Không còn nạp `traffic-track.js` của ividlab, nên site này không đẩy lượt xem vào dashboard `/admin` của ividlab.
- Repo **public**: không commit secret. Client secret/`TOKEN_KEY` của proxy chỉ đặt bằng `wrangler secret put`.

## Triển khai

Push lên `main` → GitHub Pages tự phục vụ (nguồn: nhánh `main`, thư mục gốc, không có bước build). Custom domain `vietduongphoto.name.vn` đã được thử rồi gỡ (không có `CNAME`); địa chỉ chính là github.io. Không dùng nhánh `gh-pages`.

Quy trình thường dùng: nhánh `vid/<tên>` → PR vào `main` (squash) → xoá nhánh. `git push` từ shell của Claude cần `gh auth login` + `gh auth setup-git` đã chạy trên máy.
