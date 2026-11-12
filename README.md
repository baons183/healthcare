# Sổ Sức Khỏe Gia Đình

Ứng dụng web (cài được lên điện thoại như app – PWA) để theo dõi sức khỏe cả gia đình:

- **Tăng trưởng**: chiều cao, cân nặng, BMI, vòng đầu → biểu đồ so với **chuẩn WHO** (P3–P97), z-score, bách phân vị, phân loại suy dinh dưỡng / thấp còi / thừa cân. Người lớn: BMI theo ngưỡng châu Á.
- **Tiêm chủng**: lịch tiêm theo **TCMR Việt Nam** + vắc xin dịch vụ; trạng thái đã tiêm / đến hạn / quá hạn; **chụp ảnh sổ tiêm, phiếu tiêm** lưu trên cloud.
- **Bệnh sử**: mỗi lần ốm/khám: triệu chứng, chẩn đoán, thuốc, nơi khám, ảnh đơn thuốc/xét nghiệm.
- **Khuyến cáo tự động**: đến lúc đo lại, tụt kênh tăng trưởng, sụt cân, mũi tiêm quá hạn, bệnh kéo dài…
- **Phát triển**: mốc vận động (WHO), ngôn ngữ – xã hội (CDC) cho trẻ dưới 6 tuổi, cảnh báo trễ mốc.
- **Ốm & thuốc**: nhật ký sốt có biểu đồ và cảnh báo; thuốc đang dùng với **nhắc giờ uống thuốc**.
- **Khám định kỳ**: khám răng, mắt, tổng quát; người lớn: huyết áp, đường huyết, mỡ máu; **thai kỳ** (tuần thai, lịch khám thai, uốn ván, tăng cân).
- **Thẻ y tế khẩn cấp** + mã QR (xem không cần đăng nhập), ảnh hình nền màn hình khóa; **xuất PDF** hồ sơ cho bác sĩ.
- **Thông báo**: đẩy trên điện thoại + email (tùy chọn). Đăng nhập email, SĐT, **Google**.
- **Chia sẻ**: mời vợ/chồng/ông bà cùng quản lý (quyền sửa hoặc chỉ xem). Xuất dữ liệu JSON để sao lưu.

## Công nghệ (đều miễn phí)

| Thành phần | Dịch vụ | Gói miễn phí |
|---|---|---|
| Frontend + hosting + domain | Next.js 15 trên **Vercel** | domain `ten-app.vercel.app`, HTTPS |
| Database + đăng nhập + lưu ảnh | **Supabase** (PostgreSQL) | 500 MB DB, 1 GB file, 50.000 user |
| Biểu đồ | Recharts | – |
| Dữ liệu chuẩn | WHO Child Growth Standards 2006 + Growth Reference 2007 | – |

> Lưu ý gói free của Supabase: project **tự tạm dừng sau 7 ngày không có truy cập** – chỉ cần vào Dashboard bấm *Restore* (dữ liệu không mất). Dùng thường xuyên thì không bị.

---

## Cài đặt từng bước

