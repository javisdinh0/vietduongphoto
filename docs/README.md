# VietDuong Photo (`javisdinh0.github.io/vietduongphoto`)

Thư viện ảnh đọc từ một thư mục Google Drive, chạy hoàn toàn phía client (repo độc lập, site ở gốc: `index.html`, `app.js`, `backend.js`, `style.css`; không cần build — host tĩnh trên GitHub Pages).

## Chức năng
- Đăng nhập Google (GIS, scope `drive.readonly email`); token tự làm mới im lặng trước khi hết hạn.
- **Album = thư mục con Drive** (đệ quy, breadcrumb, đếm ảnh, ảnh bìa = ảnh mới nhất). Router hash: `#/`, `#/all`, `#/fav`, `#/f/<folderId>`, `#/v/<albumId>`.
- **Album tuyển chọn (ảo)** — chỉ admin tạo: chọn nhiều ảnh → "Thêm vào album"; đổi tên/xoá/bỏ ảnh/đặt bìa. Lưu ở Firestore `photoAlbums/{id}` `{name, fileIds[], cover}` (chỉ id file Drive, quyền xem ảnh vẫn do Drive quyết định).
- Xin quyền: nút "Gửi yêu cầu truy cập" ghi `photoRequests/{email}`; admin xem/xoá trong modal Cài đặt. Vẫn có nút mailto dự phòng.
- Admin = email trong `config/owners` (Firestore), fallback `dinhvietdung.vn@gmail.com`. Access token GIS được đổi sang phiên Firebase bằng `signInWithCredential` (cần bật provider **Google** ở Firebase Auth của dự án `ividlab-rficonsole`).
- Lightbox: ←/→/Esc, vuốt, zoom (click/lăn chuột) + kéo, panel EXIF (`imageMediaMetadata`), yêu thích, tải JPG / RAW.
- Ghép cặp JPG↔RAW cùng thư mục; sắp xếp theo ngày chụp thật; nhóm theo tháng + timeline; masonry giữ chỗ theo tỉ lệ ảnh; render dần (IntersectionObserver).
- Tìm theo tên, lọc năm / có RAW / yêu thích (yêu thích lưu localStorage).
- Chọn nhiều → tải **zip** (store, có CRC, tuỳ chọn kèm RAW).
- Cache cây thư mục + danh sách file trong IndexedDB 20 phút (xoá khi đăng xuất / đổi cấu hình).
- Theme + ngôn ngữ lưu localStorage với key `ividlab-theme`, `ividlab-lang` (giữ tên cũ từ thời còn chung site ividlab để không mất cài đặt người dùng). Nút nhà trong `index.html` vẫn trỏ `ividlab.com`.

## Firestore rules
[`firestore.rules`](../firestore.rules) ở gốc repo là nguồn chuẩn cho `config/owners`, `photoAlbums`, `photoRequests` — **phải dán tay vào Firebase Console** (hoặc `firebase deploy --only firestore:rules`) mới có hiệu lực, không thì album ảo/yêu cầu quyền báo "không lưu được". Dự án Firebase `ividlab-rficonsole` còn có thể phục vụ site khác: nếu vậy hãy gộp các `match` vào rules hiện có, đừng ghi đè. Quyền: người đăng nhập (email đã xác minh) đọc album; chỉ admin ghi album, đọc/xoá yêu cầu; mỗi người chỉ gửi được yêu cầu cho chính email của mình.

## Test không cần đăng nhập
`<url-site>/?demo=1` (cục bộ: `npx serve .` hoặc server tĩnh bất kỳ) dùng dữ liệu Drive giả + album ảo lưu localStorage (`&guest=1` để xem như khách, không có quyền admin).

## Tối ưu (v2)
- **Cấu trúc:** `lib.js` (logic thuần: ghép JPG/RAW, lọc, gộp tháng, router, gộp delta), `zip.js` (zip trong RAM + `ZipStream` ghi luồng), `backend.js` (Drive/Firestore/demo), `app.js` (UI). Test: `npm test` (`tests/vietduongphoto.test.mjs`, node:test, không cần trình duyệt).
- **Tải nhanh:** cache IndexedDB kiểu stale-while-revalidate — có cache là vẽ ngay (kể cả cũ), cache < 5 phút thì không hỏi Drive; cũ hơn thì đồng bộ nền **tăng dần** (`modifiedTime > lần trước`, kể cả file vào thùng rác), tải đủ lại sau 24h; đổi dữ liệu thì tự vẽ lại + toast. Truy vấn danh sách chỉ lấy `width,height,time`; EXIF đầy đủ lấy khi mở lightbox. Truy vấn cùng tầng chạy song song (3 luồng), backoff luỹ thừa cho 429/5xx/403 rateLimit.
- **Ảnh:** `srcset` 400/800/1200, tự xin link thumbnail mới khi link hết hạn, hiện thumbnail ngay trong lightbox rồi thay ảnh lớn, hủy preload cũ khi lướt nhanh, `content-visibility:auto` cho ảnh ngoài màn hình.
- **Zip:** Chrome/Edge desktop ghi luồng ra file (File System Access API, RAM không phình, file >4GB không hỗ trợ); trình duyệt khác gom trong RAM với 3 luồng + thử lại. Có nút huỷ. `?nopicker=1` ép dùng đường RAM để test.
- **UX:** timeline theo dõi cuộn + chuyển Năm/Tháng, nhớ bộ lọc (sessionStorage) và vị trí cuộn khi Back, slideshow (Space), phím tắt (←/→/Esc/F/I/S), link ảnh `#/p/<id>`.
- **PWA:** `sw.js` (chỉ đăng ký trên https): file của trang network-first, thumbnail Google cache-first (tối đa 600). Không cache Drive API/dữ liệu riêng tư. `manifest.webmanifest` để cài như app.
- Test cache trên demo: `?demo=1&cache=1`.

