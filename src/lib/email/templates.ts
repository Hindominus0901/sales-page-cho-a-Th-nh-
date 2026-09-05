import type { Env } from '../../types';

export interface Mail {
  toEmail: string;
  toName: string | null;
  subject: string;
  text: string;
  html: string;
  template: 'order_paid' | 'workshop_registered';
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
    'Nếu sau khi học thấy không phù hợp, chính sách hoàn tiền ở đây:',
    `${base}/chinh-sach-hoan-tien`,
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
      p(`Chính sách hoàn tiền: <a href="${base}/chinh-sach-hoan-tien" style="color:#26643f">`
        + '14 ngày, đã nộp ít nhất 3 bài</a>.'),
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
