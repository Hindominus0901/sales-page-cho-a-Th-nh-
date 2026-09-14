-- Du lieu khoi tao: cap bac, loai hoat dong, luat tinh diem, cau hinh chung.
--
-- Dung "INSERT OR IGNORE" nen chay lai khong ghi de nhung gi admin da sua.
-- Moc XP lay theo ban Admin Portal (0/500/1500/3500/7000) vi chinh trong trang
-- do admin sua duoc con so nay - hai ban thiet ke ghi hai bo khac nhau.

INSERT OR IGNORE INTO levels (id, level_number, name, threshold_xp, icon, perk, is_active, created_date, updated_date) VALUES
 ('lvl-1', 1, 'Đồng',      0,    '🥉', 'Tham gia cộng đồng, nhận nhiệm vụ hằng ngày', 1, datetime('now'), datetime('now')),
 ('lvl-2', 2, 'Bạc',       500,  '🥈', 'Mở khoá bảng xếp hạng tuần và huy hiệu Bạc', 1, datetime('now'), datetime('now')),
 ('lvl-3', 3, 'Vàng',      1500, '🥇', 'Đổi quà từ mức Vàng, được ưu tiên chấm bài', 1, datetime('now'), datetime('now')),
 ('lvl-4', 4, 'Bạch Kim',  3500, '💎', 'Tham gia buổi Q&A nhóm nhỏ cùng đội ngũ', 1, datetime('now'), datetime('now')),
 ('lvl-5', 5, 'Kim Cương', 7000, '👑', 'Toàn bộ quà tặng, và được cố vấn 1-1', 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO activity_types (id, name, key, description, icon, category, xp_reward, coin_reward, daily_cap, sort_order, ai_criteria, is_active, created_date, updated_date) VALUES
 ('at-content', 'Đăng content', 'content', 'Đăng một bài bán hàng hoặc xây thương hiệu', 'PenLine', 'content', 20, 10, 3, 1,
  'Đúng cấu trúc bài bán hàng; Giọng văn cá nhân, không sao chép; Có lời kêu gọi hành động rõ ràng', 1, datetime('now'), datetime('now')),
 ('at-call', 'Gọi khách hàng', 'call', 'Gọi tư vấn khách hàng tiềm năng', 'Phone', 'sales', 5, 3, 10, 2,
  'Đủ số lượng cuộc gọi đã cam kết; Có bằng chứng (ghi âm hoặc log cuộc gọi); Ghi lại kết quả từng cuộc', 1, datetime('now'), datetime('now')),
 ('at-assignment', 'Nộp bài tập', 'assignment', 'Hoàn thành bài tập của khoá học', 'BookOpen', 'learning', 50, 20, 2, 3,
  'Có định vị rõ ràng; Có mức giá cụ thể; Đính kèm bằng chứng triển khai; Nộp đúng hạn', 1, datetime('now'), datetime('now'));

-- Luat cong diem. Doi so o day la doi NGAY, khong can deploy lai.
INSERT OR IGNORE INTO point_rules (id, event_key, label, xp, coin, daily_cap, lifetime_cap, requires_approval, sort_order, is_active, created_date, updated_date) VALUES
 ('pr-activity',  'activity_approved',    'Hoạt động được duyệt',        20,  10, NULL, NULL, 1, 1,  1, datetime('now'), datetime('now')),
 ('pr-challenge', 'challenge_day_scored', 'Bài thử thách đạt',           50,  20, NULL, NULL, 0, 2,  1, datetime('now'), datetime('now')),
 ('pr-streak',    'streak_milestone',     'Mốc giữ chuỗi ngày',          50,  20, NULL, NULL, 0, 3,  1, datetime('now'), datetime('now')),
 ('pr-levelup',   'level_up',             'Lên cấp mới',                  0,  50, NULL, NULL, 0, 4,  1, datetime('now'), datetime('now')),
 ('pr-badge',     'badge_earned',         'Nhận huy hiệu',                0,  30, NULL, NULL, 0, 5,  1, datetime('now'), datetime('now')),
 ('pr-lesson',    'lesson_completed',     'Học xong một bài',            15,   5, NULL, NULL, 0, 6,  1, datetime('now'), datetime('now')),
 ('pr-course',    'course_completed',     'Hoàn thành một khoá',        200, 100, NULL, NULL, 0, 7,  1, datetime('now'), datetime('now')),
 -- Tran ngay o hai muc duoi la de chan spam: dang 50 bai mot ngay khong the
 -- duoc cong nhu 50 lan dong gop that.
 ('pr-post',      'post_created',         'Đăng bài trong cộng đồng',    10,   5, 3,    NULL, 0, 8,  1, datetime('now'), datetime('now')),
 ('pr-comment',   'comment_created',      'Bình luận trong cộng đồng',    3,   1, 10,   NULL, 0, 9,  1, datetime('now'), datetime('now')),
 ('pr-referral',  'referral_valid',       'Mời được một người đăng ký', 100,  50, NULL, NULL, 0, 10, 1, datetime('now'), datetime('now')),
 ('pr-order',     'order_paid',           'Mua khoá/gói thành công',    200, 100, NULL, NULL, 0, 11, 1, datetime('now'), datetime('now')),
 ('pr-event',     'event_attended',       'Điểm danh buổi live',         30,  15, NULL, NULL, 0, 12, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO badges (id, name, key, icon, description, condition, condition_type, condition_value, sort_order, is_active, created_date, updated_date) VALUES
 ('bd-first',    'Bước đầu tiên',   'first_activity', '🌱', 'Ghi nhận hoạt động đầu tiên',    'Nộp 1 hoạt động',       'activity_count', 1,  1, 1, datetime('now'), datetime('now')),
 ('bd-streak7',  'Bền bỉ 7 ngày',   'streak_7',       '🔥', 'Giữ chuỗi 7 ngày liên tục',      'Chuỗi 7 ngày',          'streak',         7,  2, 1, datetime('now'), datetime('now')),
 ('bd-streak30', 'Kỷ luật thép',    'streak_30',      '⚡', 'Giữ chuỗi 30 ngày liên tục',     'Chuỗi 30 ngày',         'streak',         30, 3, 1, datetime('now'), datetime('now')),
 ('bd-content',  'Cây viết',        'content_10',     '✍️', 'Đăng 10 bài content được duyệt', '10 content được duyệt', 'content_count',  10, 4, 1, datetime('now'), datetime('now')),
 ('bd-call',     'Chiến binh gọi',  'call_50',        '📞', 'Gọi 50 khách hàng tiềm năng',    '50 cuộc gọi',           'call_count',     50, 5, 1, datetime('now'), datetime('now')),
 ('bd-level3',   'Chuyên gia',      'level_3',        '🥇', 'Đạt cấp Vàng',                   'Lên cấp 3',             'level',          3,  6, 1, datetime('now'), datetime('now')),
 ('bd-course',   'Học trò xuất sắc','course_done',    '🎓', 'Hoàn thành một khoá học',        'Xong 1 khoá',           'course_count',   1,  7, 1, datetime('now'), datetime('now')),
 ('bd-referral', 'Người kết nối',   'referral_5',     '🤝', 'Mời được 5 người vào cộng đồng', '5 lượt giới thiệu',     'referral_count', 5,  8, 1, datetime('now'), datetime('now'));

-- Cau hinh chung. Cot `type` de trang "Co che" tu sinh dung o nhap, nen them
-- cau hinh moi ve sau chi la them mot dong o day.
INSERT OR IGNORE INTO app_settings (id, key, value, type, options_json, category, label, description, sort_order, created_date, updated_date) VALUES
 ('st-streak-freeze', 'streak_freeze_count',       '1',      'number', NULL, 'streak',      'Số lần được nghỉ mà không mất chuỗi', 'Mỗi tháng học viên được nghỉ bao nhiêu ngày mà chuỗi vẫn giữ', 1, datetime('now'), datetime('now')),
 ('st-streak-reset',  'streak_reset_on_miss',      'true',   'bool',   NULL, 'streak',      'Nghỉ một ngày là mất chuỗi', 'Tắt đi thì chuỗi chỉ dừng lại chứ không về 0', 2, datetime('now'), datetime('now')),
 ('st-lb-reset',      'lb_reset',                  'weekly', 'select', '["daily","weekly","monthly","all_time"]', 'leaderboard', 'Chu kỳ làm mới bảng xếp hạng', '', 3, datetime('now'), datetime('now')),
 ('st-lb-tiebreak',   'lb_tiebreak',               'streak', 'select', '["streak","earliest","alphabet"]', 'leaderboard', 'Bằng điểm thì xếp ai trước', '', 4, datetime('now'), datetime('now')),
 ('st-lb-top',        'lb_visible_top',            '5',      'number', NULL, 'leaderboard', 'Hiện bao nhiêu người trên bục', '', 5, datetime('now'), datetime('now')),
 ('st-reward-approve','reward_approval',           'manual', 'select', '["auto","manual"]', 'rewards', 'Duyệt đổi quà', 'Tự động hay admin duyệt tay', 6, datetime('now'), datetime('now')),
 ('st-reward-gate',   'reward_rank_gate',          'true',   'bool',   NULL, 'rewards',     'Khoá quà theo cấp bậc', 'Bật thì phải đủ cấp mới đổi được', 7, datetime('now'), datetime('now')),
 ('st-reward-alert',  'reward_stock_alert',        '3',      'number', NULL, 'rewards',     'Cảnh báo khi còn dưới bao nhiêu quà', '', 8, datetime('now'), datetime('now')),
 ('st-course-seq',    'course_sequential',         'true',   'bool',   NULL, 'courses',     'Học theo thứ tự', 'Bật thì phải xong bài trước mới mở bài sau', 9, datetime('now'), datetime('now')),
 ('st-course-submit', 'course_require_submit',     'false',  'bool',   NULL, 'courses',     'Bắt buộc nộp bài mới tính hoàn thành', '', 10, datetime('now'), datetime('now')),
 ('st-course-cert',   'course_cert_min_pct',       '80',     'number', NULL, 'courses',     'Phần trăm tối thiểu để được cấp chứng nhận', '', 11, datetime('now'), datetime('now')),
 ('st-ch-gate',       'challenge_day_gate',        'true',   'bool',   NULL, 'challenge',   'Mở từng ngày theo lịch', 'Tắt thì học viên làm trước được', 12, datetime('now'), datetime('now')),
 ('st-ch-catchup',    'challenge_allow_catchup',   'true',   'bool',   NULL, 'challenge',   'Cho nộp bù ngày đã lỡ', '', 13, datetime('now'), datetime('now')),
 ('st-ch-penalty',    'challenge_late_penalty_pct','20',     'number', NULL, 'challenge',   'Trừ bao nhiêu phần trăm điểm khi nộp muộn', '', 14, datetime('now'), datetime('now')),
 ('st-ch-catchdays',  'challenge_max_catchup_days','3',      'number', NULL, 'challenge',   'Cho nộp bù tối đa mấy ngày', '', 15, datetime('now'), datetime('now')),
 ('st-aff-pct',       'affiliate_commission_pct',  '20',     'number', NULL, 'affiliate',   'Hoa hồng (phần trăm)', 'Phần trăm trên mỗi đơn bán được qua link giới thiệu', 16, datetime('now'), datetime('now')),
 ('st-aff-min',       'affiliate_min_payout',      '500000', 'number', NULL, 'affiliate',   'Mức tối thiểu để chi hoa hồng (đ)', '', 17, datetime('now'), datetime('now')),
 ('st-aff-cookie',    'affiliate_cookie_days',     '60',     'number', NULL, 'affiliate',   'Số ngày ghi nhận người giới thiệu', '', 18, datetime('now'), datetime('now')),
 ('st-coin-rate',     'coin_exchange_rate',        '1000',   'number', NULL, 'rewards',     'Quy đổi 1 xu ra bao nhiêu đồng', 'Chỉ dùng để hiển thị giá trị quà', 19, datetime('now'), datetime('now')),
 ('st-remind-hour',   'reminder_hour',             '20:00',  'string', NULL, 'reminder',    'Giờ nhắc học viên mỗi ngày', '', 20, datetime('now'), datetime('now')),
 ('st-remind-chan',   'reminder_channel',          'email',  'select', '["zalo","email","both"]', 'reminder', 'Nhắc qua kênh nào', '', 21, datetime('now'), datetime('now')),
 ('st-ai-grading',    'ai_grading_enabled',        'true',   'bool',   NULL, 'ai',          'Bật AI chấm bài', 'Tắt thì admin chấm tay hoàn toàn', 22, datetime('now'), datetime('now')),
 ('st-ai-pass',       'ai_pass_score',             '60',     'number', NULL, 'ai',          'Điểm tối thiểu để bài được coi là đạt', '', 23, datetime('now'), datetime('now'));

-- Cac phan cua app hoc vien, de admin bat/tat va doi ten trong "Tuy chinh Portal".
INSERT OR IGNORE INTO portal_sections (id, page_key, section_key, label, visible, sort_order, created_date, updated_date) VALUES
 ('ps-d-kpi',     'dashboard', 'kpi',             'Thẻ chỉ số',            1, 1, datetime('now'), datetime('now')),
 ('ps-d-level',   'dashboard', 'levelbar',        'Thanh tiến độ cấp bậc', 1, 2, datetime('now'), datetime('now')),
 ('ps-d-today',   'dashboard', 'todayprogress',   'Tiến độ hôm nay',       1, 3, datetime('now'), datetime('now')),
 ('ps-d-chal',    'dashboard', 'activechallenges','Challenge đang diễn ra',1, 4, datetime('now'), datetime('now')),
 ('ps-d-top',     'dashboard', 'topfive',         'Top hôm nay',           1, 5, datetime('now'), datetime('now')),
 ('ps-d-badge',   'dashboard', 'recentbadges',    'Huy hiệu gần đây',      1, 6, datetime('now'), datetime('now')),
 ('ps-j-totals',  'journey',   'totals',          'Tổng kết',              1, 1, datetime('now'), datetime('now')),
 ('ps-j-rank',    'journey',   'liverank',        'Bảng xếp hạng của bạn', 1, 2, datetime('now'), datetime('now')),
 ('ps-j-heat',    'journey',   'heatmap',         'Hoạt động theo ngày',   1, 3, datetime('now'), datetime('now')),
 ('ps-j-todo',    'journey',   'todo',            'Việc cần làm',          1, 4, datetime('now'), datetime('now')),
 ('ps-c-composer','community', 'composer',        'Ô soạn bài',            1, 1, datetime('now'), datetime('now')),
 ('ps-c-feed',    'community', 'feed',            'Dòng bài viết',         1, 2, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO staff (id, user_id, name, email, role_label, assigned_members, reviewed_count, is_active, sort_order, created_date, updated_date) VALUES
 ('sf-ai', NULL, 'Trợ lý AI', NULL, 'Trợ lý AI', 0, 0, 1, 99, datetime('now'), datetime('now'));
