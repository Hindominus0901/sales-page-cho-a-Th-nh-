/**
 * Bo cau hoi khao sat o trang "AI Funnel - 2 Form".
 *
 * LUU Y: trong file HTML goc, thuoc tinh name cua 3 cau cuoi bi lech:
 *   cau 6 (linh vuc)      -> name="q7"
 *   cau 7 (thu nhap)      -> name="q8"
 *   cau 8 (mong muon)     -> name="q6"
 * FIELD_TO_KEY ben duoi chuan hoa lai ve q1..q8 dung theo so thu tu hien thi,
 * de du lieu luu trong DB va file export luon dung nghia.
 */

const QUESTIONS = [
  {
    key: 'q1', field: 'q1', multi: false,
    label: 'Đã từng thử mô hình kinh doanh online chưa?',
    options: [
      { match: 'Chưa', value: 'chua_tung', score: 3 },
      { match: 'Rồi', value: 'da_tung', score: 10 },
    ],
  },
  {
    key: 'q2', field: 'q2', multi: false,
    label: 'Mục tiêu thu nhập 6 tháng tới',
    options: [
      { match: '5–10 triệu', value: 'phu_5_10tr', score: 5 },
      { match: 'Thay thế', value: 'thay_the_thu_nhap', score: 12 },
      { match: 'hệ thống thu nhập lớn', value: 'he_thong_lon', score: 20 },
    ],
  },
  {
    key: 'q3', field: 'q3', multi: false,
    label: 'Thời gian có thể dành mỗi tuần',
    options: [
      { match: 'Dưới 5', value: 'duoi_5h', score: 5 },
      { match: '5–15', value: '5_15h', score: 15 },
      { match: 'Trên 15', value: 'tren_15h', score: 20 },
    ],
  },
  {
    key: 'q4', field: 'q4', multi: true,
    daBoKhoiForm: true,
    label: 'Trở ngại lớn nhất',
    options: [
      { match: 'bắt đầu từ đâu', value: 'thieu_lo_trinh', score: 0 },
      { match: 'Thiếu thời gian', value: 'thieu_thoi_gian', score: 0 },
      { match: 'tự tin công nghệ', value: 'ngai_cong_nghe', score: 0 },
      { match: 'tự tin/niềm tin', value: 'thieu_tu_tin', score: 0 },
    ],
  },
  {
    key: 'q5', field: 'q5', multi: false,
    label: 'Mức độ dùng công cụ AI',
    options: [
      { match: 'Chưa dùng', value: 'chua_dung', score: 3 },
      { match: 'hỏi đáp thông thường', value: 'co_ban', score: 7 },
      { match: 'chưa có hệ thống', value: 'da_ung_dung', score: 12 },
    ],
  },
  {
    key: 'q6', field: 'q7', multi: false,
    daBoKhoiForm: true,
    label: 'Lĩnh vực đang làm',
    options: [
      { match: 'văn phòng', value: 'nhan_vien', score: 5 },
      { match: 'Kinh doanh tự do', value: 'chu_shop', score: 10 },
      { match: 'Freelancer', value: 'freelancer', score: 8 },
      { match: 'Sinh viên', value: 'sinh_vien', score: 2 },
      { match: 'Khác', value: 'khac', score: 4 },
    ],
  },
  {
    key: 'q7', field: 'q8', multi: false,
    label: 'Thu nhập hiện tại / tháng',
    options: [
      { match: 'Dưới 10', value: 'duoi_10tr', score: 5 },
      { match: '10–30', value: '10_30tr', score: 15 },
      { match: '30–70', value: '30_70tr', score: 25 },
      { match: 'Trên 70', value: 'tren_70tr', score: 30 },
    ],
  },
  {
    key: 'q8', field: 'q6', multi: true,
    daBoKhoiForm: true,
    label: 'Mong nhận được nhất từ Challenge',
    options: [
      { match: 'mô hình kinh doanh cụ thể', value: 'mo_hinh_cu_the', score: 3 },
      { match: 'tự động hoá', value: 'tu_dong_hoa', score: 3 },
      { match: 'cố vấn trực tiếp', value: 'muon_co_van', score: 8 },
    ],
  },
];

