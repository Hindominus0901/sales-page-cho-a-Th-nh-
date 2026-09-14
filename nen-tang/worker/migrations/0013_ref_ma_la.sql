-- Ma gioi thieu KHONG TON TAI ma van co nguoi bam vao.
--
-- Truoc day POST /api/ref gap ma la thi tra ve { valid: false } roi thoi: khong
-- log, khong dem, khong ai biet. Thuc te no xay ra that - hoc vien con giu link
-- cua he thong cu (/join?ref=IRV2X62R) va van dang di rai. Nguoi bam vao van
-- dang ky binh thuong, nen nhin tu ngoai moi thu deu on; chi co nguoi gioi thieu
-- la mat luot, va mat trong im lang.
--
-- Bang nay chi de DEM va HIEN RA cho quan tri vien. Moi ma la mot dong, nen no
-- khong the phinh to du endpoint la cong khai.
CREATE TABLE IF NOT EXISTS ref_ma_la (
  ma          TEXT PRIMARY KEY,
  so_lan      INTEGER NOT NULL DEFAULT 0,
  landing_url TEXT,
  gan_cho     TEXT,              -- ma affiliate da duoc gan bu, NULL = chua xu ly
  gan_luc     TEXT,
  lan_dau     TEXT NOT NULL,
  lan_cuoi    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ref_ma_la_cuoi ON ref_ma_la(lan_cuoi DESC);
