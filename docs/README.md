# VietDuong Photo (`ividlab.com/vietduongphoto/`)

Thư viện ảnh đọc từ một thư mục Google Drive, chạy hoàn toàn phía client (`public/vietduongphoto/`: `index.html`, `app.js`, `backend.js`, `style.css`).

## Chức năng
- Đăng nhập Google (GIS, scope `drive.readonly email`); token tự làm mới im lặng trước khi hết hạn.
- **Album = thư mục con Drive** (đệ quy, breadcrumb, đếm ảnh, ảnh bìa = ảnh mới nhất). Router hash: `#/`, `#/all`, `#/fav`, `#/f/<folderId>`, `#/v/<albumId>`.
- **Album tuyển chọn (ảo)** — chỉ admin tạo: chọn nhiều ảnh → "Thêm vào album"; đổi tên/xoá/bỏ ảnh/đặt bìa. Lưu ở Firestore `photoAlbums/{id}` `{name, fileIds[], cover}` (chỉ id file Drive, quyền xem ảnh vẫn do Drive quyết định).
- Xin quyền: nút "Gửi yêu cầu truy cập" ghi `photoRequests/{email}`; admin xem/xoá trong modal Cài đặt. Vẫn có nút mailto dự phòng.
- Admin = email trong `config/owners` (Firestore), fallback `dinhvietdung.vn@gmail.com`. Access token GIS được đổi sang phiên Firebase bằng `signInWithCredential` (cần bật provider **Google** ở Firebase Auth — đã cần cho `/admin`).
- Lightbox: ←/→/Esc, vuốt, zoom (click/lăn chuột) + kéo, panel EXIF (`imageMediaMetadata`), yêu thích, tải JPG / RAW.
- Ghép cặp JPG↔RAW cùng thư mục; sắp xếp theo ngày chụp thật; nhóm theo tháng + timeline; masonry giữ chỗ theo tỉ lệ ảnh; render dần (IntersectionObserver).
- Tìm theo tên, lọc năm / có RAW / yêu thích (yêu thích lưu localStorage).
- Chọn nhiều → tải **zip** (store, có CRC, tuỳ chọn kèm RAW).
- Cache cây thư mục + danh sách file trong IndexedDB 20 phút (xoá khi đăng xuất / đổi cấu hình).
- Theme + ngôn ngữ dùng chung site (`ividlab-theme`, `ividlab-lang`), traffic tracking qua `traffic-track.js`.

## Firestore rules
Đã thêm `photoAlbums` + `photoRequests` vào `firebase/rficonsole/firestore.rules` — **phải dán tay vào Firebase Console** mới có hiệu lực (không thì album ảo/yêu cầu quyền báo "không lưu được").

## Test không cần đăng nhập
`/vietduongphoto/?demo=1` dùng dữ liệu Drive giả + album ảo lưu localStorage (`&guest=1` để xem như khách, không có quyền admin).
