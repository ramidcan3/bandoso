# Bản đồ Đà Nẵng: lớp điểm nguy hiểm mùa mưa bão (PCTT)

Bản cập nhật tháng 10/2026. Bổ sung dữ liệu từ file KMZ **"Bão Lũ 29.09.2026 Theo Tuyến.kmz"** vào hệ thống bản đồ Leaflet đang có. Các lớp ranh giới phường/xã, đường QL-ĐT, mốc ĐT.609 và các nút chức năng cũ được giữ nguyên.

## 1. Cấu trúc thư mục

| File | Trạng thái | Nội dung |
|---|---|---|
| `index.html` | **Đã sửa** | Giao diện bản đồ. Thêm lớp PCTT, bảng tra cứu, chú giải, xuất CSV. Lớp nền Google chuyển sang https |
| `PCTT_BaoLu.geojson` | **Mới** | 398 đối tượng chuyển từ KMZ (chi tiết ở mục 5) |
| `cong_cu/kmz2geojson.py` | **Mới** | Công cụ chuyển KMZ sang GeoJSON, dùng mỗi khi có KMZ mới |
| `README.md` | **Mới** | Tài liệu này |
| `map.geojson` | Giữ nguyên | Ranh giới 93 phường/xã |
| `DT.geojson` | Giữ nguyên | 46 tuyến QL, ĐT |
| `DT 609.geojson` | Giữ nguyên | Mốc lý trình ĐT.609 |

## 2. Chạy thử trên máy

