/**
 * Mau email, toan bo tieng Viet.
 *
 * Viet bang chuoi thuong, khong dung MJML/react-email: vai cai email khong dang
 * de them ca mot chuoi build va mot cay dependency.
 *
 * Quy tac: khong nhung anh tu ben ngoai, khong dung JavaScript, moi mau deu co
 * ban chu thuan (text) - nhieu app mail Viet Nam chan HTML mac dinh.
 */
/**
 * Danh tinh thuong hieu. renderMail(ten, vars) nhan vars.brand tu
 * rc.cfg.brand (sinh tu brand/brand.json). Khong truyen thi dung ban trung
 * tinh ben duoi - email van gui duoc, chi la khong mang ten ai.
 */
const BRAND_TRUNG_TINH = {
  name: 'Chương trình',
  legalName: 'Ban tổ chức',
  productLine: 'chương trình',
  color: '#111111',
};
const layThuongHieu = (vars) => ({ ...BRAND_TRUNG_TINH, ...(vars?.brand || {}) });

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const layout = (title, inner, th = BRAND_TRUNG_TINH) => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#faf7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#121212">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eee">
    <tr><td style="padding:24px 28px 8px">
      <div style="font-weight:800;font-size:18px;color:${th.color}">${escapeHtml(th.name)}</div>
    </td></tr>
    <tr><td style="padding:8px 28px 28px">${inner}</td></tr>
  </table>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8b8794;text-align:center">
    Email này gửi tự động từ hệ thống của ${escapeHtml(th.legalName)}. Nếu bạn không yêu cầu, có thể bỏ qua.
  </p>
</body></html>`;

const codeBlock = (code, th = BRAND_TRUNG_TINH) => `
  <div style="margin:20px 0;padding:18px;border-radius:12px;background:#fff0f8;text-align:center">
    <div style="font-size:32px;letter-spacing:8px;font-weight:800;color:${th.color}">${escapeHtml(code)}</div>
  </div>`;

const button = (href, label, th = BRAND_TRUNG_TINH) => `
  <div style="margin:24px 0;text-align:center">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 28px;border-radius:999px;background:${th.color};color:#fff;text-decoration:none;font-weight:700">${escapeHtml(label)}</a>
  </div>`;

export const templates = {
  otp_register: ({ code, minutes, th }) => ({
    subject: `${code} là mã xác nhận email của bạn`,
    html: layout('Xác nhận email', `
      <h1 style="font-size:20px;margin:0 0 8px">Xác nhận email của bạn</h1>
      <p style="margin:0;color:#5a5661;font-size:15px">Nhập mã này để hoàn tất đăng ký:</p>
      ${codeBlock(code, th)}
      <p style="margin:0;color:#8b8794;font-size:13px">Mã có hiệu lực trong ${minutes} phút và chỉ dùng được một lần.
      Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.</p>`, th),
    text: `Ma xac nhan email cua ban: ${code}\n`
      + `Ma co hieu luc trong ${minutes} phut va chi dung duoc mot lan.\n`
      + 'Neu ban khong dang ky tai khoan, hay bo qua email nay.',
  }),

  password_reset: ({ url, minutes, th }) => ({
    subject: 'Đặt lại mật khẩu',
    html: layout('Đặt lại mật khẩu', `
      <h1 style="font-size:20px;margin:0 0 8px">Đặt lại mật khẩu</h1>
      <p style="margin:0;color:#5a5661;font-size:15px">Bấm nút bên dưới để tạo mật khẩu mới.</p>
      ${button(url, 'Đặt mật khẩu mới', th)}
      <p style="margin:0;color:#8b8794;font-size:13px">Link có hiệu lực trong ${minutes} phút và chỉ dùng được một lần.
      <strong>Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này</strong> — mật khẩu hiện tại vẫn nguyên.</p>
      <p style="margin:12px 0 0;color:#8b8794;font-size:12px;word-break:break-all">Nút không bấm được? Dán link này vào trình duyệt:<br>${escapeHtml(url)}</p>`, th),
    text: `Dat lai mat khau: ${url}\n`
      + `Link co hieu luc trong ${minutes} phut va chi dung duoc mot lan.\n`
      + 'Neu ban khong yeu cau doi mat khau, hay bo qua email nay.',
  }),

  // Gui ngay sau khi dien form o trang ban hang. Day thuong la email DAU TIEN
  // he thong gui cho ho, nen phai noi ro dang o dau va tai sao co thu nay -
  // khong thi vao spam hoac bi bao cao.
  invite_app: ({ url, name, days, refUrl, refCode, refRate, th }) => ({
    subject: 'Tài khoản của bạn đã sẵn sàng — đặt mật khẩu để vào lớp',
    html: layout('Tài khoản đã sẵn sàng', `
      <h1 style="font-size:20px;margin:0 0 8px">${name ? `${escapeHtml(name)} ơi, ` : ''}tài khoản của bạn đã sẵn sàng</h1>
      <p style="margin:0;color:#5a5661;font-size:15px">Bạn vừa đăng ký chương trình <strong>${escapeHtml(th.productLine)}</strong>.
      Cùng với đó, hệ thống đã tạo sẵn cho bạn một tài khoản trên nền tảng học tập — nơi có bài học,
      thử thách, cộng đồng và bảng xếp hạng.</p>
      <p style="margin:14px 0 0;color:#5a5661;font-size:15px">Chỉ còn một bước: đặt mật khẩu.</p>
      ${button(url, 'Đặt mật khẩu và vào lớp', th)}
      <p style="margin:0;color:#8b8794;font-size:13px">Link có hiệu lực trong ${days} ngày.
      Bạn cũng có thể bấm <strong>Đăng nhập bằng Google</strong> ở trang đăng nhập nếu email này là Gmail —
      khỏi cần nhớ thêm mật khẩu nào.</p>
      <p style="margin:12px 0 0;color:#8b8794;font-size:12px;word-break:break-all">Nút không bấm được? Dán link này vào trình duyệt:<br>${escapeHtml(url)}</p>
      ${refUrl ? `
      <div style="margin:22px 0 0;padding:16px 18px;border-radius:14px;background:#fdf4fa;border:1px dashed ${th.color}55">
        <div style="font-size:15px;font-weight:700;color:#1a1815">Link giới thiệu riêng của bạn</div>
        <p style="margin:6px 0 0;color:#5a5661;font-size:14px">Ai đăng ký qua link này được tính cho bạn.
        Người mua <strong>${escapeHtml(th.productLine)}</strong> qua link thì bạn nhận
        <strong style="color:${th.color}">${refRate}% hoa hồng</strong>.</p>
        <p style="margin:10px 0 0;padding:10px 12px;border-radius:10px;background:#fff;border:1px solid rgba(0,0,0,.08);
        font-size:13px;word-break:break-all"><a href="${escapeHtml(refUrl)}" style="color:${th.color};font-weight:700;text-decoration:none">${escapeHtml(refUrl)}</a></p>
        <p style="margin:8px 0 0;color:#8b8794;font-size:12px">Mã của bạn: <strong>${escapeHtml(refCode)}</strong>. Giữ nguyên cả đường link khi chia sẻ nhé.</p>
      </div>` : ''}`, th),
    text: `${name ? name + ' oi, ' : ''}tai khoan cua ban da san sang.
