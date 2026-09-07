-- Coin mỗi bài 50 → 70.
--
-- Với 50, đi trọn 21 ngày HOÀN HẢO chỉ được 1.825 coin, trong khi phần quà lớn
-- nhất — "Coaching 1:1 với Thành 60 phút" — giá 2.500. Mô tả của chính món đó
-- ghi "Dành cho học viên đi trọn hành trình", mà người đi trọn hành trình vẫn
-- thiếu 675 coin. Trang bán hàng thì hứa "về đích đúng hạn → học bổng + một
-- buổi coaching riêng". Không ai từng với tới được nó.
--
-- Với 70:
--   đi trọn 21 ngày hoàn hảo   = 2.555 coin  → đủ Coaching, dư 55
--   đi 18/21, đứt chuỗi 2 lần  = 1.582 coin  → đủ Soi kênh, KHÔNG đủ Coaching
--
-- Tính chất thứ hai mới là điều đáng giữ: Coaching thành phần thưởng thật sự
-- chỉ dành cho người đi trọn, đúng như nó tự mô tả.
--
-- XP không đổi: 21 × 100 = 2.100, chạm đúng mốc bậc cao nhất. Chỗ đó vốn đã cân.
UPDATE settings SET value_json = '70', updated_at = unixepoch()
WHERE key = 'coin.per_submission';
