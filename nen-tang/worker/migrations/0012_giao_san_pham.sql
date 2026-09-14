-- Giao hang cho san pham cua gian hang.
--
-- Truoc day mot san pham chi giao duoc bang cach mo khoa hoc (`grants_json`).
-- Nhung phan lon thu chi Thanh ban khong phai khoa hoc tren nen tang: la mot
-- trang Notion, mot thu muc Drive, hoac chi don gian la mot cho ngoi trong
-- nhom Zalo rieng. Khong co cho nao dien nhung thu do, nen mua xong nguoi ta
-- KHONG NHAN DUOC GI ma he thong cung khong bao loi - dung tinh trang cua
-- "Bo Skill Content AI" 999.000d dang bay ban.
--
-- `zalo_group_url` tach rieng khoi `delivery_url` co chu dich: moi san pham co
-- mot nhom ho tro rieng, va nhom do dung o HAI thoi diem khac nhau - luc gui
-- bill nho xac nhan (truoc khi tien ve) va luc da mua xong (cho hoi han).
-- Gop chung mot cot thi mot trong hai cho se tro toi nham noi.
ALTER TABLE products ADD COLUMN delivery_url TEXT;
ALTER TABLE products ADD COLUMN delivery_note TEXT;
ALTER TABLE products ADD COLUMN zalo_group_url TEXT;
