# VietDuong Photo (`javisdinh0.github.io/vietduongphoto`)

Thư viện ảnh đọc từ một thư mục Google Drive, chạy hoàn toàn phía client (repo độc lập, site ở gốc: `index.html`, `app.js`, `backend.js`, `style.css`; không cần build — host tĩnh trên GitHub Pages).

## Chức năng
- Đăng nhập Google (GIS, scope `drive.readonly email`); token tự làm mới im lặng trước khi hết hạn; email được nhớ (`vd_photo_email`) nên mở lại sau khi token hết hạn sẽ tự xin token im lặng (cần còn phiên Google trong trình duyệt và trình duyệt không chặn popup), "Đăng xuất" thì quên.
- **Album = thư mục con Drive** (đệ quy, breadcrumb, đếm ảnh, ảnh bìa = ảnh mới nhất). Router hash: `#/`, `#/all`, `#/fav`, `#/f/<folderId>`, `#/v/<albumId>`.
- **Album tuyển chọn (ảo)** — chỉ admin tạo: chọn nhiều ảnh → "Thêm vào album"; đổi tên/xoá/bỏ ảnh/đặt bìa. Lưu ở Firestore `photoAlbums/{id}` `{name, fileIds[], cover}` (chỉ id file Drive, quyền xem ảnh vẫn do Drive quyết định).
- Xin quyền: nút "Gửi yêu cầu truy cập" ghi `photoRequests/{email}`; admin xem/xoá trong modal Cài đặt. Vẫn có nút mailto dự phòng.
- Admin = email trong `config/owners` (Firestore), fallback `dinhvietdung.vn@gmail.com`. Access token GIS được đổi sang phiên Firebase bằng `signInWithCredential` (cần bật provider **Google** ở Firebase Auth của dự án `ividlab-rficonsole` **và** thêm client ID OAuth của app vào *Safelist client IDs from external projects* — không thì `signInWithCredential` báo `auth/invalid-credential: access_token audience is not for this project` và mọi thao tác ghi album bị `permission-denied`; đừng sửa "Web SDK configuration" vì đó là client của chính Firebase).
- Lightbox: ←/→/Esc, vuốt, zoom (click/lăn chuột) + kéo, panel EXIF (`imageMediaMetadata`), yêu thích, tải JPG / RAW.
- Ghép cặp JPG↔RAW cùng thư mục; sắp xếp theo ngày chụp thật; nhóm theo tháng + timeline; masonry giữ chỗ theo tỉ lệ ảnh; render dần (IntersectionObserver).
- Tìm theo tên, lọc năm / có RAW / yêu thích (yêu thích lưu localStorage).
- Chọn nhiều → tải **zip** (store, có CRC, tuỳ chọn kèm RAW).
- Cache cây thư mục + danh sách file trong IndexedDB 20 phút (xoá khi đăng xuất / đổi cấu hình).
- Theme + ngôn ngữ lưu localStorage với key `vdphoto_theme`, `vdphoto_lang` (vẫn đọc key cũ `ividlab-theme`, `ividlab-lang` làm giá trị dự phòng, không còn ghi vào). Nút nhà trong `index.html` vẫn trỏ `ividlab.com`.

## Firestore rules
[`firestore.rules`](../firestore.rules) ở gốc repo là **bản đầy đủ của dự án Firebase `ividlab-rficonsole`** (dùng chung với site khác như RFI Console); phần của VietDuong Photo là khối `photoAlbums` + `photoRequests` (admin = owner trong `config/owners`). Muốn có hiệu lực phải dán toàn bộ vào Firebase Console > Firestore > Rules > Publish (hoặc `firebase deploy --only firestore:rules`), không thì album ảo/yêu cầu quyền báo "không lưu được". Quyền: người đăng nhập (email đã xác minh) đọc album; chỉ owner ghi album (tên ≤ 200 ký tự, chỉ các trường `name, fileIds, cover, createdAt`) và đọc/xoá yêu cầu; mỗi người chỉ gửi được yêu cầu cho chính email mình. Lưu ý: app coi `dinhvietdung.vn@gmail.com` là admin dự phòng ở phía client, nhưng rules chỉ tin `config/owners` — email đó phải có trong `config/owners.emails` (chữ thường) thì mới ghi được.

