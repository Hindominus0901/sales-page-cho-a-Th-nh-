-- Trang "Co che hoat dong": bo 23 cong tac GIA, nap 9 cong tac THAT.
--
-- ============ CHUYEN GI DA XAY RA ============
--
-- Bang `app_settings` co HAI cot de nham lan: `id` va `key`. Cac dong nap o
-- 0004_seed.sql co dang:
--
--     ('st-streak-freeze', 'streak_freeze_count', '1', 'number', ...)
--        ^ id                ^ key
--
-- Con worker/src/settings.js:42 tra cuu THEO CO T `key`, va ma nguon doi cac
-- khoa ten 'st-khoa-noi-dung', 'st-tu-duyet', 'st-ngay-chi-diem-danh'... Nhung
-- KHONG MOT DONG NAO co `key` bat dau bang 'st-' - chuoi do chi la `id` cua
-- nhung cai dat khac. Ket qua la hai su that cung ton tai:
--
--   1. 23 dong DA NAP thi KHONG AI DOC. Grep toan bo ma nguon: moi khoa duoi
--      day xuat hien dung 0 lan ngoai chinh file seed. Chi Thanh mo trang "Co
--      che hoat dong", chinh "Hoa hong 20%", "Duyet doi qua: tu dong", "Tru 20%
--      diem khi nop muon", "Bat AI cham bai", bam Luu, doc "Da luu cau hinh" -
--      va he thong chay y het nhu cu. Hai khoi con lai cua trang do (Luat cong
--      diem, Cap bac) thi THAT, nen khong co cach nao nhin ra o nao that o nao
--      gia.
--
--   2. 9 khoa DUOC DOC thi KHONG CO DONG NAO. Chung vinh vien chua duoc dat,
--      va vi readSettings tra ve "khong co khoa" chu khong nem loi nen khong
--      cho nao bao dong.
--
-- ============ HAU QUA NANG NHAT ============
--
-- `st-ngay-chi-diem-danh` khong chi la mot tuy chon hien thi. No la MAU SO
-- quyet dinh ai "hoan thanh thu thach" (worker/src/functions/index.js:631):
--
--     tongNgay = so ngay cua thu thach TRU nhung ngay mien nop
--     if (tongNgay > 0 && done >= tongNgay) -> completed = 1, tra thuong
--
-- Danh sach mien nop rong -> buoi Kick-Off (ngay 0, khong ai nop duoc gi) van
-- nam trong mau so -> dieu kien khong bao gio dung -> KHONG AI HOAN THANH, va
-- phan thuong hoan thanh khong bao gio tra. Dung sai so ma chu thich ngay tren
-- doan ma do mo ta: "262 nguoi tham gia, 0 nguoi hoan thanh".
--
-- Ban va cho chuyen do DA DUOC VIET, nhung no chet lang vi cai dat khong doc
-- duoc. tests/platform.mjs tu INSERT dong do roi moi kiem, nen bo test xanh
-- trong khi ban that khong co dong nao.
--
-- ============ VI SAO XOA CHU KHONG NOI 23 O KIA VAO ============
--
-- Phan lon chung TRUNG VAI voi mot nguon su that da co:
--   affiliate_commission_pct  <- da co products.commission_rate + affiliates.commission_rate
--   lb_visible_top            <- da co cau hinh cuoc thi (rewards.CONTEST.top)
--   ai_pass_score             <- da co nguong 60 trong scoreChallengeDay
--   affiliate_cookie_days     <- da co cfg.affiliate.cookieDays tu bien moi truong
--
-- Noi chung vao la tao NGUON SU THAT THU BA cho cung mot con so: nguoi van hanh
-- doi mot cho, he thong doc cho khac, va khong ai hieu vi sao khong co gi thay
-- doi. Do dung la loai loi da mat ca dot nay de don. Can them o nao thi them
-- tung cai, moi cai mot lan sua kem bai test - khong nap san mot bang cong tac
-- roi hy vong ai do noi day sau.

-- ============ VI SAO NAP O MIGRATION MA KHONG PHAI brand:seed ============
--
-- CLAUDE.md co luat "migration chi co cau truc, noi dung do brand:seed nap".
-- Luat do nham vao NOI DUNG THUONG HIEU: scripts/brand/seed.mjs nap courses,
-- lessons, products, users - nhung thu quan tri vien sua trong trang quan tri
-- va migration chay lai se de mat.
--
-- `app_settings` khong nam trong seed.mjs, va ca ba migration da co (0004, 0005,
-- 0008) deu nap cai dat theo duong nay. Day la cong tac van hanh cua HE THONG,
-- khong phai noi dung cua khach.
--
-- Dung INSERT OR IGNORE chu khong phai INSERT OR REPLACE: chay lai migration
-- KHONG duoc de len gia tri chi Thanh da chinh. Do chinh la moi lo ma luat tren
-- canh bao.

-- 1. Bo cac dong khong ai doc.
DELETE FROM app_settings WHERE key IN (
  'streak_freeze_count', 'streak_reset_on_miss',
  'lb_reset', 'lb_tiebreak', 'lb_visible_top',
  'reward_approval', 'reward_rank_gate', 'reward_stock_alert',
  'course_sequential', 'course_require_submit', 'course_cert_min_pct',
  'challenge_day_gate', 'challenge_allow_catchup',
  'challenge_late_penalty_pct', 'challenge_max_catchup_days',
  'affiliate_commission_pct', 'affiliate_min_payout', 'affiliate_cookie_days',
  'coin_exchange_rate',
  'reminder_hour', 'reminder_channel',
  'ai_grading_enabled', 'ai_pass_score'
);

