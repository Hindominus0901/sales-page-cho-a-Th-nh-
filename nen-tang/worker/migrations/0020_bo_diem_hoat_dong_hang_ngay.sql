-- Tat diem cho "hoat dong hang ngay" tu ghi nhan.
--
-- ============ QUYET DINH CUA NGUOI VAN HANH, KHONG PHAI CUA MA NGUON ============
--
-- Chi Thanh chot: diem chi tinh cho viec THAM GIA LOP va THU THACH, khong tinh
-- cho hoat dong hang ngay nguoi hoc tu khai (dang bai, goi khach...).
--
-- Luat `activity_approved` (20 XP + 10 xu moi luot duoc duyet) chinh la co che
-- do. Truoc lan nay no la nguon diem LON NHAT ma khong dinh gi toi noi dung
-- chuong trinh: chu thich o functions/index.js:36 ghi lai mot su co that - hai
-- nguoi dung dau co 330 va 265 diem trong khi nguoi thu tu co 110, va TOAN BO
-- khoang cach den tu muc hoat dong. Ho khong gian lan, nhung thang diem cho
-- hoat dong an dut phan con lai cua chuong trinh.
--
-- ============ TAT CHU KHONG XOA ============
--
-- Dat `is_active = 0` chu khong DELETE dong luat:
--
--   1. award.js:25 loc `WHERE event_key = ? AND is_active = 1`, nen tat la du -
--      day la cong tac THAT, khong phai mot o hien thi (da doi chieu ma nguon).
--   2. Xoa dong la trang /admin -> Co che mat luon o do, va chi Thanh khong con
--      duong nao bat lai neu doi y. Tat thi o van nam do, cong tac van bam duoc.
--   3. Nhung dong `point_awards` da cong truoc day KHONG bi dung toi. Rut diem
--      da trao cua mot lop dang hoc giua chung la mot chuyen khac han, va no
--      phai la quyet dinh rieng cua nguoi van hanh chu khong phai tac dung phu
--      cua mot lan chay migration.
--
-- HOAT DONG VAN DUOC GHI NHAN VA VAN DUYET NHU CU - chi khong ra XP/xu nua.
-- Cac cot dem `content_count`, `call_count`, `assignment_count` tren `users`
-- khong doi, nen cac bang xep hang theo so luot van chay.
--
-- ============ HAI LUAT CON LAI DE NGUYEN, CO Y ============
--
-- `post_created` (10 XP) va `comment_created` (3 XP) la diem cho cong dong
-- trong app, khong phai "hoat dong hang ngay tu khai". Chung nam ngoai cau chi
-- Thanh noi, nen migration nay KHONG dung toi. Neu muon tat not thi tat trong
-- /admin -> Co che, khong can deploy lai.

UPDATE point_rules
   SET is_active = 0,
       updated_date = datetime('now')
 WHERE event_key = 'activity_approved';
