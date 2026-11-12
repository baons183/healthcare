-- =====================================================================
-- 0006: Gọi /api/cron/frequent mỗi 15 phút để nhắc giờ uống thuốc.
-- (Vercel gói miễn phí chỉ cho cron 1 lần/ngày, nên dùng pg_cron của Supabase.)
--
-- TRƯỚC KHI CHẠY: thay 2 chỗ
--   1) https://healthcare-nine-iota.vercel.app  -> tên miền app của bạn
--   2) THAY_BANG_CRON_SECRET                    -> giá trị CRON_SECRET (giống trên Vercel)
-- Nếu báo lỗi extension: Database > Extensions > bật "pg_cron" và "pg_net", rồi chạy lại.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Xóa lịch cũ (nếu chạy lại)
select cron.unschedule(jobid) from cron.job where jobname = 'healthcare-frequent';

select cron.schedule(
  'healthcare-frequent',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://healthcare-nine-iota.vercel.app/api/cron/frequent',
    headers := jsonb_build_object('Authorization', 'Bearer THAY_BANG_CRON_SECRET'),
    timeout_milliseconds := 30000
  );
  $$
);

-- Kiểm tra: select * from cron.job_run_details order by start_time desc limit 5;
-- Tắt:      select cron.unschedule('healthcare-frequent');
