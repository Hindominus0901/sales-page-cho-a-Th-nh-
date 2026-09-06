import type { Env } from '../../types';

export interface Mail {
  toEmail: string;
  toName: string | null;
  subject: string;
  text: string;
  html: string;
  template: 'order_paid' | 'workshop_registered' | 'password_reset' | 'student_access'
    | 'affiliate_application' | 'affiliate_approved';
  refType: string;
  refId: string;
}

const esc = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const vnd = (n: number): string => n.toLocaleString('vi-VN') + 'đ';

/**
 * Khung mail dùng chung. Cố ý đơn giản: bảng một cột, màu nền, không ảnh, không
 * webfont. Gmail và Outlook cắt xén CSS rất mạnh, và mail xác nhận đơn hàng chỉ
 * cần đọc được ở mọi nơi chứ không cần đẹp.
 */
function shell(title: string, blocks: string[]): string {
  return `<!doctype html><html lang="vi"><body style="margin:0;padding:24px 12px;background:#f3ead9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#191919">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
<tr><td style="background:#fff;border-radius:20px;padding:28px 26px">
<div style="font-size:12px;font-weight:700;color:#2f7a4d;letter-spacing:.06em;margin-bottom:10px">GÓC CREATOR</div>
<h1 style="font-size:22px;font-weight:800;line-height:1.25;margin:0 0 16px">${esc(title)}</h1>
${blocks.join('\n')}
</td></tr>
<tr><td style="padding:18px 26px;font-size:12px;line-height:1.7;color:#6a6a72">
Email này gửi tự động khi anh chị đăng ký hoặc thanh toán tại Góc Creator.
</td></tr>
</table></body></html>`;
}