## Test không cần đăng nhập
`<url-site>/?demo=1` (cục bộ: `npx serve .` hoặc server tĩnh bất kỳ) dùng dữ liệu Drive giả + album ảo lưu localStorage (`&guest=1` để xem như khách, không có quyền admin).

## Tối ưu (v2)
- **Cấu trúc:** `lib.js` (logic thuần: ghép JPG/RAW, lọc, gộp tháng, router, gộp delta), `zip.js` (zip trong RAM + `ZipStream` ghi luồng), `backend.js` (Drive/Firestore/demo), UI chia module: `util.js` (DOM/localStorage/toast), `i18n.js`, `cache.js` (IndexedDB), `state.js` (state + cấu hình `cfg`), `auth.js`, `library.js` (tải + SWR), `router.js`, `gallery.js` (render ảnh, recycling, timeline), `select.js`, `zipdl.js`, `albums.js`, `lightbox.js`, `settings.js`, `app.js` (nối sự kiện + khởi động). Test: `npm test` (`tests/vietduongphoto.test.mjs`, node:test, không cần trình duyệt).
- **Tải nhanh:** cache IndexedDB kiểu stale-while-revalidate — có cache là vẽ ngay (kể cả cũ), cache < 5 phút thì không hỏi Drive; cũ hơn thì đồng bộ nền **tăng dần** (`modifiedTime > lần trước`, kể cả file vào thùng rác), tải đủ lại sau 24h; đổi dữ liệu thì tự vẽ lại + toast. Truy vấn danh sách chỉ lấy `width,height,time`; EXIF đầy đủ lấy khi mở lightbox. Truy vấn cùng tầng chạy song song (3 luồng), backoff luỹ thừa cho 429/5xx/403 rateLimit.
- **Ảnh:** `srcset` 400/800/1200, tự xin link thumbnail mới khi link hết hạn, hiện thumbnail ngay trong lightbox rồi thay ảnh lớn 2000px, sau ~0,35s tải **file gốc** từ Drive thành blob và gán làm nguồn `<img>` (nhấn giữ / chuột phải "Lưu ảnh" ra đúng chất lượng gốc; JPG/PNG/WebP/GIF/BMP, HEIC/RAW giữ bản xem trước; lướt nhanh thì huỷ), hủy preload cũ khi lướt nhanh, `content-visibility:auto` cho ảnh ngoài màn hình.
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

## Đăng nhập một lần (refresh token qua Worker)
Không có proxy: token Google sống ~1 giờ; mở lại sau đó chỉ thử đăng nhập im lặng (có thể bị chặn popup). Có proxy + secret: đăng nhập **một lần** là đủ, token tự làm mới vô thời hạn cho tới khi bấm Đăng xuất hoặc thu hồi quyền trong tài khoản Google.
- **Luồng:** GIS `initCodeClient` (popup) → client gửi `code` tới `POST /auth/code` → Worker đổi lấy access + refresh token bằng client secret → trả access token và `rt` (refresh token **mã hoá AES-GCM** bằng `TOKEN_KEY`, lưu ở localStorage `vd_photo_rt`; không dùng được ngoài Worker). Làm mới: `POST /auth/refresh {rt}`; Đăng xuất: `POST /auth/revoke {rt}`. Chỉ nhận POST từ đúng `ALLOWED_ORIGIN`, chỉ phục vụ `GOOGLE_CLIENT_ID` đã cấu hình. Code: `proxy/auth.js`, test: `tests/auth-worker.test.mjs` (Google giả).
- **Bật:** (1) Google Cloud Console → OAuth client loại *Web* đang dùng: giữ `Authorized JavaScript origins` có `https://javisdinh0.github.io`, lấy **Client secret**. (2) `cd proxy`, đặt `GOOGLE_CLIENT_ID` trong `wrangler.toml`, chạy `npx wrangler secret put GOOGLE_CLIENT_SECRET` và `npx wrangler secret put TOKEN_KEY`, rồi `npx wrangler deploy`. (3) Dán URL Worker vào Cài đặt → Proxy URL, đăng nhập lại một lần (có thể phải đồng ý lại quyền để Google cấp refresh token).
- **Lưu ý bảo mật:** `rt` trong localStorage vẫn là "chìa khoá dài hạn" của trình duyệt đó — ai lấy được cả `rt` lẫn gọi từ đúng origin mới dùng được; đừng bật trên máy dùng chung. Nếu Google không trả refresh token (đã cấp trước đó) app vẫn đăng nhập được nhưng chỉ 1 giờ. Chưa thử với Google thật vì cần client secret của chủ dự án.