Trình duyệt chặn `fetch()` khi mở file trực tiếp (file://), nên phải chạy qua một máy chủ web cục bộ:

```bash
cd <thư mục dự án>
python -m http.server 8000
```

Sau đó mở `http://localhost:8000/` trên trình duyệt.

## 3. Triển khai lên GitHub Pages

1. Vào kho GitHub, chọn **Add file → Upload files**.
2. Kéo thả các file `index.html`, `PCTT_BaoLu.geojson`, `README.md` và thư mục `cong_cu/`, rồi bấm **Commit changes**.
3. Nếu kho chưa bật Pages: vào **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
4. Chờ 1–3 phút rồi mở `https://<tài-khoản>.github.io/<tên-kho>/`.

Có thể dùng đường dẫn mở sẵn một tuyến hoặc một điểm, ví dụ để in mã QR kèm báo cáo:

- `.../?tuyen=ĐT.603B`: lọc và phóng tới tuyến ĐT.603B
- `.../?tuyen=ĐT.603B&ma=DT603B-NH03`: mở thẳng điểm ngập Km7+200–Km7+300
- `.../?loai=Ngập nước`: chỉ hiện các điểm, đoạn ngập nước

## 4. Kiểm tra sau khi triển khai

- [ ] Bản đồ nền và ranh giới phường/xã hiện bình thường. Ô "Chọn tên đường" vẫn hoạt động.
- [ ] Bảng "⚠ Điểm nguy hiểm mùa mưa bão" (góc trái) báo **101 điểm/đoạn · 52 ngập nước · 42 nguy cơ cao**.
- [ ] Chọn tuyến `ĐT.603B (3)`: hiện 3 điểm Km3+120, Km5+050, Km7+200–Km7+300.
- [ ] Bấm vào một điểm: popup có đủ 4 nhóm thông tin (hiện trạng, phương án ứng phó, giải pháp đề xuất, kết quả xác nhận).
- [ ] Nút "Chọn loại bản đồ" có thêm 5 lớp chồng, tắt/bật được.
- [ ] Nút "Tải danh mục (CSV)" tải được file và mở được bằng Excel.
- [ ] Trên điện thoại, bảng tra cứu tự thu gọn; bấm tiêu đề để mở.

## 5. Cấu trúc dữ liệu `PCTT_BaoLu.geojson`

Trường `nhom` phân loại đối tượng:

| nhom | Số lượng | Ý nghĩa |
|---|---|---|
| `nguy_hiem` | 101 | Điểm hoặc đoạn nguy hiểm có bảng mô tả (98 điểm, 3 đoạn) |
| `doan_nguy_hiem` | 47 | Đường vẽ phạm vi đoạn nguy hiểm, liên kết với điểm qua `ma_diem` |
| `tuyen_tranh` | 100 | Tuyến tránh, phân luồng (44 đường, 56 điểm ghi chú) |
| `tap_ket` | 24 | Điểm tập kết vật tư, thiết bị |
| `coc_h` | 126 | Cọc H hiện trạng thực tế và điểm tham chiếu |

Thuộc tính của điểm nguy hiểm (`nhom = nguy_hiem`):

- `ma`: mã điểm, dạng `<TUYẾN>-NH<số thứ tự>`, ví dụ `DT603B-NH01`.
- `tuyen`, `ten`, `ly_trinh`, `phan_loai`, `danh_gia_nguy_co`, `dia_phuong`: dùng cho lọc và danh sách.
- `thong_tin`: **giữ nguyên văn** bảng mô tả trong KMZ.
- `giai_phap_de_xuat`, `ket_qua_xac_nhan`, `ho_so_lien_quan`, `ngay_cap_nhat`: **để trống**. Chỉ điền khi có hồ sơ chứng minh (biên bản khảo sát, phương án được duyệt, biên bản nghiệm thu…). Khi các trường này trống, popup hiện "Chưa có dữ liệu".

## 6. Cập nhật dữ liệu

**Cách 1: khi có KMZ mới.** Giữ đúng cấu trúc thư mục trong Google Earth (Tuyến → Điểm nguy hiểm / Điểm tập kết / Tuyến tránh), sau đó chạy:

```bash
pip install lxml
KMZ_LABEL="Tên file KMZ.kmz" python cong_cu/kmz2geojson.py "duong_dan/file.kmz" PCTT_BaoLu.geojson DT.geojson
```

Công cụ in ra báo cáo đối soát: số đối tượng, đoạn chưa khớp điểm, tuyến chính lệch so với `DT.geojson`.
⚠ Chạy lại công cụ sẽ ghi đè các trường `giai_phap_de_xuat`, `ket_qua_xac_nhan`… Nếu đã điền các trường này, hãy sao lưu file cũ trước khi chạy.

**Cách 2: bổ sung giải pháp hoặc kết quả cho từng điểm.** Mở `PCTT_BaoLu.geojson` bằng trình soạn thảo (VS Code, Notepad++) hoặc geojson.io, tìm theo mã điểm, điền nội dung, ví dụ:

```json
"giai_phap_de_xuat": "…(trích phương án/văn bản số …)",
"ho_so_lien_quan": "Biên bản khảo sát ngày …",
"ngay_cap_nhat": "dd/mm/yyyy"
```

Sau đó tải file lên GitHub như mục 3.

## 7. Ghi chú kỹ thuật

- Thư viện: Leaflet 1.9.4 (unpkg CDN). Lớp nền: Google (Vệ tinh, Giao thông, Địa hình). Hệ tọa độ: WGS84.
- Các lớp PCTT nằm trong pane riêng (z-index 420/450), không bị lớp đường đè khi rê chuột.
- Mục "Ghi chú vị trí" trong KMZ là chú giải, không phải dữ liệu, nên không đưa lên bản đồ.
- Tuyến chính QL, ĐT (kể cả Tuyến tránh Tiên Kỳ) trong KMZ không nhập lại vì `DT.geojson` đã có. Kết quả đối chiếu 29 tuyến: trùng khớp, trừ ĐT.606 (KMZ 3.067 đỉnh, `DT.geojson` 3.024 đỉnh) và QL.14B ở mục chính của KMZ (KMZ 1.243 đỉnh, `DT.geojson` 1.256 đỉnh; bản QL.14B trong mục "Cọc H" của KMZ thì trùng khớp). Cần xác định bản nào là bản đúng.
