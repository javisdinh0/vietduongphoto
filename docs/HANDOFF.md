# Bàn giao — VietDuong Photo (cập nhật 2026-10-05)

Dành cho agent/người tiếp quản. Đọc kèm [CLAUDE.md](../CLAUDE.md) (quy ước, điều dễ vấp) và [docs/README.md](README.md) (tài liệu tính năng + hướng dẫn Worker + cách đọc báo cáo `?perf=1`).

## 1. Hiện trạng

- Site tĩnh ES modules, **không build**, host GitHub Pages: https://javisdinh0.github.io/vietduongphoto/ . Push lên `main` là tự deploy (sau vài phút; lần mở đầu tiên sau deploy vẫn thấy bản cũ — chủ ý của service worker, mở lần hai mới có bản mới).
- Commit mới nhất đã push: `2b8cb8b` (lightbox giải mã ảnh gốc ở luồng nền + số đo base64/decode; service worker báo trạng thái/`stale`, kiểm tra bản mới ép buộc; nút "Kiểm tra bản mới" ở bảng perf). Worktree sạch, đồng bộ với `origin/main`.
- Kiểm thử đang xanh: `npm test` 64/64, `npm run test:ui` (Playwright, Chromium) 99/99, lint sạch.
- Đã làm xong toàn bộ danh sách tối ưu 1–8 (modulepreload, bỏ blur-up 32px, ảnh bìa eager, font, PWA/iOS icon, icons.css thay Font Awesome, service worker app shell, bảng đo `?perf=1`).
- Người dùng là chủ dự án, nói tiếng Việt; thói quen: mỗi lần giao xong họ bảo "Push và deploy lên main". Chỉ commit/push khi họ yêu cầu.

## 2. Việc đang dở / đề xuất tiếp theo (ưu tiên giảm dần)

1. **Deploy Cloudflare Worker (cần người dùng làm tay)** — chưa deploy. Hậu quả: chưa có "đăng nhập một lần" (token Google chỉ ~1 giờ; Safari chặn cookie bên thứ ba nên xin lại ngầm hay thất bại → phải bấm đăng nhập lại) và **chưa dùng được chia sẻ album công khai**. Cần: `wrangler login`, tạo KV namespace `SHARES`, đặt secret (`GOOGLE_CLIENT_SECRET`, `TOKEN_KEY`), điền `GOOGLE_CLIENT_ID`/`OWNER_EMAILS` trong `proxy/wrangler.toml`. Hướng dẫn: mục "Hướng dẫn triển khai Worker" trong docs/README.md. Trên PowerShell dùng `npx.cmd`. **Không bao giờ yêu cầu người dùng dán secret vào chat**, repo là public.
2. **Đo lại khởi động ở Safari sau khi đã đăng nhập** (mở lại app, không đăng nhập). Số lần trước (trang chủ 9 s, thư viện 10,8 s) là do người dùng đang đăng nhập, **không** phải hiệu năng thật.
3. **Hướng B (tuỳ chọn): rút ngắn thời gian chờ ảnh nét.** Đo thật: 1000px ≈ 1,1–1,3 s, 1600px ≈ 2 s, ảnh gốc ≈ 7 s cho ~9 MB — gần như toàn bộ là thời gian mạng/Drive, không phải xử lý (base64 ≈ 7 ms, giải mã ≈ 220 ms). Ý tưởng: tải song song 1000px + 1600px hoặc thêm bước ~800px; đánh đổi là tốn thêm dữ liệu di động. Hỏi người dùng trước.
4. **Xác nhận thanh "Có bản mới"** ở lần deploy tiếp theo: trang tự hỏi SW (`status` → `stale`) sau 4 s và khi quay lại màn hình. Chưa được kiểm chứng trên iPhone vì chưa có bản mới nào xuất hiện sau khi thêm tính năng này. Nếu vẫn không hiện: bấm "Kiểm tra bản mới" trong bảng `?perf=1` và đọc dòng "Service worker:" của báo cáo.
5. Tuỳ chọn người dùng từng nhắc: tìm theo EXIF, kéo-thả sắp xếp album, thư viện ngoại tuyến thật sự, bật lại tên miền riêng `vietduongphoto.name.vn` khi DNS sẵn sàng (hiện không có `CNAME`; nếu bật phải đổi `ALLOWED_ORIGIN` ở ba nơi + OAuth + Firebase, xem CLAUDE.md).

## 3. Kết luận đo hiệu năng trên thiết bị thật (đừng đo lại những thứ đã rõ)

Thiết bị người dùng: iPhone 12 Pro Max (iOS 18, Safari) và một iPhone khác chạy Edge iOS.

- **Cuộn mượt**: Safari 59 Hz, 227 khung khi cuộn, 0 khung >50 ms, tệ nhất 39 ms. Edge chạy ~30 Hz: do Edge/Chế độ nguồn điện thấp, **không phải lỗi app** → đừng kết luận "giật" chỉ từ số khung >25 ms ở 30 Hz; xem dòng "bỏ lỡ ≥2 khung".
- **Bộ nhớ ổn**: đỉnh ước tính 8–93 MB, không có lỗi ảnh.
- **Service worker có chạy trên Edge iOS** ("đang điều khiển trang"). Ghi chú cũ "Edge iOS không có SW" là sai và đã sửa trong CLAUDE.md.
- Giật lúc yên ~1,3–1,6% khung (tệ nhất 144–184 ms), không do giải mã ảnh gốc. Chưa rõ nguyên nhân gốc; mức này nhỏ, chưa đáng ưu tiên.
- Khi zoom ở Edge có 1 khung 262 ms; chưa có số zoom ở Safari (lần đo chưa zoom).

