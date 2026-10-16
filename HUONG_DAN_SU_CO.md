# Hướng dẫn: Cập nhật sự cố hiện trường (mưa bão, ngập úng, sạt lở) trên bản đồ số

Tính năng cho phép cán bộ tuần tra báo sự cố ngay tại hiện trường (vị trí GPS, ảnh, mô tả). Biểu tượng sự cố hiện lên bản đồ để mọi người cùng theo dõi. Cán bộ quản lý xác nhận, giao xử lý và kết thúc sự cố. Toàn bộ lịch sử được lưu lại.

## 1. Cách hệ thống lưu dữ liệu

```
Điện thoại / máy tính  ──►  Bản đồ (GitHub Pages)  ──►  Google Apps Script (máy chủ trung gian)
                                                         ├─► Google Sheet: SuCo, LichSu, NguoiDung
                                                         └─► Google Drive: thư mục AnhHienTruong_SuCo
```

- GitHub Pages chỉ chứa giao diện bản đồ, **không lưu dữ liệu**.
- Dữ liệu sự cố và lịch sử nằm trong **một Google Sheet** thuộc tài khoản Google của đơn vị. Ảnh nằm trong **Google Drive** của chính tài khoản đó.
- Dữ liệu không lưu trên trình duyệt, nên tải lại trang hay đổi máy vẫn thấy đủ. Mọi người dùng cùng xem một dữ liệu.
- Ai có đường link bản đồ đều **xem** được sự cố và ảnh. Chỉ người **đăng nhập** mới tạo và cập nhật được.

## 2. Cài đặt lần đầu (khoảng 15 phút, làm một lần)

Nên dùng tài khoản Google của đơn vị, không dùng tài khoản cá nhân, để dữ liệu thuộc về đơn vị.

### Bước 1: Tạo Google Sheet và dán mã máy chủ
1. Vào https://sheets.google.com và tạo **Bảng tính trống**, đặt tên ví dụ `Du lieu su co hien truong`.
2. Trên menu chọn **Tiện ích mở rộng → Apps Script**.
3. Xóa hết nội dung trong ô soạn mã, rồi dán **toàn bộ** nội dung file `apps_script/Code.gs`. Bấm biểu tượng **Lưu** (💾).

### Bước 2: Khởi tạo hệ thống
1. Ở thanh trên cùng của Apps Script, chọn hàm **`khoiTaoHeThong`**, bấm **Chạy**.
2. Google sẽ hỏi cấp quyền: bấm **Xem xét quyền**, chọn tài khoản, rồi **Nâng cao → Đi tới … (không an toàn) → Cho phép**.
   Thông báo "không an toàn" là bình thường, vì đây là mã do chính đơn vị viết, không phải ứng dụng đã đăng ký với Google.
3. Quay lại Google Sheet và tải lại trang. Sẽ có 3 trang tính **SuCo, LichSu, NguoiDung** và menu mới **🗺 Bản đồ sự cố**.

### Bước 3: Tạo tài khoản người dùng
Trong Google Sheet, chọn menu **🗺 Bản đồ sự cố → 2. Thêm / đặt lại mật khẩu người dùng** rồi nhập lần lượt:

| Ô hỏi | Ví dụ |
|---|---|
| Tên đăng nhập (không dấu) | `nva.tuantra` |
| Mật khẩu (≥ 6 ký tự) | `********` |
| Họ và tên | `Nguyễn Văn A` |
| Đơn vị | `Đội tuần đường số 1` |
| Vai trò | `tuan_tra` hoặc `quan_ly` hoặc `admin` |

Lặp lại cho từng người. Mỗi người một tài khoản riêng, không dùng chung. Mật khẩu được mã hóa, trong Sheet không ai đọc được mật khẩu gốc. Khi có người nghỉ việc, dùng mục **3. Khóa / mở khóa người dùng**.

**Quyền của từng vai trò**

| Thao tác | tuan_tra (tuần tra) | quan_ly (quản lý) | admin (quản trị) |
|---|:-:|:-:|:-:|
| Xem bản đồ, sự cố, ảnh | ✔ | ✔ | ✔ |
| Báo sự cố mới; bổ sung ảnh, ghi chú; cập nhật mức độ, giao thông | ✔ | ✔ | ✔ |
| Đổi trạng thái: đang xảy ra, đã kiểm tra, đang xử lý, đã khắc phục | ✔ | ✔ | ✔ |
| Sửa thông tin ban đầu (loại, tuyến, phường/xã, hướng tuyến, mô tả) | chỉ sự cố mình báo | ✔ | ✔ |
| Sửa tọa độ, thời gian phát hiện; ghi đơn vị phụ trách, biện pháp, thời gian xử lý, ghi chú kiểm tra, tài liệu | | ✔ | ✔ |
| **Xác nhận** và **Kết thúc** sự cố | | ✔ | ✔ |
| **Mở lại** sự cố đã kết thúc | | | ✔ |
| **Xóa ảnh** (bắt buộc ghi lý do; ảnh vào Thùng rác Google Drive 30 ngày) | | | ✔ |
| **Xóa sự cố** (bắt buộc ghi lý do) và **khôi phục** sự cố đã xóa | | | ✔ |
| **Quản lý tài khoản**: tạo mới, đổi vai trò, đặt lại mật khẩu, khóa/mở khóa | | | ✔ (nút ⚙ Quản trị trên bản đồ) |