`
      + `Ban vua dang ky chuong trinh ${th.productLine}. He thong da tao san mot tai khoan
`
      + `tren nen tang hoc tap. Chi con mot buoc: dat mat khau.

`
      + `${url}

`
      + `Link co hieu luc trong ${days} ngay. Neu email nay la Gmail, ban co the bam
`
      + `"Dang nhap bang Google" o trang dang nhap thay vi dat mat khau.`
      + (refUrl ? `

LINK GIOI THIEU RIENG CUA BAN
${refUrl}
Ai dang ky qua link nay duoc tinh cho ban. Nguoi mua qua link thi ban nhan ${refRate}% hoa hong.` : ''),
  }),

  // Gui NGAY khi ngan hang bao tien ve. Truoc day khong co la thu nao o day:
  // khach chuyen 399k xong hop thu im lang hoan toan, khong biet he thong da
  // nhan hay chua, nen ho nhan tin hoi qua Zalo - viec dang le tu tra loi duoc.
  //
  // `url` co the rong: nguoi da co mat khau thi chi can duong dang nhap, khong
  // gui them link dat lai mat khau (gui la mo mot cua khong ai xin).
  order_paid: ({ name, code, amount, url, appUrl, th }) => ({
    subject: `Đã nhận thanh toán — vé ${escapeHtml(th.productLine)} của bạn đã mở`,
    html: layout('Đã nhận thanh toán', `
      <h1 style="font-size:20px;margin:0 0 8px">${name ? `${escapeHtml(name)} ơi, ` : ''}đã nhận được thanh toán</h1>
      <p style="margin:0;color:#5a5661;font-size:15px">Hệ thống vừa ghi nhận <strong>${escapeHtml(amount)}</strong>
      cho đơn <strong>${escapeHtml(code)}</strong>. Vé <strong>${escapeHtml(th.productLine)}</strong> của bạn đã được mở —
      toàn bộ bài học, thử thách và quà tặng giờ đã mở khoá trong tài khoản.</p>
      ${button(url || appUrl, url ? 'Đặt mật khẩu và vào lớp' : 'Vào lớp ngay', th)}
      ${url ? `<p style="margin:0;color:#8b8794;font-size:13px">Nếu email này là Gmail, bạn có thể bấm
      <strong>Đăng nhập bằng Google</strong> ở trang đăng nhập thay vì đặt mật khẩu.</p>` : ''}
      <p style="margin:12px 0 0;color:#8b8794;font-size:12px;word-break:break-all">Nút không bấm được? Dán link này vào trình duyệt:<br>${escapeHtml(url || appUrl)}</p>
      <p style="margin:18px 0 0;padding:12px 14px;border-radius:10px;background:#f6f5f8;color:#5a5661;font-size:13px">
      Giữ lại thư này làm biên nhận. Có gì chưa đúng, nhắn Zalo cho ${escapeHtml(th.hostName)} kèm mã đơn <strong>${escapeHtml(code)}</strong>.</p>`, th),
    text: `${name ? name + ' oi, ' : ''}da nhan duoc thanh toan.