const p = (t: string) => `<p style="font-size:15px;line-height:1.75;color:#3a3a42;margin:0 0 14px">${t}</p>`;
const btn = (label: string, href: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#2f7a4d;color:#fff;font-weight:700;`
  + `font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;margin:4px 0 14px">${esc(label)}</a>`;

export function orderPaidMail(
  env: Env,
  order: { id: string; code: string; name: string; email: string | null; amount: number },
): Mail | null {
  // Không có email thì không xếp hàng — hàng đợi chỉ nên chứa thứ gửi được.
  if (!order.email) return null;

  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const ten = order.name.split(' ').slice(-1)[0] || order.name;

  const text = [
    `Chào ${ten},`,
    '',
    `Góc Creator đã nhận đủ học phí cho đơn ${order.code} (${vnd(order.amount)}).`,
    'Chỗ của anh chị trong Thử thách 21 ngày đã được giữ.',
    '',
    'Việc tiếp theo: bên Thành sẽ nhắn Zalo gửi link vào nhóm học, lịch học,',
    'và đường link riêng để anh chị nộp bài mỗi ngày.',
    '',
    `Xem lại đơn bất cứ lúc nào: ${base}/thanh-toan/${order.code}`,
    `Quên mã đơn thì tra bằng số điện thoại: ${base}/tra-cuu`,
    '',
    `Điều khoản và chính sách: ${base}/dieu-khoan`,
  ].join('\n');

  return {
    toEmail: order.email,
    toName: order.name,
    subject: `Đã nhận học phí — đơn ${order.code}`,
    text,
    html: shell('Đã nhận đủ học phí ✓', [
      p(`Chào <b>${esc(ten)}</b>, Góc Creator đã nhận đủ học phí cho đơn `
        + `<b style="letter-spacing:.05em">${esc(order.code)}</b> (${vnd(order.amount)}). `
        + 'Chỗ của anh chị trong Thử thách 21 ngày đã được giữ.'),
      p('Bên Thành sẽ nhắn Zalo gửi link vào nhóm học, lịch học, và đường link riêng '
        + 'để anh chị nộp bài mỗi ngày.'),
      btn('Xem lại đơn của tôi', `${base}/thanh-toan/${order.code}`),
      p(`Quên mã đơn thì tra bằng số điện thoại tại <a href="${base}/tra-cuu" style="color:#26643f">`
        + `${base}/tra-cuu</a>.`),
      p(`Điều khoản và chính sách: <a href="${base}/dieu-khoan" style="color:#26643f">`
        + `${esc(base)}/dieu-khoan</a>.`),
    ]),
    template: 'order_paid',
    refType: 'order',
    refId: order.id,
  };
}

export function workshopMail(
  env: Env,
  reg: {
    id: string; name: string; email: string | null;
    sessionTitle: string | null; whenText: string | null;
    zoomUrl: string | null; zaloUrl: string | null;
  },
): Mail | null {
  if (!reg.email) return null;

  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const ten = reg.name.split(' ').slice(-1)[0] || reg.name;
  const buoi = reg.sessionTitle ?? 'buổi workshop';

  const dong: string[] = [
    `Chào ${ten},`,
    '',
    `Góc Creator đã ghi nhận chỗ của anh chị ở ${buoi}.`,
  ];
  if (reg.whenText) dong.push('', `Thời gian: ${reg.whenText}`);
  if (reg.zoomUrl) dong.push('', `Link vào phòng: ${reg.zoomUrl}`);
  if (reg.zaloUrl) dong.push('', `Nhóm Zalo: ${reg.zaloUrl}`);
  dong.push('', 'Hẹn gặp anh chị.');

  const blocks = [
    p(`Chào <b>${esc(ten)}</b>, Góc Creator đã ghi nhận chỗ của anh chị ở <b>${esc(buoi)}</b>.`),
  ];
  if (reg.whenText) blocks.push(p(`<b>Thời gian:</b> ${esc(reg.whenText)}`));
  // Link Zoom thường chưa có lúc khách đăng ký sớm — không có thì không hiện
  // nút rỗng, mail vẫn đọc được bình thường.
  if (reg.zoomUrl) blocks.push(btn('Vào phòng học', reg.zoomUrl));
  if (reg.zaloUrl) blocks.push(p(`Nhóm Zalo của buổi học: <a href="${esc(reg.zaloUrl)}" style="color:#26643f">bấm vào đây</a>.`));
  blocks.push(p(`Trong lúc chờ, anh chị xem qua <a href="${base}/" style="color:#26643f">Thử thách 21 ngày</a> nhé.`));

  return {
    toEmail: reg.email,
    toName: reg.name,
    subject: `Đã giữ chỗ workshop — ${buoi}`,
    text: dong.join('\n'),
    html: shell('Đã giữ chỗ cho anh chị ✓', blocks),
    template: 'workshop_registered',
    refType: 'workshop_registration',
    refId: reg.id,
  };
}

/** Chữ hiện ra cho từng vai trò — người nhận không quan tâm tới tên bảng. */
const VAI_TRO: Record<string, string> = {
  admin: 'trang quản trị',
  affiliate: 'portal cộng tác viên',
  student: 'lớp học',
};

/**
 * Mail đặt lại mật khẩu.
 *
 * refId là **id của phiếu đặt lại**, KHÔNG phải id người dùng. Bảng email_outbox
 * có UNIQUE(template, ref_id) để webhook SePay gửi lại không sinh hai thư — với
 * mail này thì cùng ràng buộc ấy thành cái bẫy: lấy id người dùng làm refId thì
 * lần xin thứ hai bị ON CONFLICT DO NOTHING nuốt mất, không báo lỗi gì, và
 * người dùng ngồi chờ một email không bao giờ tới.
 */
export function passwordResetMail(
  env: Env,
  input: {
    resetId: string; token: string; subjectType: string;
    email: string; name: string | null;
  },
): Mail {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const link = `${base}/dat-lai-mat-khau?ma=${encodeURIComponent(input.token)}`;
  const ten = (input.name ?? '').split(' ').slice(-1)[0] || 'anh chị';
  const noi = VAI_TRO[input.subjectType] ?? 'hệ thống';

  const text = [
    `Chào ${ten},`,
    '',
    `Có người vừa xin đặt lại mật khẩu ${noi} Góc Creator cho email này.`,
    '',
    'Mở đường link dưới đây để đặt mật khẩu mới:',
    link,
    '',
    'Đường link dùng được MỘT LẦN và hết hạn sau 1 giờ.',
    '',
    'Nếu không phải anh chị xin, cứ bỏ qua email này — mật khẩu hiện tại',
    'vẫn nguyên vẹn, và đường link trên sẽ tự hết hạn.',
    '',
    '— Góc Creator',
  ].join('\n');

  const html = shell('Đặt lại mật khẩu', [
    p(`Chào <b>${esc(ten)}</b>,`),
    p(`Có người vừa xin đặt lại mật khẩu ${esc(noi)} cho email này.`),
    btn('Đặt mật khẩu mới', link),
    p('Đường link dùng được <b>một lần</b> và hết hạn sau <b>1 giờ</b>.'),
    // Câu này quan trọng hơn nó trông: người nhận một mail đặt lại mật khẩu mà
    // họ không xin thường hoảng và bấm vào để "kiểm tra" — đúng thứ kẻ lừa đảo
    // muốn. Nói thẳng rằng không làm gì mới là đúng.
    p('<span style="color:#6a6a72;font-size:14px">Nếu không phải anh chị xin, '
      + 'cứ bỏ qua email này. Mật khẩu hiện tại vẫn nguyên vẹn và đường link trên '
      + 'sẽ tự hết hạn.</span>'),
  ]);

  return {
    toEmail: input.email,
    toName: input.name,
    subject: 'Đặt lại mật khẩu — Góc Creator',
    text, html,
    template: 'password_reset',
    refType: 'password_reset',
    refId: input.resetId,
  };
}

/**
 * Thư gửi đường link vào lớp.
 *
 * Đây là thư quan trọng nhất trong cả hệ: nó là thứ DUY NHẤT chuyển đường link
 * riêng tới tay học viên. Thư này không tới thì khách đã trả tiền mà không vào
 * được lớp, và cách duy nhất họ biết phải làm gì là nhắn Zalo hỏi.
 */
export function studentAccessMail(
  env: Env,
  input: { orderId: string; name: string; email: string | null; token: string },
): Mail | null {
  if (!input.email) return null;

  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const link = `${base}/hoc/${input.token}`;
  const ten = input.name.split(' ').slice(-1)[0] || input.name;

  const text = [
    `Chào ${ten},`,
    '',
    'Đây là đường link riêng để anh chị vào lớp Thử thách 21 ngày:',
    link,
    '',
    'Trong đó anh chị nộp bài mỗi ngày, xem nhận xét của team, theo dõi',
    'chuỗi ngày và đổi quà bằng coin tích được.',
    '',
    'GIỮ EMAIL NÀY LẠI. Đường link là chìa khoá vào lớp của riêng anh chị,',
    'đừng chia sẻ cho ai. Mở link lần đầu, ở đầu trang có ô đặt mật khẩu —',
    'đặt xong thì lần sau vào thẳng ' + base + '/dang-nhap, không cần link nữa.',
    '',
    '— Góc Creator',
  ].join('\n');

  const html = shell('Đường link vào lớp của anh chị', [
    p(`Chào <b>${esc(ten)}</b>,`),
    p('Đây là đường link riêng để anh chị vào lớp Thử thách 21 ngày — nộp bài mỗi '
      + 'ngày, xem nhận xét của team, theo dõi chuỗi ngày và đổi quà bằng coin.'),
    btn('Vào lớp ngay', link),
    p('<b>Giữ email này lại.</b> Đường link là chìa khoá vào lớp của riêng anh chị, '
      + 'đừng chia sẻ cho ai.'),
    p('<span style="color:#6a6a72;font-size:14px">Mở link lần đầu, ở đầu trang có ô '
      + `đặt mật khẩu. Đặt xong thì lần sau vào thẳng ${esc(base)}/dang-nhap, không `
      + 'cần tìm lại email này nữa.</span>'),
  ]);

  return {
    toEmail: input.email,
    toName: input.name,
    subject: 'Đường link vào lớp Thử thách 21 ngày — Góc Creator',
    text, html,
    template: 'student_access',
    refType: 'order',
    refId: input.orderId,
  };
}

/** Xác nhận đã nhận hồ sơ cộng tác viên. */
export function affiliateApplicationMail(
  env: Env,
  input: { id: string; name: string; email: string },
): Mail {
  const ten = input.name.split(' ').slice(-1)[0] || input.name;
  const text = [
    `Chào ${ten},`,
    '',
    'Em đã nhận hồ sơ cộng tác viên của anh chị.',
    '',
    'Bên Thành sẽ xem trong 1–2 ngày làm việc. Được duyệt thì anh chị nhận',
    'một email nữa kèm đường link đặt mật khẩu và mã giới thiệu riêng.',
    '',
    'Chưa cần làm gì thêm lúc này.',
    '',
    '— Góc Creator',
  ].join('\n');

  return {
    toEmail: input.email,
    toName: input.name,
    subject: 'Đã nhận hồ sơ cộng tác viên — Góc Creator',
    text,
    html: shell('Đã nhận hồ sơ của anh chị', [
      p(`Chào <b>${esc(ten)}</b>,`),
      p('Em đã nhận hồ sơ cộng tác viên. Bên Thành sẽ xem trong <b>1–2 ngày làm việc</b>.'),
      p('Được duyệt thì anh chị nhận một email nữa, kèm đường link đặt mật khẩu và '
        + 'mã giới thiệu riêng. Chưa cần làm gì thêm lúc này.'),
    ]),
    template: 'affiliate_application',
    refType: 'affiliate',
    refId: input.id,
  };
}

/**
 * Duyệt xong: gửi link đặt mật khẩu.
 *
 * Dùng lại đúng cơ chế password_resets thay vì sinh mật khẩu tạm rồi in ra cho
 * admin chép tay. Mật khẩu tạm phải đi qua Zalo hoặc miệng người, và nó nằm lại
 * ở đó mãi mãi.
 *
 * refId là id PHIẾU đặt lại, không phải id CTV — nếu admin duyệt lại lần nữa
 * (hoặc CTV bị treo rồi mở lại) thì thư thứ hai vẫn gửi được.
 */
export function affiliateApprovedMail(
  env: Env,
  input: { resetId: string; token: string; name: string; email: string; code: string },
): Mail {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const link = `${base}/dat-lai-mat-khau?ma=${encodeURIComponent(input.token)}`;
  const ten = input.name.split(' ').slice(-1)[0] || input.name;
  const linkGioiThieu = `${base}/?ref=${encodeURIComponent(input.code)}`;

  const text = [
    `Chào ${ten},`,
    '',
    'Hồ sơ cộng tác viên của anh chị đã được duyệt.',
    '',
    'Đặt mật khẩu tại đây (link dùng một lần, hết hạn sau 1 giờ):',
    link,
    '',
    `Mã giới thiệu của anh chị: ${input.code}`,
    `Link giới thiệu: ${linkGioiThieu}`,
    '',
    `Đặt mật khẩu xong, anh chị đăng nhập ở ${base}/aff để xem lượt bấm,`,
    'đơn hàng và hoa hồng của mình.',
    '',
    '— Góc Creator',
  ].join('\n');

  return {
    toEmail: input.email,
    toName: input.name,
    subject: 'Hồ sơ cộng tác viên đã được duyệt — Góc Creator',
    text,
    html: shell('Hồ sơ của anh chị đã được duyệt', [
      p(`Chào <b>${esc(ten)}</b>,`),
      p('Đặt mật khẩu để vào portal cộng tác viên. Link dùng <b>một lần</b> và hết '
        + 'hạn sau <b>1 giờ</b>.'),
      btn('Đặt mật khẩu', link),
      p(`Mã giới thiệu của anh chị: <b>${esc(input.code)}</b>`),
      p(`Link giới thiệu: <a href="${esc(linkGioiThieu)}" style="color:#26643f">${esc(linkGioiThieu)}</a>`),
      p(`<span style="color:#6a6a72;font-size:14px">Đặt mật khẩu xong, đăng nhập ở `
        + `${esc(base)}/aff để xem lượt bấm, đơn hàng và hoa hồng.</span>`),
    ]),
    template: 'affiliate_approved',
    refType: 'password_reset',
    refId: input.resetId,
  };
}