const BY_KEY = new Map(QUESTIONS.map((q) => [q.key, q]));
const FIELD_TO_KEY = new Map(QUESTIONS.map((q) => [q.field, q.key]));

const stripDiacritics = (s) =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

function matchOption(question, rawText) {
  if (rawText == null) return null;
  const hay = stripDiacritics(String(rawText)).toLowerCase();
  for (const opt of question.options) {
    const needle = stripDiacritics(opt.match).toLowerCase();
    if (hay.includes(needle)) return opt;
  }
  return null;
}

/**
 * Chuan hoa payload cau tra loi.
 *
 * @param raw    object dang { q1: 'text', q4: ['text','text'], ... }
 * @param schema 'canonical' = key theo so thu tu hien thi (q1..q8, mac dinh)
 *               'html'      = key theo thuoc tinh name trong file HTML goc (bi lech 3 cau cuoi)
 * @returns { answers, missing }
 */
function normalizeAnswers(raw = {}, schema = 'canonical') {
  const answers = {};
  const missing = [];

  for (const q of QUESTIONS) {
    const sourceKey = schema === 'html' ? q.field : q.key;
    const value = raw[sourceKey];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      // Cau da bo khoi form thi khong the "thieu" duoc nua. Van giu dinh nghia
      // o day de lead cu - da tra loi du 8 cau - con doc va xuat file duoc.
      if (!q.daBoKhoiForm) missing.push(q.key);
      continue;
    }
    const list = Array.isArray(value) ? value : [value];
    const picked = [];
    for (const item of list) {
      const opt = matchOption(q, item);
      picked.push({
        value: opt ? opt.value : 'khac',
        text: String(item).slice(0, 300),
        score: opt ? opt.score : 0,
      });
    }
    answers[q.key] = q.multi ? picked : picked[0];
  }
  return { answers, missing };
}

/**
 * Diem toi da chi tinh tren nhung cau CON HOI trong form.
 *
 * Neu van tinh ca ba cau da bo thi moi lead moi deu mat phan diem cua chung -
 * ai cung tut xuong "cold", va bang phan khuc tro nen vo nghia ma khong bao loi.
 */
const MAX_SCORE = QUESTIONS.reduce((sum, q) => {
  if (q.daBoKhoiForm) return sum;
  const scores = q.options.map((o) => o.score || 0);
  return sum + (q.multi ? scores.reduce((a, b) => a + b, 0) : Math.max(0, ...scores));
}, 0);

/** Diem 0..100 + phan khuc (hot/warm/cold) de uu tien cham soc va upsell VIP. */
function scoreLead(answers) {
  let raw = 0;
  for (const q of QUESTIONS) {
    const a = answers[q.key];
    if (!a) continue;
    if (q.multi) { for (const item of a) raw += item.score || 0; }
    else raw += a.score || 0;
  }
  const score = Math.max(0, Math.min(100, Math.round((raw / MAX_SCORE) * 100)));
  const segment = score >= 65 ? 'hot' : score >= 40 ? 'warm' : 'cold';
  return { score, segment, raw, max: MAX_SCORE };
}

/** Dang gon de xuat CSV / hien thi admin. */
function flattenAnswers(answers) {
  const out = {};
  for (const q of QUESTIONS) {
    const a = answers[q.key];
    if (!a) { out[q.key] = ''; continue; }
    out[q.key] = Array.isArray(a) ? a.map((x) => x.text).join(' | ') : a.text;
  }
  return out;
}

export { QUESTIONS, MAX_SCORE, BY_KEY, FIELD_TO_KEY, normalizeAnswers, scoreLead, flattenAnswers, stripDiacritics };