`
      + `He thong vua ghi nhan ${amount} cho don ${code}. Ve ${th.productLine} cua ban da duoc mo -
`
      + `toan bo bai hoc, thu thach va qua tang gio da mo khoa trong tai khoan.

`
      + `${url || appUrl}

`
      + `Giu lai thu nay lam bien nhan. Co gi chua dung, nhan Zalo cho ${th.hostName} kem ma don ${code}.`,
  }),

  // Gui 01:00 gio VN cho nguoi co chuoi >= 3 ngay va hoat dong gan nhat la hom
  // qua. Chu y giong dieu: nhac, khong trach. Nguoi doc dang o phia SAP giu
  // duoc, khong phai phia da that bai.
  streak_reminder: ({ name, streak, appUrl, th }) => ({
    subject: `Chuỗi ${streak} ngày của bạn đang chờ hôm nay`,
    html: layout('Giữ chuỗi ngày', `
      <h1 style="font-size:20px;margin:0 0 8px">🔥 ${streak} ngày liên tục</h1>
      <p style="margin:0;color:#5a5661;font-size:15px">${name ? escapeHtml(name) + ' ơi, c' : 'C'}huỗi của bạn
      vẫn đang chạy. Hôm nay chưa có hoạt động nào được ghi nhận — làm một việc bất kỳ trước nửa đêm
      là chuỗi tiếp tục.</p>
      <p style="margin:14px 0 0;color:#5a5661;font-size:15px">Một bài content, một cuộc gọi, một bài tập.
      Việc nhỏ nhất cũng tính.</p>
      ${button(appUrl, 'Ghi nhận hoạt động', th)}
      <p style="margin:0;color:#8b8794;font-size:13px">Không muốn nhận email nhắc? Trả lời thư này báo chúng tôi một câu.</p>`, th),
    text: `${name ? name + ' oi, c' : 'C'}huoi ${streak} ngay cua ban van dang chay.
`
      + `Hom nay chua co hoat dong nao duoc ghi nhan - lam mot viec bat ky truoc nua dem
`
      + `la chuoi tiep tuc.

${appUrl}`,
  }),

  // Gui truoc buoi live mot ngay, CHI cho nguoi da giu cho.
  event_reminder: ({ name, title, startsAt, joinUrl, th }) => {
    // Gio Viet Nam, khong phai UTC - nguoi doc o Viet Nam.
    const d = new Date(startsAt);
    const gio = Number.isNaN(d.getTime())
      ? ''
      : new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(11, 16);
    return {
      subject: `Ngày mai: ${title}`,
      html: layout('Nhắc buổi live', `
        <h1 style="font-size:20px;margin:0 0 8px">📅 ${escapeHtml(title)}</h1>
        <p style="margin:0;color:#5a5661;font-size:15px">Diễn ra <strong>ngày mai</strong>${gio ? ` lúc <strong>${gio}</strong>` : ''}.
        Bạn đã giữ chỗ buổi này.</p>
        <p style="margin:14px 0 0;color:#5a5661;font-size:15px">Vào sớm vài phút để không lỡ phần đầu.</p>
        ${button(joinUrl, 'Xem chi tiết buổi học', th)}`, th),
      text: `Ngay mai${gio ? ' luc ' + gio : ''}: ${title}
`
        + `Ban da giu cho buoi nay. Vao som vai phut de khong lo phan dau.

${joinUrl}`,
    };
  },

  welcome: ({ appUrl, th }) => ({
    subject: `Chào mừng bạn tới cộng đồng ${th.name}`,
    html: layout('Chào mừng', `
      <h1 style="font-size:20px;margin:0 0 8px">Tài khoản đã sẵn sàng</h1>
      <p style="margin:0;color:#5a5661;font-size:15px">Từ giờ bạn có thể nộp hoạt động, tham gia thử thách,
      tích XP và xu để đổi quà.</p>
      ${button(appUrl, 'Vào cộng đồng', th)}`, th),
    text: `Tai khoan cua ban da san sang. Vao cong dong: ${appUrl}`,
  }),
};

/** @returns { subject, html, text } */
export function renderMail(name, vars) {
  const fn = templates[name];
  if (!fn) throw new Error(`Khong co mau email "${name}"`);
  return fn({ ...vars, th: layThuongHieu(vars) });
}