## Tối ưu (v3 — phần còn lại của đề xuất)
- **Virtual recycling:** nội dung mỗi thẻ ảnh (`<img>`, nút) chỉ tồn tại khi thẻ cách màn hình < 2500px; cuộn xa thì gỡ, giữ khung theo tỉ lệ → 630 thẻ chỉ ~25–50 `<img>`. Test: `?demo=1&many=600`.
- **Lưới đều (justified):** nút chuyển masonry ↔ lưới hàng đều (lưu localStorage).
- **Blur-up:** ảnh 32px làm nền mờ trong lúc thumbnail chính tải.
- **Hiện album sớm:** lần đầu chưa có cache, danh sách album hiện ngay khi có cây thư mục (số ảnh "…"), điền số + ảnh bìa khi tải xong file. Test: `?demo=1&slow=6000`.
- **Batch thumbnail:** ảnh lỗi/hết hạn được gom 60ms và xin link mới bằng 1 request `POST /batch/drive/v3` (tối đa 50/lần); nếu batch lỗi tự rơi về từng request. (Parser/builder có unit test; chưa kiểm chứng với Drive thật.)
- **Zip trong Web Worker:** `zipworker.js` + `zipclient.js` — CRC và ghi zip ngoài luồng chính; ghi luồng chuyển `WritableStream`/`ReadableStream` sang worker; không hỗ trợ thì tự rơi về luồng chính. Đã test: zip RAM qua worker, stream transfer, huỷ giữa chừng.
- **Proxy server tuỳ chọn:** `proxy/worker.js` (Cloudflare Worker). Chuyển tiếp `Authorization` của chính người dùng (quyền vẫn do Drive quyết định, proxy không giữ secret), cache metadata 60s **riêng theo từng token**, `alt=media`/batch stream thẳng, CORS chỉ cho `ALLOWED_ORIGIN` (mặc định `https://javisdinh0.github.io`). Triển khai: `wrangler deploy` (biến `ALLOWED_ORIGIN`), rồi admin dán URL vào Cài đặt → "Proxy URL". Proxy chưa được deploy thật (cần tài khoản Cloudflare); đã có unit test (yêu cầu token, chặn path lạ, cache tách token).
- Không làm: Drive *global* batch endpoint (đã ngừng) — dùng endpoint riêng `/batch/drive/v3` ở trên.

## Timeline theo ngày (v3.1)
- Ảnh nhóm **theo từng ngày** (tiêu đề "Thứ ba, 25 tháng 3, 2025 · N ảnh"). Timeline mặc định liệt kê từng ngày, chia nhãn tháng; nút đầu timeline xoay vòng Ngày → Tháng → Năm (lưu localStorage `vdphoto_tl`; thư viện >150 ngày mà chưa chọn thì mặc định Tháng). Scroll-spy tô đúng mục ở cả 3 chế độ. Logic: `groupDays` trong `lib.js` (có test).

## Kiểm thử tích hợp (không cần tài khoản)
`npm test` chạy thêm `tests/vietduongphoto.integration.test.mjs`: code Drive thật của app (`createDrive`) + proxy worker chạy qua HTTP với Drive giả đúng giao thức (phân trang, `in parents`, delta `modifiedTime`, thùng rác, batch multipart, 401/403/429+backoff, `alt=media`, thư mục con bị cấm). Test này đã bắt và sửa lỗi 1 thư mục con bị cấm làm hỏng cả nhóm 20 thư mục (nay thử lại từng thư mục). Proxy cũng đã chạy thử trong runtime Cloudflare thật bằng `wrangler dev --local` (401 không token, 404 sai path, preflight CORS 204). Triển khai proxy: `cd proxy && npx wrangler login && npx wrangler deploy`.

## Triển khai site
Push lên `main` → GitHub Pages phục vụ tại `https://javisdinh0.github.io/vietduongphoto/` (đường dẫn favicon/manifest là tương đối). Custom domain `vietduongphoto.name.vn` đã gỡ `CNAME` tạm thời vì DNS chưa sẵn sàng; khi bật lại cần thêm `CNAME`, đổi `ALLOWED_ORIGIN` của proxy (`proxy/wrangler.toml`) và thêm origin vào OAuth client + Firebase authorized domains.
