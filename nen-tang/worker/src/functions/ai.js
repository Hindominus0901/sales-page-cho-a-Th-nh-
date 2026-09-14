/**
 * Cham bai bang AI theo rubric.
 *
 * Chi Thanh chot: "lam rubric roi cho he thong cham". Nghia la AI khong cham
 * bang cam tinh - no phai tra ve tung tieu chi dat hay khong dat, kem mot cau
 * giai thich. Nho vay:
 *   - hoc vien biet minh thieu cho nao, khong chi thay mot con diem
 *   - admin nhin vao la biet AI cham co hop ly khong, va sua tay duoc
 *
 * Neu chua cau hinh khoa API thi tra ve loi ro rang chu KHONG tu bia diem.
 */
const API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

/** Tieu chi mac dinh khi loai hoat dong chua khai rubric rieng. */
const DEFAULT_CRITERIA = [
  'Bài nộp có nội dung thật, không phải viết cho có',
  'Bám đúng yêu cầu của nhiệm vụ',
  'Có dẫn chứng hoặc kết quả cụ thể',
];

/**
 * Loi nhac he thong. Ten chuong trinh chen vao tu cau hinh de AI biet minh
 * dang cham bai cho ai - noi "khoa hoc kinh doanh" chung chung thi nhan xet
 * cung chung chung theo.
 */
const dungSystem = (tenChuongTrinh) => `Bạn là trợ giảng của ${tenChuongTrinh || 'một khoá học kinh doanh tiếng Việt'}.
Nhiệm vụ: chấm bài nộp của học viên theo đúng các tiêu chí được đưa ra.

Nguyên tắc:
- Chấm theo TỪNG tiêu chí, mỗi tiêu chí chỉ có đạt hoặc không đạt.
- Nhận xét bằng tiếng Việt, xưng "bạn", tối đa 3 câu, nói thẳng cần sửa gì.
- Rộng lượng với lỗi chính tả và cách diễn đạt; nghiêm với việc nộp cho có,
  nộp trống, hoặc chép nguyên đề bài.
- Không bịa ra thông tin học viên không viết.`;

const TOOL = {
  name: 'cham_bai',
  description: 'Trả về kết quả chấm bài theo từng tiêu chí',
  input_schema: {
    type: 'object',
    properties: {
      rubric: {
        type: 'array',
        description: 'Kết quả từng tiêu chí, đúng thứ tự đã cho',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Tên tiêu chí' },
            pass: { type: 'boolean', description: 'Đạt hay không' },
          },
          required: ['label', 'pass'],
        },
      },
      score: { type: 'number', description: 'Điểm 0-100' },
      feedback: { type: 'string', description: 'Nhận xét tiếng Việt, tối đa 3 câu' },
    },
    required: ['rubric', 'score', 'feedback'],
  },
};

/** Tach chuoi tieu chi (moi dong mot y, hoac ngan cach bang dau ;) thanh mang. */
function parseCriteria(raw) {
  const list = String(raw || '')
    .split(/\r?\n|;/)
    .map((s) => s.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((s) => s.length > 3);
  return list.length ? list.slice(0, 8) : DEFAULT_CRITERIA;
}

/**
 * @returns {Promise<{ok:true, score:number, feedback:string, rubric:Array}|{ok:false, error:string}>}
 */
export async function scoreWithAi(rc, { criteria, title, content, link, imageUrl }) {
  const key = rc.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { ok: false, error: 'Chưa bật chấm điểm tự động (thiếu ANTHROPIC_API_KEY).' };
  }

  const text = String(content || '').trim();
  if (!text && !link && !imageUrl) {
    return { ok: false, error: 'Bài nộp đang trống, không có gì để chấm.' };
  }

  const list = parseCriteria(criteria);
  const prompt = [
    title ? `Nhiệm vụ: ${title}` : null,
    `Tiêu chí chấm:\n${list.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
    link ? `Link bằng chứng học viên gửi: ${link}` : null,
    `Bài nộp của học viên:\n"""\n${text.slice(0, 6000)}\n"""`,
  ].filter(Boolean).join('\n\n');

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: rc.env.AI_MODEL || MODEL,
        max_tokens: 1024,
        system: dungSystem(rc.cfg?.brand?.productLine),
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'cham_bai' },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('[ai] tu choi', res.status, detail.slice(0, 200));
      return { ok: false, error: 'Hệ thống chấm điểm đang bận, thử lại sau ít phút.' };
    }

    const data = await res.json();
    const block = (data.content || []).find((c) => c.type === 'tool_use');
    if (!block?.input) return { ok: false, error: 'Không đọc được kết quả chấm.' };

    const rubric = Array.isArray(block.input.rubric) ? block.input.rubric : [];
    // Diem lay tu chinh so tieu chi dat, khong tin con so AI tu cham - nhu vay
    // diem luon giai thich duoc bang rubric hien tren man hinh.
    const passed = rubric.filter((r) => r.pass).length;
    const score = rubric.length ? Math.round((passed / rubric.length) * 100) : 0;

    return {
      ok: true,
      score,
      feedback: String(block.input.feedback || '').slice(0, 1000),
      rubric,
    };
  } catch (err) {
    console.warn('[ai] loi goi:', err?.message || err);
    return { ok: false, error: 'Không kết nối được hệ thống chấm điểm.' };
  }
}
