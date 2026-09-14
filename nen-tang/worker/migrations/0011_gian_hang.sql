-- Gian hang trong khu vuc thanh vien.
--
-- Bang `products` da co tu 0003 nhung gan nhu la bang chet: chi duoc doc o dung
-- mot cho (commerce/fulfil.js, de biet mot don mo khoa nhung gi), khong co man
-- hinh nao them sua, va khong co gi de hien mot the san pham cho ra hon.
--
-- Ba cot duoi cho phep no dong vai mot mat hang that: co anh, co loi gioi thieu
-- ngan, va sap xep duoc thu tu tren ke.
ALTER TABLE products ADD COLUMN description TEXT;
ALTER TABLE products ADD COLUMN image_url TEXT;
ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
