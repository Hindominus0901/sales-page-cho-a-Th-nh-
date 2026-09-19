-- Suc chua theo khoa: lam cho loi hua "toi da 30 cho" tro thanh su that.
--
-- ============ VI SAO CO MIGRATION NAY ============
--
-- apps/funnel-gc/site.config.json co mot cau tra loi FAQ:
--
--     "Lop co bao nhieu nguoi?"
--     "Toi da 30 cho moi khoa, de Thanh va team con doc va sua duoc tung bai."
--
-- Grep toan bo apps/ brand/ worker/: day la CHO DUY NHAT noi con so do, va
-- KHONG CO GI dem cho. `createOrder` (worker/src/routes/orders.js:68) chi co
-- cua chan so lan goi, cau hinh thanh toan, lead, va gia - khong mot cua nao
-- ve suc chua. Nguoi thu 31 dat don binh thuong.
--
-- Mot cau khan hiem ma he thong khong giu duoc la loi hua sai voi nguoi tra
-- 2 trieu. Va no con hai nguoc lai: neu lop THAT SU chi nhan 30 nguoi thi ban
-- qua so la nhan tien cua nguoi minh khong phuc vu duoc.
--
-- ============ MOC "MO KHOA MOI" - DUNG BO ============
--
-- `cohort_start_at` khong phai trang tri. Thieu no thi bo dem cong don ca lich
-- su, va mo ban khoa 2 la trang bao "het cho" NGAY HOM DAU vi 30 don cua khoa
-- 1 da an het cho cua khoa 2.
--
-- Day khong phai lo xa: ung dung con lai trong chinh repo nay
-- (goc-creator-challenge) da va phai dung cai bay do va giai bang dung cach
-- nay - xem chu thich o src/routes/public.ts:30. Dung lai hinh dang da va vao
-- thuc te, khong nghi moi.
--
-- ============ VI SAO MAC DINH LA KHONG GIOI HAN ============
--
-- Ca ba cot deu cho NULL, va `seats_total` NULL nghia la KHONG CHAN GI. He
-- thong chay y het hom nay cho toi khi quan tri vien tu dat con so trong
-- /admin -> San pham.
--
-- Nap san 30 o day la doi hanh vi BAN HANG cua mot lop dang chay giua chung,
-- tu mot lan chay migration ma khong ai bam nut. Neu lop hien tai da ban qua
-- 30 cho thi migration nay se dong ngay cong thanh toan. Dung loai hong ma
-- migration 0018 vua canh bao: mot gia tri mac dinh "cho dep" lam doi hanh vi
-- that.

ALTER TABLE products ADD COLUMN seats_total INTEGER;
-- So cho da ban NGOAI he thong (ban tay, chuyen khoan truc tiep, ve moi). Cong
-- vao so da dem de tran van dung. NULL/0 = khong co ai ngoai he thong.
ALTER TABLE products ADD COLUMN seats_offset INTEGER NOT NULL DEFAULT 0;
-- Moc bat dau khoa hien tai (ISO). Chi dem don co paid_at >= moc nay.
-- NULL = dem tu dau (dung cho khoa dau tien).
ALTER TABLE products ADD COLUMN cohort_start_at TEXT;

-- Duong dem loc theo CA product_sku, status LAN paid_at. Loc theo sku la bat
-- buoc: gian hang trong khu vuc thanh vien ban nhieu mon, dem tat ca don thi
-- mot nguoi mua goi qua 50.000d cung an mot cho cua lop 21 ngay.
CREATE INDEX IF NOT EXISTS idx_orders_sku_paid ON orders(product_sku, status, paid_at);
