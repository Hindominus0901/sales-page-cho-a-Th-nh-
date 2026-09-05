/**
 * Chấm điểm lead bằng luật cố định — không dùng AI.
 *
 * Bảng điểm để trong code chứ không phải config trong DB, vì luật hiếm khi
 * đổi và để trong code thì review được, diff được, và có test đi kèm.
 *
 * Đổi luật thì phải TĂNG SCORING_VERSION. Điểm cũ vẫn giữ nguyên version của
 * nó, nên đổi luật không âm thầm diễn giải lại lead đã chấm.
 */

export const SCORING_VERSION = 1;

export type ScoreBand = 'hot' | 'warm' | 'cold';

export interface ScoreLine {
  rule: string;
  label: string;   // hiện thẳng trong CMS, phải đọc được bằng tiếng Việt
  points: number;
}

export interface ScoreResult {
  score: number;           // 0..100
  band: ScoreBand;
  breakdown: ScoreLine[];
  version: number;
}

/** Câu trả lời form. Trường nào thiếu thì nhóm đó đơn giản là không cộng điểm. */
export interface ScoreInput {
  budget?: string;
  timeline?: string;
  dailyTime?: string;
  channel?: string;
  goal?: string;
  /** true khi số điện thoại này đã đăng ký workshop trước đó */
  attendedWorkshop?: boolean;
  viaAffiliate?: boolean;
  phoneValid?: boolean;
  email?: string | null;
  facebookUrl?: string | null;
  /** true khi cùng số điện thoại đã gửi form trong 24h qua */
  duplicateWithin24h?: boolean;
  /** Các câu tự luận (điều đang mắc kẹt, mục tiêu…) */
  freeText?: (string | null | undefined)[];
}

// ---------------------------------------------------------------- bảng điểm

/** 1. Ngân sách — tín hiệu mua mạnh nhất, nên chiếm trọng số cao nhất. */
const BUDGET: Record<string, [number, string]> = {
  ready_2m:         [30, 'Ngân sách: sẵn sàng đầu tư 2 triệu ngay'],
  need_installment: [12, 'Ngân sách: muốn trả góp / chia đợt'],
  need_think:       [15, 'Ngân sách: cần cân nhắc thêm'],
  not_ready:        [0,  'Ngân sách: chưa sẵn sàng'],
};

/** 2. Thời điểm bắt đầu. */
const TIMELINE: Record<string, [number, string]> = {
  now:        [25, 'Thời điểm: muốn bắt đầu ngay'],
  this_month: [16, 'Thời điểm: trong tháng này'],
  '2_3_months':[6, 'Thời điểm: 2–3 tháng nữa'],
  unsure:     [0,  'Thời điểm: chưa xác định'],
};

/** 3. Thời gian bỏ ra mỗi ngày — khoá đòi mỗi ngày một bài. */
const DAILY_TIME: Record<string, [number, string]> = {
  over_2h:  [15, 'Thời gian: trên 2 giờ/ngày'],
  '1_2h':   [11, 'Thời gian: 1–2 giờ/ngày'],
  under_1h: [4,  'Thời gian: dưới 1 giờ/ngày'],
};

/**
 * 4. Hiện trạng kênh. Điểm ngọt là "đã bắt đầu nhưng chưa bứt phá".
 * Người chưa có kênh vẫn được 5 điểm — đây vẫn đúng là tệp mục tiêu của khoá,
 * không được cho về 0.
 */
const CHANNEL: Record<string, [number, string]> = {
  has_1k_10k:   [12, 'Kênh: đã có 1.000–10.000 người theo dõi'],
  has_over_10k: [9,  'Kênh: đã có trên 10.000 người theo dõi'],
  has_under_1k: [8,  'Kênh: đã có dưới 1.000 người theo dõi'],
  none_yet:     [5,  'Kênh: chưa có kênh'],
};

