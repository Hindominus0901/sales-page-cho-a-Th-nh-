-- Cơ chế mặc định. Sửa được trong /admin → Cơ chế.
INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES
  ('coin.per_submission',   '50',    unixepoch()),
  ('coin.per_content',      '20',    unixepoch()),
  ('coin.per_call',         '100',   unixepoch()),
  ('coin.streak_bonus_pct', '10',    unixepoch()),
  ('xp.per_submission',     '100',   unixepoch()),
  ('streak.reset_cycle',    '"daily"', unixepoch());

-- Bậc rank theo XP. Học viên đi trọn 21 ngày (21 × 100 XP) chạm Bạch Kim,
-- khớp với điều kiện học bổng "về đích đúng hạn".
INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES
  ('rank.tiers', '[
    {"name":"Mới bắt đầu","icon":"🌱","minXp":0},
    {"name":"Đều đặn","icon":"🌿","minXp":300},
    {"name":"Bền bỉ","icon":"🌳","minXp":900},
    {"name":"Về đích","icon":"🏅","minXp":1600},
    {"name":"Gương sáng","icon":"👑","minXp":2100}
  ]', unixepoch());

INSERT OR IGNORE INTO rewards (id, name, description, cost_coin, min_rank, stock, is_active, sort_order, created_at, updated_at) VALUES
  ('rw_hook',    'Bộ 100 Hook bản mở rộng',      'Bản đầy đủ kèm ví dụ theo từng ngành nghề.',            300,  0, NULL, 1, 1, unixepoch(), unixepoch()),
  ('rw_review',  'Thành soi kênh riêng 30 phút', 'Buổi gọi riêng, Thành xem kênh và chỉ chỗ cần sửa.',   1200, 2, 10,   1, 2, unixepoch(), unixepoch()),
  ('rw_template','Bộ template kế hoạch content', 'File kế hoạch dùng ngay, có sẵn 3 tháng nội dung.',     500,  1, NULL, 1, 3, unixepoch(), unixepoch()),
  ('rw_coach',   'Coaching 1:1 với Thành 60 phút','Dành cho học viên đi trọn hành trình.',                2500, 3, 5,    1, 4, unixepoch(), unixepoch());