Mọi thao tác xóa, khôi phục, sửa đều được ghi vào **Lịch sử cập nhật**: ai làm, lúc nào, lý do gì. Sự cố bị xóa không mất hẳn mà nằm trong mục "Sự cố đã xóa" để khôi phục khi cần. Quản trị viên không thể tự hạ quyền hoặc tự khóa chính mình, để tránh mất quyền quản trị.

### Bước 4: Triển khai thành ứng dụng web
1. Trong Apps Script, bấm **Triển khai → Tác vụ triển khai mới**.
2. Bấm biểu tượng bánh răng ⚙ ở mục **Chọn loại**, chọn **Ứng dụng web**.
3. Điền như sau:
   - Mô tả: `Ban do su co`
   - Thực thi dưới dạng: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
4. Bấm **Triển khai** rồi **sao chép URL ứng dụng web**. URL có dạng `https://script.google.com/macros/s/AKfy…/exec`.

### Bước 5: Gắn địa chỉ máy chủ vào bản đồ
1. Mở file `su_co_config.js` (trên GitHub bấm vào file rồi bấm ✏️ để sửa).
2. Dán URL vào giữa hai dấu nháy:
   ```js
   window.SUCO_API_URL = 'https://script.google.com/macros/s/AKfy…/exec';
   ```
3. Bấm **Commit changes**. Sau 1–2 phút, mở bản đồ và nhấn **Ctrl + F5**. Góc phải bản đồ sẽ có bảng **🚨 Sự cố hiện trường**.

### Khi sửa mã máy chủ về sau
Vào **Triển khai → Quản lý tác vụ triển khai → ✏️ → Phiên bản: Phiên bản mới → Triển khai**. URL giữ nguyên, không phải sửa `su_co_config.js`.

## 3. Đưa file lên GitHub

| File | Ghi chú |
|---|---|
| `index.html` | Đã thêm 3 dòng để nạp tính năng sự cố |
| `su_co.js`, `su_co.css` | Mới: chức năng và giao diện sự cố |
| `su_co_config.js` | Mới: điền URL máy chủ ở Bước 5 |
| `apps_script/Code.gs` | Mã máy chủ, lưu kèm để quản lý phiên bản (dán vào Apps Script, không chạy trên GitHub) |
| `HUONG_DAN_SU_CO.md` | Tài liệu này |

Các file dữ liệu cũ (`map.geojson`, `DT.geojson`, `DT 609.geojson`, `PCTT_BaoLu.geojson`) giữ nguyên.

## 4. Hướng dẫn sử dụng

### Nhân viên tuần tra: báo sự cố tại hiện trường
1. Mở bản đồ trên điện thoại, bấm **🚨 Sự cố hiện trường → ＋ Báo sự cố mới**, rồi đăng nhập. Chỉ cần đăng nhập lần đầu, phiên đăng nhập giữ 30 ngày.
2. Chọn vị trí theo một trong hai cách:
   - **📍 Dùng GPS của thiết bị**: lần đầu điện thoại hỏi quyền vị trí thì bấm **Cho phép**.
   - Chạm trực tiếp lên bản đồ.
3. Biểu mẫu tự điền **tuyến đường gần nhất** (trong phạm vi 250 m), **phường/xã** và **thời gian**. Anh/chị chỉ cần:
   - chạm chọn **Loại sự cố**, **Mức độ**, **Tình trạng giao thông**;
   - ghi mô tả ngắn;
   - bấm **📷 Chụp ảnh** (mở camera) hoặc **🖼 Chọn ảnh có sẵn**. Có thể thêm nhiều ảnh.
4. Bấm **Gửi báo cáo**. Chỉ khi hiện thông báo xanh **"Đã lưu sự cố SC-…"** thì dữ liệu mới thật sự được lưu. Lúc đó biểu tượng nhấp nháy xuất hiện trên bản đồ của mọi người.

**Khi sóng yếu hoặc mất mạng:** màn hình báo đỏ **"CHƯA LƯU …"**, nội dung vẫn giữ nguyên trong biểu mẫu. Có sóng lại thì bấm **Gửi báo cáo** lần nữa.
- Ảnh đã tải xong sẽ không phải tải lại.
- Nếu lần trước thực ra đã lưu, hệ thống nhận biết và **không tạo sự cố trùng**.
- Nội dung đang nhập được lưu nháp trên máy trong 24 giờ, phòng khi lỡ đóng trình duyệt.