## CI và kiểm thử
- `npm run lint` (ESLint, `eslint.config.mjs`: bắt biến chưa khai báo/import thừa), `npm test` (node:test: logic, Drive giả + proxy, Worker auth), `npm run test:ui` (Playwright/Chromium, `tests/ui/*.spec.mjs` gồm `gallery` và `nav`: tiêu đề trang, thanh điều hướng dưới trên viewport 390px, không tràn ngang, chạy ở `?demo=1` nên không cần tài khoản: trang chủ, khách vs admin, album lồng nhau, lightbox + phím tắt, link `#/p/<id>`, tìm kiếm, chọn nhiều → album ảo → đổi tên/xoá, zip, ngôn ngữ/theme, recycling 600 ảnh; mỗi test fail nếu có lỗi JS/console).
- Lần đầu chạy UI cục bộ: `npm i` rồi `npx playwright install chromium`.
- `.github/workflows/ci.yml` chạy cả ba trên mỗi push vào `main` và mỗi pull request; fail thì tải artifact `playwright-report`.
- Chưa phủ: đăng nhập Google/Firebase thật (cần tài khoản), Drive thật, proxy đã deploy.

## Giao diện điện thoại
Dưới 768px có thanh điều hướng dưới (Thư viện / Yêu thích / Chọn / Cài đặt — người không phải admin thì tab cuối là Đăng xuất); các nút Cài đặt/Đăng xuất/ividlab ở header được ẩn vì đã có ở thanh dưới, thanh chọn ảnh nổi phía trên thanh điều hướng. Trang album/thư mục/tất cả/yêu thích có tiêu đề serif lớn + số ảnh (`#pageTitle`, `#pageSub`).

## Lưu ảnh gốc trên điện thoại
Nhãn `#lbQuality` ở lightbox báo tiến độ tải ảnh gốc. iOS (Safari/Edge) không lưu được ảnh có địa chỉ `blob:` khi nhấn giữ ("Không có kết nối internet"), nên trên màn hình cảm ứng ảnh gốc (<= 40 MB) được gán bằng `data:` URL; ngoài ra có nút **Lưu vào Ảnh** dùng Web Share với file gốc (hiện khi trình duyệt hỗ trợ `navigator.canShare({files})`), cách đáng tin nhất để vào thư viện Ảnh đúng chất lượng gốc. Nút **Tải ảnh** luôn tải file gốc về Tệp. Test: `tests/ui/save.spec.mjs`.

## Tiết kiệm dữ liệu khi xem ảnh gốc
- Ảnh gốc vừa xem được giữ trong bộ nhớ đệm nhỏ (tối đa 3 ảnh / 60 MB, xoá khi đóng lightbox) nên lùi/tiến không tải lại.
- Khi **trình chiếu** không tải ảnh gốc (dùng bản xem trước 2000px); dừng trình chiếu thì mới tải ảnh đang xem.
- Khi bật **Tiết kiệm dữ liệu** của trình duyệt (`navigator.connection.saveData`), nhãn `#lbQuality` hiện "Chạm để tải ảnh gốc" và chỉ tải khi chạm.
- Lướt nhanh thì huỷ yêu cầu đang chạy (chờ ~0,25s mới bắt đầu tải). Test: `tests/ui/data.spec.mjs`.
- **Thứ tự tải trong lightbox (để xem trước luôn hiện ngay, nhất là trên mạng di động):** ảnh đã có sẵn trong lưới (hoặc thumbnail 600px) hiện tức thì → bản xem trước 2000px → *sau đó mới* tải ảnh gốc và thumbnail 1200px của ảnh lân cận (không chạy song song để khỏi tranh băng thông; mạng quá chậm thì sau 6s vẫn bắt đầu tải ảnh gốc). Test: `tests/ui/preview.spec.mjs`.
- **Điện thoại (màn hình cảm ứng): ảnh gốc chỉ tải khi cần lưu.** Mặc định chỉ xem trước 2000px, nhãn `#lbQuality` ghi "Bản xem trước. Bấm Tải ảnh để lấy ảnh gốc (x MB)"; bấm **Tải ảnh** (hoặc chạm nhãn) mới tải ảnh gốc kèm tiến độ rồi hiện nó (giữ ảnh để lưu / nút **Lưu vào Ảnh**); bấm Tải ảnh lần nữa khi ảnh gốc đã có thì tải file như thường. Bấm lúc đang tải không gửi thêm yêu cầu. Máy tính vẫn tự tải ảnh gốc.

