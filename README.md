# Kh-i-nghi-p-DMST

## CA ĐÊM — Prototype kinh dị point-and-click

Prototype chạy trực tiếp trong trình duyệt, không cần engine, build step hay thư viện ngoài.

## Chạy thử

Mở `index.html` trong trình duyệt hiện đại. Nếu trình duyệt chặn tính năng cảm biến khi mở file trực tiếp, chạy bằng một HTTP server tĩnh trong thư mục này, ví dụ:

```powershell
python -m http.server 8000
```

Sau đó mở `http://localhost:8000`.

## Vòng lặp chơi

1. Bật NV bằng nút trên màn hình hoặc phím `N`. NV tiêu hao pin; tìm pin dự phòng trong kho vật tư hoặc phòng trực.
2. Đi qua các hotspot ở cuối màn hình, thu thập 3 cầu chì. Vật phẩm phát sáng khi NV đang bật.
3. Nếu thấy sinh vật trong phòng, lắc đèn pin 4 lần nhanh để làm choáng và buộc nó rút lui. Trên máy tính dùng `Space`, nút **Lắc đèn**, hoặc kéo chuột qua lại; trên điện thoại lắc thiết bị.
4. Lắp cầu chì tại phòng máy, rồi đi đến cửa thoát hiểm.

Sinh vật tuần tra giữa các node. Khi nó ở cùng phòng và được nhìn thấy bằng NV, người chơi có 3 giây để phản ứng trước khi thua.

## Điều khiển

- `N`: bật/tắt thị lực đêm.
- `Space` / nút **Lắc đèn**: một nhịp lắc; cần 4 nhịp trong khoảng một giây.
- Kéo chuột hoặc vuốt: nhìn quanh.
- Các nút mũi tên ở thanh dưới: di chuyển giữa các node liền kề.

Đây là greybox cơ chế, chưa có asset, hoạt ảnh, âm thanh sản xuất hay hiệu chỉnh độ khó. Trình duyệt có thể yêu cầu thao tác người dùng trước khi khởi tạo âm thanh.

Các thông số để tune nhanh nằm ở đầu `game.js` trong đối tượng `tuning` (mức hao pin, số nhịp lắc, cửa sổ lắc, thời gian cảnh báo/choáng và nhịp tuần tra).
