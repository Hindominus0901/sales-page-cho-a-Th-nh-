-- Thi dua theo nhom: nhom co tran nguoi, diem danh theo khung gio,
-- va qua tang tra link ngay.
--
-- Ba nhom cot, ba viec khac nhau, gom vao mot migration vi chung cung phuc vu
-- mot dot thay doi luat choi.

-- ---------------------------------------------------------------- nhom 1-5
-- Tran so nguoi moi nhom. 0 = khong gioi han (giu nguyen hanh vi cu cho nhung
-- doi da tao truoc do). Hoc vien tu chon nhom; day roi thi nhom do mo di.
ALTER TABLE teams ADD COLUMN capacity INTEGER NOT NULL DEFAULT 0;

-- ------------------------------------------------------- diem danh theo gio
-- Khung gio diem danh tinh bang PHUT so voi `starts_at`, khong phai gio tuyet
-- doi: chi Thanh doi lich buoi hoc thi khung gio tu troi theo, khong phai sua
-- lai tay tung buoi.
--
-- Mac dinh 0..15 = "mo dung gio bat dau, khoa sau 15 phut" - dung nguyen van
-- yeu cau "9:00-9:15, sau 9:15 khoa diem danh".
ALTER TABLE calendar_events ADD COLUMN checkin_open_min INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calendar_events ADD COLUMN checkin_close_min INTEGER NOT NULL DEFAULT 15;

-- ------------------------------------------------------------- qua tang
-- Qua co `delivery_url` (thuong la link Notion) duoc giao NGAY khi doi, khong
-- qua hang doi duyet. Qua khong co link van giu duong cu de admin gui tay.
ALTER TABLE rewards ADD COLUMN delivery_url TEXT;
ALTER TABLE rewards ADD COLUMN delivery_note TEXT;

-- Chep link sang tung don doi qua thay vi doc nguoc ve `rewards`: neu chi Thanh
-- doi link cua mot mon qua sau nay, nguoi da doi truoc do van giu duoc dung
-- thu ho da nhan.
ALTER TABLE redemptions ADD COLUMN delivery_url TEXT;

-- ---------------------------------------------------------------- 5 nhom
-- Tao san 5 nhom de hoc vien co cai ma chon ngay. Ten dat theo dung cach chi
-- Thanh danh so: 1-2-3-4-5.
INSERT OR IGNORE INTO teams (id, name, description, color, capacity, created_date, updated_date)
VALUES
  ('team-1', 'Nhóm 1', '', '#888888', 0, datetime('now'), datetime('now')),
  ('team-2', 'Nhóm 2', '', '#f4b400', 0, datetime('now'), datetime('now')),
  ('team-3', 'Nhóm 3', '', '#12a05e', 0, datetime('now'), datetime('now')),
  ('team-4', 'Nhóm 4', '', '#4285f4', 0, datetime('now'), datetime('now')),
  ('team-5', 'Nhóm 5', '', '#9c27b0', 0, datetime('now'), datetime('now'));
