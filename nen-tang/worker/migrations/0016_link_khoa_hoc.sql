-- Link ban ghi va tai lieu cua CA KHOA HOC.
--
-- Bai giang (`lessons`) da co `doc_url` va video, nhung video o do luu theo
-- nha cung cap + ma video (youtube/wistia/vimeo/stream). Mot ban ghi Zoom
-- KHONG vua khuon do: no la mot duong dan dai co token, khong co "ma video".
-- Nen tu truoc toi nay khong co cho nao dan link ban ghi buoi hoc vao khoa.
--
-- Hai cot nay o cap KHOA chu khong phai cap bai, vi do la cach chi Thanh nghi
-- ve no: "khoa nay co link record va link tai lieu".
--
-- CA HAI DEU LA NOI DUNG PHAI TRA TIEN. Bang `courses` doc cong khai (danh sach
-- khoa phai hien ten va anh cho moi nguoi), nen hai cot nay duoc khai
-- `gatedFields` trong entities/schema.js - khong che thi mot lenh GET la lay
-- duoc ban ghi cua khoa VIP ma khong tra dong nao.
ALTER TABLE courses ADD COLUMN recording_url TEXT;
ALTER TABLE courses ADD COLUMN doc_url TEXT;