### 1. Tạo database trên Supabase
1. Đăng ký tại <https://supabase.com> → **New project** (Region: *Southeast Asia (Singapore)*), đặt mật khẩu DB.
2. Vào **SQL Editor** → **New query** → dán toàn bộ nội dung file [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.
3. Vào **Project Settings → API**, copy `Project URL` và `anon public key`.
4. (Khuyến nghị lúc đầu) **Authentication → Sign In / Providers → Email**: tắt *Confirm email* để đăng ký xong dùng luôn. Bật lại khi mở cho người khác dùng.

5. Chạy tiếp [`supabase/migrations/0002_phone_auth.sql`](supabase/migrations/0002_phone_auth.sql) (đăng nhập/mời bằng số điện thoại).
6. Mã OTP qua email: **Authentication → Emails → Magic Link**, thêm `{{ .Token }}` vào nội dung email.
7. (Tùy chọn) Đăng nhập bằng SĐT: **Authentication → Sign In / Providers → Phone** → bật, chọn Twilio. SMS tính phí theo tin.

8. Chạy tiếp [`0003_deworming.sql`](supabase/migrations/0003_deworming.sql), [`0004_notifications.sql`](supabase/migrations/0004_notifications.sql), [`0005_health_features.sql`](supabase/migrations/0005_health_features.sql).
9. Nhắc giờ uống thuốc: mở [`0006_medication_cron.sql`](supabase/migrations/0006_medication_cron.sql), thay tên miền và `CRON_SECRET`, rồi chạy (cron mỗi 15 phút của Supabase gọi `/api/cron/frequent`).

### Đăng nhập Google (miễn phí)
1. <https://console.cloud.google.com> → tạo project → **APIs & Services → OAuth consent screen** (External, điền tên app, email).
2. **Credentials → Create credentials → OAuth client ID** → *Web application*. *Authorized redirect URIs*: `https://<project>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Sign In / Providers → Google** → bật, dán *Client ID* và *Client Secret*.

### Email nhắc lịch (tùy chọn)
Dùng Gmail: bật xác minh 2 bước → tạo **Mật khẩu ứng dụng** tại <https://myaccount.google.com/apppasswords>. Trên Vercel thêm `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` (địa chỉ Gmail), `SMTP_PASS` (mật khẩu ứng dụng, bật *Sensitive*). Người dùng bật “Gửi thêm qua email” trong Cài đặt → Thông báo.

### Quét sổ tiêm bằng AI
Cần `ANTHROPIC_API_KEY` (tạo tại <https://platform.claude.com> → Settings → API keys). Đặt trong `.env.local` và trên Vercel (bật *Sensitive*, **không** có tiền tố `NEXT_PUBLIC_`). Chi phí ước tính ~0,05–0,1 USD/ảnh.

### 2. Chạy trên máy
```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
# sửa .env.local: điền URL và anon key ở bước 1.3
npm run dev
```
Mở <http://localhost:3000>, đăng ký tài khoản → hệ thống tự tạo "gia đình" cho bạn.

### 3. Đưa lên mạng (Vercel – miễn phí)
1. Đẩy code lên GitHub (repo private cũng được).
2. Vào <https://vercel.com> → đăng nhập bằng GitHub → **Add New → Project** → chọn repo.
3. Ở **Environment Variables** thêm `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` → **Deploy**.
4. Đổi tên miền: Project → **Settings → Domains** → sửa thành ví dụ `sosuckhoe.vercel.app`.
5. Quay lại Supabase → **Authentication → URL Configuration**: đặt *Site URL* = `https://sosuckhoe.vercel.app`, thêm *Redirect URL* `https://sosuckhoe.vercel.app/auth/callback` (để đăng nhập qua email hoạt động).

### 4. Cài lên điện thoại
Mở trang bằng Safari (iPhone) → *Chia sẻ → Thêm vào MH chính*; hoặc Chrome (Android) → *⋮ → Cài đặt ứng dụng*.

---

## Cấu trúc mã nguồn

```
supabase/migrations/0001_init.sql   Schema + RLS (phân quyền theo gia đình) + Storage
scripts/build-who-data.mjs          Tải bảng LMS chính thức của WHO -> src/lib/growth/who-data.json
src/lib/growth/                     z-score, bách phân vị, phân loại WHO
src/lib/vaccines.ts                 Danh mục vắc xin VN + tính lịch tiêm
src/lib/recommendations.ts          Bộ quy tắc khuyến cáo
src/lib/data.ts                     Lớp truy cập dữ liệu (Supabase)
src/components/                     Giao diện (biểu đồ, tab tăng trưởng/tiêm chủng/bệnh sử…)
src/app/                            Các trang (Next.js App Router)
```

## Định hướng thương mại hóa (đã chuẩn bị sẵn)

- **Đa người dùng (multi-tenant)**: mỗi `family` là một tenant, mọi bảng có `family_id` và Row Level Security – dữ liệu các gia đình tách biệt ở tầng database.
- **Gói dịch vụ**: cột `families.plan` (`free` / `pro` / …) để giới hạn tính năng hoặc dung lượng; tích hợp thanh toán (VNPay, MoMo, Stripe) khi cần.
- **Phân quyền**: owner / editor / viewer – mở rộng thành vai trò *bác sĩ*, *phòng khám* dễ dàng.
- **Việc nên làm tiếp**: nhắc lịch tiêm qua email/Zalo/push (Supabase Edge Function + cron), app mobile (React Native/Expo dùng chung Supabase), OCR đọc sổ tiêm từ ảnh, xuất PDF hồ sơ cho bác sĩ, tên miền riêng (.vn / .com ~ 250–500k/năm), chính sách bảo mật theo Nghị định 13/2023 về dữ liệu cá nhân (dữ liệu sức khỏe là *dữ liệu nhạy cảm*).
- Khi có người dùng trả phí, nâng Supabase lên gói Pro ($25/tháng) để có backup hằng ngày và không bị tạm dừng.

> Khuyến cáo trong ứng dụng chỉ mang tính tham khảo dựa trên chuẩn WHO và lịch TCMR, không thay thế chẩn đoán của bác sĩ.