### Theo dõi và cập nhật quá trình xử lý
- Bấm vào biểu tượng trên bản đồ hoặc vào dòng trong danh sách, rồi chọn **Xem hồ sơ / Cập nhật**.
- Hồ sơ gồm: thông tin, ảnh chia theo giai đoạn (**Ban đầu / Diễn biến / Sau khắc phục**) và **Lịch sử cập nhật** (ai làm gì, lúc nào).
- **Cập nhật tình hình**: đổi trạng thái, ghi nội dung, thêm ảnh. Khi chọn "Đã khắc phục", ảnh mới tự xếp vào nhóm "Sau khắc phục".
- Cán bộ quản lý có thêm: đơn vị phụ trách, biện pháp xử lý, thời gian bắt đầu và kết thúc xử lý, ghi chú kiểm tra, tài liệu liên quan; các nút **Xác nhận** và **Kết thúc sự cố**.
- Mỗi sự cố có **một mã duy nhất** (ví dụ `SC-20261015-001`). Mọi lần cập nhật ghi vào cùng hồ sơ đó, không tạo bản ghi mới.

### Ý nghĩa biểu tượng

| Màu | Trạng thái | Cách hiển thị |
|---|---|---|
| 🔴 Đỏ | Đang xảy ra | Nhấp nháy, luôn nằm trên cùng |
| 🟠 Cam | Đã kiểm tra | |
| 🟡 Vàng | Đang xử lý | |
| 🟢 Xanh lá | Đã khắc phục | Nhỏ hơn, không nhấp nháy |
| ⚫ Xám | Đã kết thúc | Ẩn mặc định; chọn bộ lọc "Đã kết thúc" hoặc "Tất cả (cả lịch sử)" để tra cứu |

Ký hiệu theo loại sự cố: 🌊 ngập úng · ⛰️ sạt lở đất · 🏔️ sạt lở taluy · 🌳 cây đổ · 🪨 đất đá tràn mặt đường · 🚧 hư hỏng mặt đường · 🌉 hư hỏng công trình · ⚠️ khác.

### Tra cứu, lọc, báo cáo
- Lọc theo **trạng thái**, **thời gian** (24 giờ, 3, 7 hoặc 30 ngày), **loại sự cố**, **tuyến đường**, **phường/xã**. Bấm một dòng trong danh sách để bản đồ chạy tới vị trí đó.
- **⬇ Xuất danh sách (CSV)**: tải danh sách theo bộ lọc, mở bằng Excel.
- Gửi đường link mở thẳng một sự cố: `…/bandocapnhat/?suco=SC-20261015-001`.
- Danh sách tự làm mới mỗi 60 giây (đổi được trong `su_co_config.js`).
- Dữ liệu gốc xem trực tiếp trong Google Sheet (trang **SuCo** và **LichSu**), có thể tải về dạng Excel.

**Lưu ý:** Bản đồ chỉ hiển thị sự cố do **cán bộ cập nhật từ hiện trường**. Hệ thống **chưa tích hợp** dữ liệu khí tượng hay cảnh báo tự động từ nguồn bên ngoài.

## 5. Giới hạn và lưu ý vận hành
- **Tốc độ:** mỗi lần lưu mất khoảng 2–5 giây, do Apps Script là dịch vụ miễn phí.
- **Hạn mức:** dung lượng ảnh tính vào dung lượng Google Drive của tài khoản (gói miễn phí 15 GB). Mỗi ảnh được nén còn khoảng 0,3–0,6 MB trước khi tải lên.
- **Ảnh công khai:** ảnh được đặt chế độ "Bất kỳ ai có đường link đều xem được" để hiển thị trên bản đồ. Không chụp những nội dung không được phép công khai. Nếu tài khoản Google Workspace của đơn vị chặn chia sẻ công khai, ảnh vẫn được lưu nhưng không hiện trên bản đồ, bấm vào sẽ mở bằng Drive.
- **Bảo mật:** không chia sẻ quyền sửa Google Sheet và Apps Script cho người không có trách nhiệm. Trang NguoiDung chứa mã băm mật khẩu.
- **Đăng nhập:** sai mật khẩu 5 lần thì tài khoản bị khóa tạm 10 phút.
- **Sao lưu:** định kỳ vào Google Sheet chọn **Tệp → Tạo bản sao** hoặc **Tải xuống → Excel**.

## 6. Xử lý sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Bảng sự cố báo "Chưa cấu hình máy chủ dữ liệu" | Chưa điền URL vào `su_co_config.js` (Bước 5), hoặc trình duyệt còn bản cũ: nhấn Ctrl + F5 |
| "Không kết nối được máy chủ dữ liệu" | Kiểm tra mạng. Kiểm tra URL đúng đuôi `/exec`. Kiểm tra lúc triển khai đã chọn "Bất kỳ ai" |
| "Hệ thống chưa được khởi tạo" | Chạy lại hàm `khoiTaoHeThong` trong Apps Script |
| Đăng nhập báo sai dù gõ đúng | Tên đăng nhập không dấu, viết thường. Đặt lại mật khẩu qua menu |
| Ảnh không hiện, chỉ có ô xám | Tài khoản chặn chia sẻ công khai trên Drive (xem mục 5), hoặc ảnh vừa tải cần vài giây để Google tạo ảnh thu nhỏ |
| Không lấy được GPS | Cho phép quyền vị trí cho trình duyệt; bật định vị điện thoại; hoặc chạm lên bản đồ để chọn |