## Chia sẻ album công khai (link, không cần đăng nhập)
Admin tạo link cho **album ảo hoặc thư mục** (nút "Chia sẻ công khai" ở trang album) → ai có link xem được album mà không cần Google. Ảnh vẫn riêng tư trên Drive: Worker giữ refresh token (mã hoá) của admin tạo link và tự lấy ảnh thay người xem.
- **Tính năng cần Worker + KV** (ngoài phần đăng nhập một lần ở trên): `npx wrangler kv namespace create SHARES`, dán `id` vào `proxy/wrangler.toml` (`[[kv_namespaces]] binding = "SHARES"`), đặt `OWNER_EMAILS` (mặc định `dinhvietdung.vn@gmail.com`), `npx wrangler deploy`; admin đăng nhập lại một lần để có `vd_photo_rt`. Chưa bật thì hộp thoại chỉ hiện hướng dẫn.
- **Tạo link:** chọn hiệu lực (mặc định 30 ngày; 7 / 90 ngày / không hết hạn) và có cho tải ảnh gốc không (mặc định có) → link dạng `<site>/?w=<URL Worker>#/s/<token>` (tự sao chép). Danh sách link đang hoạt động của album có nút **Sao chép** và **Thu hồi** (hiệu lực ngay ở lần gọi kế tiếp; thumbnail đã tải về trình duyệt người xem còn cache tối đa 1 giờ).
- **Worker** (`proxy/share.js`): `POST /share/create|list|revoke` chỉ nhận từ đúng `ALLOWED_ORIGIN` với refresh token của một email thuộc `OWNER_EMAILS`; `GET /share/<token>` (metadata), `/img/<id>?q=s800` (thumbnail, tối đa 2400px, cache riêng tư 1 giờ), `/dl/<id>` (ảnh gốc, chỉ khi link cho tải). Token ngẫu nhiên 128 bit; chỉ phục vụ file nằm trong danh sách của link, không bao giờ đọc file Drive tuỳ ý. Metadata không chứa refresh token.
- **Người xem** (`share.js`): chế độ công khai không đọc/gửi bất kỳ token nào của trình duyệt, ẩn đăng nhập/cài đặt/chọn ảnh/thanh dưới; link chỉ-xem không có nút tải và không bao giờ gọi `/dl`. Tham số `w` chỉ chấp nhận https (hoặc localhost khi phát triển) và trang luôn ghi rõ "Chia sẻ qua <host>" để người xem biết nguồn.
- **Lưu ý bảo mật:** ai có link đều xem được cho tới khi hết hạn/thu hồi (link bị chuyển tiếp vẫn xem được); đặt hiệu lực ngắn cho album nhạy cảm. Thu hồi một link không ảnh hưởng link khác.
- Test: `tests/share-worker.test.mjs` (KV + Google + Drive giả), `tests/ui/share.spec.mjs` (người xem và hộp thoại admin, Worker giả bằng `page.route`).

## Tiết kiệm bộ nhớ trên điện thoại
Safari iOS bỏ bớt ảnh đã giải mã khi tab dùng nhiều RAM (biểu hiện: ô trống/mờ khi cuộn, nhất là sau khi mở nhiều ảnh gốc). Trên màn hình cảm ứng (`isCoarse()` trong `util.js`): thumbnail lưới chỉ 400/600px (desktop 400/800/1200px); phạm vi giữ nội dung thẻ ảnh quanh màn hình 1000px (desktop 2500px); thẻ bị gỡ thì gỡ cả `src/srcset` của `<img>` để nhả ảnh; bản xem trước trong lightbox 1600px và ảnh lân cận 800px (desktop 2000/1200px); bộ nhớ đệm ảnh gốc chỉ 1 ảnh / 40 MB (desktop 3 ảnh / 60 MB). Test: `tests/ui/memory.spec.mjs`.