## 4. Kiến trúc nhanh và chỗ dễ vấp (chi tiết ở CLAUDE.md)

- Module trình duyệt ở gốc repo: `app.js` (khởi động), `util.js`, `state.js`, `i18n.js` (bảng `vi`/`en` — thêm chuỗi thì thêm cả hai), `auth.js`, `library.js`, `router.js`, `gallery.js` (lưới masonry JS, recycling thẻ), `lightbox.js`, `zoom.js`, `share.js`, `select.js`, `zipdl.js`, `albums.js`, `settings.js`, `pwa.js`, `perf.js` (nạp động chỉ khi `?perf=1`), `backend.js` (Drive thật, Firestore, demo `?demo=1`), `lib.js` (logic thuần, test được), `sw.js`.
- **Thêm module/file tĩnh mới** ⇒ thêm vào `SHELL_FILES` (`sw.js`) **và** thẻ `modulepreload` trong `index.html` (test `sw.test.mjs`, `assets.test.mjs` fail nếu lệch). `perf.js` chỉ nằm trong `SHELL_FILES`, không preload.
- **Biểu tượng**: `icons.css` sinh bằng `npm run icons:css`; dùng biểu tượng mới thì chạy lại lệnh và commit. Đừng đặt `background` lên thẻ `<i>`.
- **iOS lưu ảnh**: trên màn cảm ứng ảnh gốc là `data:` URL (iOS không lưu được `blob:`), chỉ tải khi người dùng bấm Tải/zoom >1,5x. Đừng đổi lại.
- **Thẻ ảnh lưới chỉ gửi một yêu cầu ảnh** (đã bỏ nền mờ 32px — đừng thêm lại, tăng lỗi 429 của Google). Đừng nới giới hạn RAM trên điện thoại nếu chưa chạy `tests/ui/memory.spec.mjs`.
- **Ngày có >100 ảnh** từng gây giật lớn với CSS columns → đã chuyển sang masonry JS (`.gcol`). Đừng quay lại `columns`/`content-visibility`/`backdrop-filter` trên lưới.
- **Firestore rules** (`firestore.rules`) là bản của Firebase project dùng chung `ividlab-rficonsole`; sửa file không tự có hiệu lực — phải dán vào Firebase Console › Rules › Publish; đừng xoá phần của site khác. Phải safelist OAuth client ID trong Firebase Auth (đã làm).
- **Service worker**: khung ứng dụng cache nguyên khối (`vdphoto-shell-<hash>`), ảnh thumbnail Google cache-first chỉ khi 200, không cache Drive API/dữ liệu riêng tư. Sự cố: mở `?nosw=1`; thử SW trên localhost bằng `?sw=1`.
- **Bảng đo `?perf=1`**: nút Sao chép / Gửi / Cập nhật / Kiểm tra bản mới / Đặt lại / Tắt đo; `?perf=0` tắt hẳn. Muốn đo thêm gì: thêm điểm gắn `perfMark/perfAdd/perfCount/perfLb` + xử lý trong `sink()` của `perf.js` + dòng trong `buildReport()` + test trong `tests/perf.test.mjs`.

## 5. Lệnh & môi trường (Windows)

```bash
npm test          # node:test, 64 test
npm run lint      # eslint .
npm run test:ui   # Playwright Chromium, chế độ demo (?demo=1, thêm many=N, bulkday=1, guest=1, nopicker=1)
npx http-server . # chạy cục bộ
```

- Node không có trong PATH của shell mới: Bash dùng `export PATH="/c/Program Files/nodejs:$PATH"`; PowerShell dùng `$env:Path = "C:\Program Files\nodejs;" + $env:Path`.
- `core.autocrlf=true` nên git cảnh báo LF→CRLF (vô hại). Viết script sửa file nhiều dòng bằng công cụ Write, không dùng heredoc lồng quote (đã vỡ nhiều lần).
- CI: `.github/workflows/ci.yml` (lint + test + test:ui) chạy mỗi push/PR vào `main`. Chạy ít nhất `npm run lint && npm test` trước khi push.
- Quy trình: nhánh `vid/<tên>` → PR vào `main` (squash) hoặc push thẳng khi người dùng bảo; `git push` cần `gh auth login` + `gh auth setup-git` đã chạy.

## 6. Bài học khi làm việc với người dùng này

- Họ thử trên iPhone thật và dán báo cáo/ảnh chụp; ưu tiên số đo thật hơn suy đoán. Từng có hai nhận định sai của agent (ước tính modulepreload quá lạc quan; "Edge iOS không có SW"; nghi ngờ base64/decode là thủ phạm) — luôn nói rõ cái nào là đo được, cái nào là phỏng đoán.
- Khi họ báo "đã gửi số liệu" mà tin nhắn không có tệp đính kèm, hãy nói thẳng là chưa nhận được và xin dán dạng chữ.
- Trả lời bằng tiếng Việt, ngắn gọn; đề xuất có khuyến nghị rõ ràng và hỏi một câu quyết định thay vì liệt kê dài.