-- 2. Nap 9 khoa ma ma nguon THUC SU doc.
--
-- Gia tri mac dinh o day phai TRUNG KHOP voi gia tri he thong dang chay hom
-- nay, khong duoc "nhan tien sua cho dep". Nap mot migration ma doi hanh vi
-- cua mot lop dang hoc giua chung la mot kieu hong khac.
--
--   st-khoa-noi-dung            false  = cong dang MO (daDangKyChuongTrinh:337
--                                        tra true khi khoa nay khong phai true)
--   st-tu-duyet*                true   = dang bat (index.js:513 coi `!== false`)
--   cac danh sach ngay           []    = dang rong
--   st-tran-diem-hoat-dong-moi-ngay 40 = DUNG hang so TRAN_DIEM_HOAT_DONG
--                                        (functions/index.js:48) ma he thong
--                                        dang dung. Lan dau viet migration nay
--                                        toi nap 0 va TU NGHI 0 nghia la
--                                        "khong gioi han" - ma nguon KHONG co
--                                        nghia do: index.js:228 lay thang so do
--                                        lam tran, nen tran = 0 lam MOI hoat
--                                        dong ngung cong diem. Sau bai test do
--                                        ngay. Dung cai bay ma dong ghi chu
--                                        ngay tren canh bao.
--
-- Rieng `st-ngay-chi-diem-danh` mac dinh [0]: buoi Kick-Off la ngay 0 va khong
-- ai nop duoc gi o do - day la ly do ca khoa nay ton tai. De [] thi migration
-- nay khong sua duoc gi ca, chi doi mot loi im lang thanh mot o nhap trong.
INSERT OR IGNORE INTO app_settings
  (id, key, value, type, options_json, category, label, description, sort_order,
   created_date, updated_date)
VALUES
  ('st-khoa-noi-dung', 'st-khoa-noi-dung', 'false', 'bool', NULL, 'loc-nguoi',
   'Chỉ cho người đã đăng ký vào học',
   'Bật: ai chưa từng điền form đăng ký và chưa được mở quyền sẽ không vào được lớp, thử thách, đổi quà. Tắt: ai đăng nhập được là học được. Bật lên có thể khoá nhầm học viên thật đăng nhập bằng email khác với email đã điền form.',
   1, datetime('now'), datetime('now')),

  ('st-tu-duyet', 'st-tu-duyet', 'true', 'bool', NULL, 'challenge',
   'Tự động duyệt bài nộp',
   'Bật: nộp đủ link là hệ thống ghi nhận ngay, không cần ai chấm. Tắt: mọi bài nằm chờ admin duyệt tay.',
   10, datetime('now'), datetime('now')),

  ('st-tu-duyet-link', 'st-tu-duyet-link', 'true', 'bool', NULL, 'challenge',
   'Bắt buộc link bài tập',
   'Bật: thiếu link bài tập (Drive/Notion) thì bài không được tự duyệt. Bài vẫn được lưu và admin vẫn duyệt tay được.',
   11, datetime('now'), datetime('now')),

  ('st-tu-duyet-cam-nhan', 'st-tu-duyet-cam-nhan', 'true', 'bool', NULL, 'challenge',
   'Bắt buộc link bài cảm nhận',
   'Bật: thiếu link bài cảm nhận trên nhóm Facebook thì bài không được tự duyệt.',
   12, datetime('now'), datetime('now')),

  ('st-ngay-chi-diem-danh', 'st-ngay-chi-diem-danh', '[0]', 'json', NULL, 'challenge',
   'Những ngày chỉ cần điểm danh',
   'Danh sách số ngày không có bài tập lẫn bài cảm nhận — buổi Kick-Off là ngày 0. QUAN TRỌNG: những ngày này bị trừ khỏi mẫu số tính "hoàn thành thử thách", nên điền sai là học viên không bao giờ nhận được phần thưởng hoàn thành.',
   13, datetime('now'), datetime('now')),

  ('st-ngay-khong-bai-tap', 'st-ngay-khong-bai-tap', '[]', 'json', NULL, 'challenge',
   'Những ngày không có bài tập (vẫn cần cảm nhận)',
   'Khác với ô trên: ngày ở đây vẫn đòi link bài cảm nhận, chỉ bỏ link bài tập.',
   14, datetime('now'), datetime('now')),

  ('st-khoa-doi-nhom', 'st-khoa-doi-nhom', 'false', 'bool', NULL, 'challenge',
   'Chốt nhóm, không cho đổi nữa',
   'Bật khi cuộc thi đua nhóm đã bắt đầu — học viên không tự chuyển sang nhóm đang dẫn đầu được nữa.',
   15, datetime('now'), datetime('now')),

  ('st-hoat-dong-khong-cong-diem', 'st-hoat-dong-khong-cong-diem', '[]', 'json', NULL, 'diem',
   'Loại hoạt động không cộng điểm',
   'Danh sách mã loại hoạt động vẫn được ghi nhận nhưng không ra XP/xu. Để trống là mọi loại đều cộng điểm bình thường.',
   20, datetime('now'), datetime('now')),

  ('st-tran-diem-hoat-dong-moi-ngay', 'st-tran-diem-hoat-dong-moi-ngay', '40', 'number', NULL, 'diem',
   'Trần XP mỗi học viên kiếm được mỗi ngày',
   'Tính trên các hoạt động học viên tự ghi nhận (đăng bài, gọi khách, nộp bài tập). Đây là thứ chặn đường cày điểm: không có trần thì một người khai 10 hoạt động trong một buổi tối là hơn cả tuần đi học của người khác. Đặt 0 để bỏ trần hoàn toàn.',
   21, datetime('now'), datetime('now'));
