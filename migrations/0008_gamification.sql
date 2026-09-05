-- Bài nộp hằng ngày, coin/XP/rank và kho quà.
--
-- Mô hình khoá 21 ngày: mỗi ngày học viên đăng một bài lên kênh THẬT của mình
-- rồi nộp link vào đây; team của Thành đọc, nhận xét và duyệt. Duyệt xong mới
-- cộng coin và XP — nộp cho có thì không được tính.

CREATE TABLE submissions (
  id            TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  day           INTEGER NOT NULL CHECK (day BETWEEN 1 AND 21),
  post_url      TEXT,
  content       TEXT,
  channel       TEXT,                       -- facebook | tiktok | youtube | khac
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','needs_work','rejected')),
  feedback      TEXT,                       -- nhận xét của team, học viên đọc được
  reviewed_by   TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at   INTEGER,
  -- Nộp muộn vẫn nhận được nhận xét, chỉ không tính vào điều kiện học bổng.
  is_late       INTEGER NOT NULL DEFAULT 0,
  coin_awarded  INTEGER NOT NULL DEFAULT 0,
  xp_awarded    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
-- Một ngày một bài: nộp lại thì sửa bài cũ, không tạo bài thứ hai.
CREATE UNIQUE INDEX ux_submissions_day     ON submissions(enrollment_id, day);
CREATE INDEX        ix_submissions_status  ON submissions(status, created_at DESC);
CREATE INDEX        ix_submissions_student ON submissions(student_id, day);
CREATE INDEX        ix_submissions_created ON submissions(created_at DESC);

-- Sổ cái coin. Số dư LUÔN là tổng của sổ này, không phải một con số rời được
-- cộng trừ thẳng — nhờ vậy mọi thay đổi đều giải thích được, và lệch số thì
-- dò ra được ngay đã cộng/trừ từ đâu.
CREATE TABLE coin_ledger (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,              -- dương là cộng, âm là trừ
  reason     TEXT NOT NULL,                 -- submission | streak_bonus | redeem | manual | refund
  note       TEXT,
  ref_type   TEXT,
  ref_id     TEXT,
  actor_id   TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX ix_coin_ledger_student ON coin_ledger(student_id, created_at DESC);
CREATE INDEX ix_coin_ledger_reason  ON coin_ledger(reason, created_at DESC);

CREATE TABLE rewards (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  cost_coin   INTEGER NOT NULL,
  min_rank    INTEGER NOT NULL DEFAULT 0,   -- chỉ số bậc tối thiểu trong rank_tiers
  stock       INTEGER,                      -- NULL = không giới hạn
  image_url   TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX ix_rewards_active ON rewards(is_active, sort_order);

-- Trừ coin ngay lúc học viên đặt đổi (giữ chỗ), hoàn lại nếu bị từ chối.
-- Nếu chờ tới lúc duyệt mới trừ thì học viên đổi được nhiều quà hơn số coin có.
CREATE TABLE reward_redemptions (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reward_id   TEXT NOT NULL REFERENCES rewards(id),
  reward_name TEXT NOT NULL,                -- chụp lại tên lúc đổi, quà đổi tên sau không làm sai lịch sử
  cost_coin   INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'requested'
              CHECK (status IN ('requested','approved','fulfilled','rejected','cancelled')),
  note        TEXT,                         -- địa chỉ nhận, ghi chú của học viên
  admin_note  TEXT,
  decided_by  TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  decided_at  INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX ix_redemptions_status  ON reward_redemptions(status, created_at DESC);
CREATE INDEX ix_redemptions_student ON reward_redemptions(student_id, created_at DESC);

-- Cột tổng hợp trên students: đọc nhanh cho bảng xếp hạng và danh sách.
-- coin là số dư đã tính sẵn từ coin_ledger để không phải SUM mỗi lần hiện bảng.
ALTER TABLE students ADD COLUMN xp             INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN coin           INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN streak_current INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN streak_best    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN last_submit_date TEXT;   -- 'YYYY-MM-DD' giờ Việt Nam

CREATE INDEX ix_students_xp   ON students(xp DESC);
CREATE INDEX ix_students_coin ON students(coin DESC);
