-- Toan bo du lieu cua nen tang cong dong.
--
-- Quy uoc chung cho MOI bang o day (frontend dua vao dung 4 cot nay):
--   id TEXT PRIMARY KEY   - UUID sinh o phia may chu
--   created_date TEXT     - ISO-8601
--   updated_date TEXT     - ISO-8601
--   created_by TEXT       - email nguoi tao
-- Boolean luu INTEGER 0/1 (SQLite khong co kieu boolean).
-- Mang/doi tuong luu TEXT chua JSON.

-- ============================================================ nen tang game hoa

-- Doi/nhom hoc vien
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  mentor_id TEXT,
  color TEXT NOT NULL DEFAULT '#FF0FA3',
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

-- Cap bac. Day la THANG DUY NHAT: "Level" va "Rank" trong hai ban thiet ke
-- duoc gop lam mot, vi hai ban ghi hai bo moc khac nhau va giu ca hai thi khong
-- ai biet minh dang o dau. Admin sua moc trong trang "Co che".
CREATE TABLE IF NOT EXISTS levels (
  id TEXT PRIMARY KEY,
  level_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  threshold_xp INTEGER NOT NULL,
  icon TEXT,
  perk TEXT,                                  -- quyen loi cua bac nay
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

-- Loai hoat dong nguoi hoc nop (content / cuoc goi / bai tap...)
CREATE TABLE IF NOT EXISTS activity_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'Activity',
  category TEXT NOT NULL DEFAULT 'content',
  xp_reward INTEGER NOT NULL DEFAULT 10,
  coin_reward INTEGER NOT NULL DEFAULT 5,
  daily_cap INTEGER NOT NULL DEFAULT 3,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  ai_criteria TEXT,                            -- mo ta cho AI biet the nao la dat
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

-- Mot lan nop bai/ghi nhan hoat dong
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  activity_type_id TEXT,
  activity_type_key TEXT NOT NULL,
  activity_type_name TEXT,
  date TEXT NOT NULL,                          -- ngay ghi nhan (YYYY-MM-DD)
  title TEXT, description TEXT,
  evidence_link TEXT, screenshot_url TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | rejected
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  coin_awarded INTEGER NOT NULL DEFAULT 0,
  counted_for_cap INTEGER NOT NULL DEFAULT 0,
  reviewed_by TEXT, reviewed_at TEXT, rejection_reason TEXT,
  ai_score REAL, ai_feedback TEXT, ai_scored_at TEXT,
  ai_rubric_json TEXT,                         -- [{label, pass}] tung tieu chi
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_act_user   ON activities(user_id, date);
CREATE INDEX IF NOT EXISTS idx_act_status ON activities(status, created_date);

-- So cai XP va xu. DAY MOI LA NGUON SU THAT; users.total_xp / total_coin chi la
-- con so tong luu san cho nhanh, doi soat lai duoc bat cu luc nao.
CREATE TABLE IF NOT EXISTS xp_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, user_name TEXT,
  amount INTEGER NOT NULL,
  source TEXT NOT NULL, source_id TEXT, description TEXT,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_transactions(user_id, created_date);
CREATE INDEX IF NOT EXISTS idx_xp_date ON xp_transactions(created_date);

CREATE TABLE IF NOT EXISTS coin_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, user_name TEXT,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,                          -- earn | spend | admin_adjustment
  source TEXT NOT NULL, source_id TEXT, description TEXT,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_coin_user ON coin_transactions(user_id, created_date);

-- Huy hieu
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, key TEXT NOT NULL UNIQUE,
  icon TEXT, description TEXT,
  condition TEXT, condition_type TEXT, condition_value INTEGER,
  xp_bonus INTEGER NOT NULL DEFAULT 0,
  coin_bonus INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

CREATE TABLE IF NOT EXISTS user_badges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, user_name TEXT,
  badge_id TEXT NOT NULL, badge_name TEXT, badge_icon TEXT,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
-- Moi huy hieu chi trao mot lan cho moi nguoi.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_badge ON user_badges(user_id, badge_id);

-- ============================================================ thu thach

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  banner_url TEXT, description TEXT,
  start_date TEXT, end_date TEXT,
  duration_days INTEGER NOT NULL DEFAULT 21,
  target INTEGER, target_activity_key TEXT,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_coin INTEGER NOT NULL DEFAULT 0,
  reward_badge_id TEXT,
  rules TEXT,
  hero_video_url TEXT,
  requires_unlock INTEGER NOT NULL DEFAULT 0,  -- phai duoc admin mo khoa moi vao duoc
  is_active INTEGER NOT NULL DEFAULT 1,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

-- Nhiem vu tung ngay. Ban thiet ke chay 21 ngay nen KHONG the giu kieu cu
-- (4 cot day1..day4 tren ChallengeMember) - phai la moi ngay mot dong.
CREATE TABLE IF NOT EXISTS challenge_day_tasks (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  title TEXT NOT NULL,
  guide TEXT,
  video_title TEXT, video_url TEXT,
  assignment_url TEXT, doc_url TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  coin INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_day_task ON challenge_day_tasks(challenge_id, day);

CREATE TABLE IF NOT EXISTS challenge_members (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL, challenge_name TEXT,
  user_id TEXT NOT NULL, user_name TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_challenge_member ON challenge_members(challenge_id, user_id);

CREATE TABLE IF NOT EXISTS challenge_submissions (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  user_id TEXT NOT NULL, user_name TEXT,
  day INTEGER NOT NULL,
  content TEXT, link TEXT, file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | rejected
  score REAL, feedback TEXT,
  ai_rubric_json TEXT,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  coin_awarded INTEGER NOT NULL DEFAULT 0,
  reviewed_by TEXT, reviewed_at TEXT,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_submission ON challenge_submissions(challenge_id, user_id, day);
CREATE INDEX IF NOT EXISTS idx_sub_status ON challenge_submissions(status, created_date);

-- ============================================================ qua tang

CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT, description TEXT,
  coin_cost INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,         -- so luong con lai
  min_level INTEGER NOT NULL DEFAULT 1,        -- cap bac toi thieu moi doi duoc
  expiration_date TEXT,
  category TEXT NOT NULL DEFAULT 'Khóa học',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_hot INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, user_name TEXT,
  reward_id TEXT NOT NULL, reward_name TEXT, reward_image_url TEXT,
  coin_spent INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | delivered | cancelled
  note TEXT,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_redeem_user   ON redemptions(user_id, created_date);
CREATE INDEX IF NOT EXISTS idx_redeem_status ON redemptions(status);

-- ============================================================ cong dong (feed)

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, user_name TEXT,
  body TEXT NOT NULL,                          -- luu THO; viec bien link thanh
                                               -- the <a> lam o luc hien thi
  image_url TEXT,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_post_time ON posts(is_hidden, created_date);

CREATE TABLE IF NOT EXISTS post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL, user_name TEXT,
  body TEXT NOT NULL,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_comment_post ON post_comments(post_id, created_date);

CREATE TABLE IF NOT EXISTS post_likes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
-- Mot nguoi chi tha tim mot lan cho moi bai.
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_like ON post_likes(post_id, user_id);

-- ============================================================ lop hoc

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  min_level INTEGER NOT NULL DEFAULT 1,
  requires_unlock INTEGER NOT NULL DEFAULT 0,  -- phai mua/duoc cap quyen moi vao
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  guide TEXT,
  -- Luu "nha cung cap + ma video" chu khong luu san duong dan, de sau doi tu
  -- Wistia sang YouTube/Cloudflare Stream khong phai sua ma nguon.
  video_provider TEXT NOT NULL DEFAULT 'wistia',   -- wistia | youtube | vimeo | stream
  video_id TEXT,
  duration TEXT,                                   -- chuoi hien thi, vd "12:40"
  assignment_url TEXT, doc_url TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  coin INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_lesson_course ON lessons(course_id, sort_order);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_progress ON lesson_progress(user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_progress_course ON lesson_progress(user_id, course_id);

-- ============================================================ quyen truy cap

-- San pham ban duoc (ve, khoa, goi)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                          -- course | package | ticket
  price INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VND',
  grants_json TEXT NOT NULL DEFAULT '[]',      -- [{"kind":"course","ref":"<id>"}]
  is_active INTEGER NOT NULL DEFAULT 1,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

-- Quyen da duoc cap: mua hang, admin mo khoa tay, hoac tang
CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                          -- course | challenge | reward | package
  ref TEXT NOT NULL,                           -- id cua thu duoc mo
  source TEXT NOT NULL,                        -- order | manual | gift
  order_id INTEGER, product_sku TEXT,
  granted_by TEXT,
  granted_at TEXT NOT NULL,
  expires_at TEXT, revoked_at TEXT, note TEXT,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
-- Cap lai cung mot thu khong tao dong thu hai (quan trong khi webhook ban lai).
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlement ON entitlements(user_id, kind, ref)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ent_user ON entitlements(user_id);

-- ============================================================ co che tinh diem

-- Luat cong diem. Doi so o day la doi ngay, KHONG phai deploy lai.
CREATE TABLE IF NOT EXISTS point_rules (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,                         -- ten tieng Viet hien trong admin
  xp INTEGER NOT NULL DEFAULT 0,
  coin INTEGER NOT NULL DEFAULT 0,
  daily_cap INTEGER,                           -- toi da bao nhieu lan/ngay
  lifetime_cap INTEGER,                        -- toi da bao nhieu lan/doi
  requires_approval INTEGER NOT NULL DEFAULT 0,
  conditions_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

-- So cai chong cong trung. Chi muc unique ben duoi la thu dam bao "bam nop hai
-- lan khong duoc cong hai lan", ke ca khi webhook ban lai.
CREATE TABLE IF NOT EXISTS point_awards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  source_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  coin INTEGER NOT NULL DEFAULT 0,
  awarded_at TEXT NOT NULL,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_point_award ON point_awards(user_id, event_key, source_id);
CREATE INDEX IF NOT EXISTS idx_award_user ON point_awards(user_id, awarded_at);

-- ============================================================ van hanh

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT,
  type TEXT, link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, created_date);

CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL, admin_name TEXT,
  target_user_id TEXT, target_user_name TEXT,
  action TEXT NOT NULL, reason TEXT, details TEXT,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_adminlog_time ON admin_logs(created_date);

-- Cau hinh chung. Co cot `type` de trang "Co che" tu sinh o nhap dung kieu,
-- them cau hinh moi ve sau chi la them mot dong du lieu.
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'string',         -- string | number | bool | json | select
  options_json TEXT,                           -- danh sach lua chon khi type=select
  category TEXT,
  label TEXT, description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

-- Nhan su. Tach khoi bang users vi thiet ke co dong "Trợ lý AI" -
-- mot tro ly AI dong vai nhan su, khong phai nguoi dung dang nhap duoc.
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  user_id TEXT,                                -- null neu la AI, khong phai nguoi
  name TEXT NOT NULL, email TEXT, avatar_url TEXT,
  role_label TEXT,                             -- "Founder / Mentor", "Trợ lý AI"...
  assigned_members INTEGER NOT NULL DEFAULT 0,
  reviewed_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);

-- Bat/tat va doi ten tung phan cua app hoc vien, tu trang "Tuỳ chỉnh Portal".
CREATE TABLE IF NOT EXISTS portal_sections (
  id TEXT PRIMARY KEY,
  page_key TEXT NOT NULL,                      -- dashboard | community | journey...
  section_key TEXT NOT NULL,
  label TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_section ON portal_sections(page_key, section_key);

-- Video tu quay cua hoc vien (phan "Video luyện tập")
CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT, duration TEXT, file_url TEXT,
  challenge_id TEXT, day INTEGER,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_recording_user ON recordings(user_id, created_date);