/** 5. Mục tiêu — ra khách xếp trên xây thương hiệu, trên tò mò. */
const GOAL: Record<string, [number, string]> = {
  sell_products:       [10, 'Mục tiêu: bán sản phẩm/dịch vụ'],
  get_clients:         [10, 'Mục tiêu: thu hút khách hàng'],
  build_personal_brand:[7,  'Mục tiêu: xây thương hiệu cá nhân'],
  just_curious:        [2,  'Mục tiêu: tìm hiểu thêm'],
};

const MAX_RAW = 30 + 25 + 15 + 12 + 10 + 10 + 8;   // 110

// ---------------------------------------------------------------- tính điểm

function pick(
  table: Record<string, [number, string]>,
  key: string | undefined,
  rule: string,
  out: ScoreLine[],
): void {
  if (!key) return;
  const hit = table[key];
  if (!hit) return;
  out.push({ rule, label: hit[1], points: hit[0] });
}

export function scoreLead(input: ScoreInput): ScoreResult {
  const lines: ScoreLine[] = [];

  pick(BUDGET,     input.budget,    'budget',     lines);
  pick(TIMELINE,   input.timeline,  'timeline',   lines);
  pick(DAILY_TIME, input.dailyTime, 'daily_time', lines);
  pick(CHANNEL,    input.channel,   'channel',    lines);
  pick(GOAL,       input.goal,      'goal',       lines);

  // 6. Nguồn — người đã dự workshop là tệp ấm nhất ngoài form.
  if (input.attendedWorkshop) {
    lines.push({ rule: 'source', label: 'Nguồn: đã tham gia workshop', points: 10 });
  } else if (input.viaAffiliate) {
    lines.push({ rule: 'source', label: 'Nguồn: qua cộng tác viên giới thiệu', points: 5 });
  }

  // 7. Chất lượng thông tin liên hệ — càng dễ liên lạc lại càng đáng gọi.
  if (input.phoneValid) {
    lines.push({ rule: 'contact_phone', label: 'Liên hệ: số điện thoại hợp lệ', points: 5 });
  }
  if (input.email?.trim()) {
    lines.push({ rule: 'contact_email', label: 'Liên hệ: có email', points: 2 });
  }
  if (input.facebookUrl?.trim()) {
    lines.push({ rule: 'contact_fb', label: 'Liên hệ: có Facebook', points: 1 });
  }

  // 8. Trừ điểm.
  if (input.duplicateWithin24h) {
    lines.push({ rule: 'duplicate', label: 'Trùng: đã gửi form trong 24h qua', points: -5 });
  }
  const texts = (input.freeText ?? []).map((t) => String(t ?? '').trim());
  if (texts.length > 0 && texts.every((t) => t.length < 3)) {
    lines.push({ rule: 'empty_text', label: 'Câu trả lời tự luận bỏ trống', points: -5 });
  }

  const raw = lines.reduce((sum, l) => sum + l.points, 0);
  // Chuẩn hoá về thang 100 để con số có nghĩa cố định, không đổi khi thêm luật.
  const score = Math.max(0, Math.min(100, Math.round((raw / MAX_RAW) * 100)));

  return { score, band: bandOf(score), breakdown: lines, version: SCORING_VERSION };
}

export function bandOf(score: number): ScoreBand {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

/** Nhãn tiếng Việt kèm hành động mong đợi — dùng ở CMS. */
export const BAND_LABEL: Record<ScoreBand, string> = {
  hot:  'NÓNG — gọi trong 2 giờ',
  warm: 'ẤM — gọi trong 24 giờ',
  cold: 'LẠNH — nuôi bằng nội dung',
};

/**
 * Lead workshop chấm bằng tập trường rút gọn nên điểm thấp hơn tự nhiên.
 * Khi chính người đó nộp form tư vấn đầy đủ về sau, điểm CHỈ ĐƯỢC TĂNG —
 * một form ngắn hơn không được phép hạ điểm một lead đã được chấm kỹ.
 */
export function mergeScore(existing: ScoreResult | null, next: ScoreResult): ScoreResult {
  if (!existing) return next;
  return next.score >= existing.score ? next : existing;
}