## Chuyển ảnh bằng mũi tên không bị mất xem trước
Trước đây mỗi lần bấm mũi tên đều bắt đầu tải bản lớn (1600/2000px) của ảnh mới mà không huỷ bản của các ảnh trước, nên khi lướt nhiều các yêu cầu cũ chặn băng thông và ảnh hiện tại không có xem trước; thumbnail hết hạn/bị giới hạn tốc độ cũng làm ảnh trống. Nay: (1) ảnh lân cận ±3 được tải sẵn bản **600px** (đúng URL dùng cho xem trước tức thì); (2) bản lớn chỉ bắt đầu sau khi dừng ~150ms và bị huỷ khi chuyển ảnh/đóng; (3) lỗi tải xem trước/bản lớn thì xin link thumbnail mới (`renewOnce`, tối đa 1 lần / 10 phút mỗi ảnh) rồi thử lại, nếu không có link mới thì thử lại sau 1,5s. Test: `tests/ui/arrows.spec.mjs`.
- **Ảnh xem trước nét dần theo 3 bước:** 600px (tức thì, hoặc ảnh có sẵn trong lưới) → **1000px** (~100–200 KB, sau ~150ms dừng; cho ảnh nét ngay trên mạng yếu) → 1600px (điện thoại) / 2000px → ảnh gốc. Mỗi bước thành công mới sang bước sau và đều huỷ được khi chuyển ảnh. Ảnh lân cận ±2 tải sẵn bản 600px một lần (`LB.preSet`), không tải lại khi bấm qua lại; chỉ ngắt những ảnh lân cận chưa tải xong.

## Hướng dẫn triển khai Worker (đăng nhập một lần + chia sẻ album)
Cần tài khoản Cloudflare (gói miễn phí đủ) và Node.js. Worker này gồm 3 phần dùng chung một lần triển khai: proxy cache metadata Drive, đăng nhập một lần (`/auth/*`), chia sẻ album công khai (`/share/*`, cần KV).

**Chuẩn bị ở Google Cloud Console** (dự án chứa OAuth client của app, Client ID nằm trong `app.js` → `DEFAULT_CLIENT_ID`):
1. *APIs & Services → Credentials → OAuth 2.0 Client IDs →* chọn client loại **Web application** đó. *Authorized JavaScript origins* phải có `https://javisdinh0.github.io`.
2. Mục **Client secrets → Add secret**, sao chép giá trị ngay (Google chỉ hiện đầy đủ một lần). Đây là `GOOGLE_CLIENT_SECRET`.
3. *OAuth consent screen →* nếu trạng thái là **Testing**, refresh token chỉ sống 7 ngày; chuyển sang **In production** (dù app chưa được xác minh) để đăng nhập một lần thật sự bền.

**Triển khai** (PowerShell; nếu không thấy `node` thì chạy trước `$env:Path = "C:\Program Files\nodejs;" + $env:Path`):
```
cd <thư mục repo>\proxy
npx wrangler login                                  # mở trình duyệt, đăng nhập Cloudflare
npx wrangler kv namespace create SHARES             # chỉ cần nếu dùng chia sẻ album; ghi lại id
```
Sửa `proxy/wrangler.toml`: bỏ comment và điền `GOOGLE_CLIENT_ID` (trong `[vars]`), và (nếu dùng chia sẻ) khối `[[kv_namespaces]]` với `id` vừa có; `OWNER_EMAILS` chỉ cần khi admin không phải `dinhvietdung.vn@gmail.com`. Rồi đặt hai secret:
```
npx wrangler secret put GOOGLE_CLIENT_SECRET        # dán Client secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # sinh chuỗi ngẫu nhiên
npx wrangler secret put TOKEN_KEY                   # dán chuỗi vừa sinh
npx wrangler deploy
```
Lần đầu Cloudflare hỏi đặt tên miền con `workers.dev`; kết quả in ra URL dạng `https://vdphoto-proxy.<tên>.workers.dev`.

