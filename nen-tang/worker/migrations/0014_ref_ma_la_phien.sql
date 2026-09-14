-- Phien nao da bam vao mot ma gioi thieu khong ton tai.
--
-- Vi sao khong dua vao sessions.landing_url nua: dong `sessions` giu NGUON DAU
-- TIEN (upsertSession dung COALESCE co y). Nguoi da vao trang tu hom truoc, hom
-- nay moi bam link gioi thieu cua ban minh, thi landing_url cua ho van la lan
-- dau - khong con mot chu nao noi rang ho den tu ai.
--
-- Doi chieu that: mot cong tac vien mat 4 luot; tim theo landing_url ra 0 nguoi,
-- tim theo referrer ra 4. Lan sau se khong phai doan nua - o day ghi thang
-- session_id ngay tai luc bam.
CREATE TABLE IF NOT EXISTS ref_ma_la_phien (
  ma          TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (ma, session_id)
);
CREATE INDEX IF NOT EXISTS idx_ref_ma_la_phien_ma ON ref_ma_la_phien(ma);
