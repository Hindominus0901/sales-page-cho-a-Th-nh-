-- Ty le hoa hong nam o TUNG SAN PHAM, khong con la mot con so chung.
--
-- Truoc day hoa hong = `affiliates.commission_rate` (mac dinh 0.2) nhan voi
-- tong tien don, bat ke don do ban cai gi. Voi mot san pham duy nhat (ve VIP
-- 399k) thi dung. Voi mot he sinh thai nhieu san pham thi sai: mot khoa vai
-- trieu va mot ve 399k khong the cung mot phan tram.
--
-- `commission_rate` de NULL co y nghia RO RANG: "san pham nay chua duoc dat ty
-- le" -> roi ve `affiliates.commission_rate` nhu cu. Khong dat mac dinh 0.2 o
-- day, vi mot mac dinh dinh tien la thu am tham lam sai: them mot san pham moi
-- ma quen dat ty le thi no tu dong tra 20% cua mot con so co the rat lon, va
-- khong co log nao keu len. NULL bat nguoi ta phai quyet.
--
-- `product_sku` tren `commissions`: tu truoc toi nay bang nay chi ghi tong tien
-- don, khong ghi don do ban gi. Khi moi san pham mot ty le, khong co cot nay
-- thi khong ai doi soat duoc mot khoan hoa hong da tinh dung hay sai.
ALTER TABLE products ADD COLUMN commission_rate REAL;
ALTER TABLE commissions ADD COLUMN product_sku TEXT;