**Kiểm tra Worker:** `GET <URL>/drive/v3/files` phải trả `401` (chưa có token); `POST <URL>/auth/code` từ curl phải trả `403 forbidden_origin` (đúng, vì không phải từ trang). `501 not_configured` nghĩa là thiếu secret hoặc KV.

**Bật trong app:** đăng nhập admin → bánh răng (Cài đặt) → ô **Proxy URL** dán URL Worker → Lưu (trang tải lại) → bấm Đăng nhập lại **một lần** (Google có thể xin lại quyền để cấp refresh token). Từ đó token tự làm mới; đóng tab nhiều giờ rồi mở lại vẫn vào thẳng. Thử chia sẻ: mở một album → **Chia sẻ công khai** → Tạo link → mở link trong cửa sổ ẩn danh.

**Lỗi thường gặp**
- Hộp thoại chia sẻ báo "Cần bật Worker…": chưa nhập Proxy URL hoặc chưa đăng nhập lại sau khi nhập (thiếu `vd_photo_rt`).
- `Không thực hiện được [forbidden]` khi tạo link: email đang đăng nhập không có trong `OWNER_EMAILS`.
- `[invalid_grant]` / bị hỏi đăng nhập lại liên tục: đã đổi `TOKEN_KEY`, hoặc refresh token bị thu hồi/hết hạn (consent screen đang ở *Testing*). Đăng nhập lại; các link chia sẻ cũ của refresh token đó cũng cần tạo lại.
- Lỗi CORS trong console: `ALLOWED_ORIGIN` phải đúng `https://javisdinh0.github.io` (không có `/` cuối, không có đường dẫn).
- Giới hạn gói miễn phí: Workers 100.000 yêu cầu/ngày (mỗi ảnh xem qua link chia sẻ là một yêu cầu), KV 1.000 lượt ghi/ngày (mỗi link tạo/thu hồi ghi vài lần), đủ dùng cho gia đình/bạn bè.
- Không commit secret: Client secret và `TOKEN_KEY` chỉ đặt bằng `wrangler secret put`.

## Ảnh nét không tải được sau một lúc (giới hạn tốc độ của Google)
- **Service worker không còn lưu lỗi.** Trước đây thumbnail `googleusercontent.com` được tải ở chế độ no-cors nên phản hồi là "opaque" và cả những ảnh bị Google trả 429/403 (khi tải quá nhiều trong thời gian ngắn) cũng bị lưu vào cache rồi hiện lỗi mãi. Nay tải ở chế độ CORS, **chỉ lưu khi 200**; CORS bị chặn thì tải thường và không lưu. Tên cache đổi sang `vdphoto-img-v2` nên lần kích hoạt đầu tiên tự xoá cache cũ có thể đã nhiễm lỗi. Test: `tests/sw.test.mjs`.
- **Thử lại có lùi dần.** Bước xem trước 1000px / bản lớn bị lỗi thì: xin link thumbnail mới 1 lần (nếu hết hạn), rồi thử lại sau 0,8s, 1,6s, 3,2s; hết lượt thì nhãn `#lbQuality` hiện "Không tải được ảnh nét. Chạm để thử lại" (chạm để chạy lại cả chuỗi). Chuyển ảnh thì các lượt thử của ảnh cũ bị huỷ. Test: `tests/ui/retry.spec.mjs`.
- **Danh sách ảnh thêm theo lát thời gian:** khi cuộn tới gần cuối, các hàng ảnh mới được dựng từng lát ≤ 8ms mỗi khung hình thay vì 80 hàng trong một tác vụ (nhảy mục timeline và khôi phục vị trí cuộn vẫn đồng bộ).
- **Giật khi kéo kịch đáy album (iOS):** bỏ `backdrop-filter` của thanh tiêu đề dính đầu trang (Safari phải làm mờ lại hàng trăm ảnh phía sau ở mỗi khung hình cuộn); bộ gỡ/điền thẻ ảnh dùng **hai ngưỡng có độ trễ** (điền ở M, chỉ gỡ khi ra khỏi 1,5·M) nên kéo qua lại/bật lại ở biên không còn dựng–gỡ liên tục (thao tác kéo ±350px 30 lần: từ 60+60 xuống ≤10 lần dựng/gỡ). Test: `tests/ui/scroll.spec.mjs`.
