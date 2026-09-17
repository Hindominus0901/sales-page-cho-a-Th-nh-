/* Tiện ích dùng chung cho cả ba trang. */
var $ = function (sel, root) { return (root || document).querySelector(sel); };
var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
var vnd = function (n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; };

function formatDate(iso) {
  if (!iso) return '';
  var p = String(iso).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

/** Điền số chỗ còn lại và ngày khai giảng vào mọi chỗ đánh dấu trên trang. */
function renderSeats(c) {
  var left = c.course.seatsLeft;
  var total = c.course.seatsTotal;
  var day = formatDate(c.course.startDate);

  $$('[data-seats-line]').forEach(function (el) {
    el.innerHTML = 'Còn <b>' + left + '</b>/' + total + ' chỗ' + (day ? ' · Khai giảng <b>' + day + '</b>' : '');
  });
  $$('[data-seats-badge]').forEach(function (el) {
    el.textContent = left > 0
      ? 'Còn ' + left + '/' + total + ' chỗ' + (day ? ' · khai giảng ' + day : '')
      : 'Lớp đã đủ chỗ — anh chị để lại thông tin để được xếp khoá kế tiếp.';
  });
  $$('[data-price]').forEach(function (el) { el.textContent = vnd(c.course.price); });
}

/** Bản demo: báo rõ ngay trên trang để không ai tưởng đơn đã được lưu. */
function showDemoBanner() {
  if (document.getElementById('fc2-demo-banner')) return;
  var bar = document.createElement('div');
  bar.id = 'fc2-demo-banner';
  bar.textContent = 'BẢN DEMO — đơn đăng ký không được lưu lại và số tài khoản chỉ là ví dụ. Đừng chuyển khoản thật.';
  bar.style.cssText = 'position:relative;z-index:70;background:#8a5a00;color:#fff;font-family:Inter,system-ui,sans-serif;'
    + 'font-size:14px;font-weight:600;line-height:1.5;text-align:center;padding:11px 18px';
  document.body.insertBefore(bar, document.body.firstChild);
}

/** Cất đơn vừa tạo để trang thanh toán dùng lại, không cần hỏi máy chủ. */
function stashOrder(code, data) {
  try { sessionStorage.setItem('fc2:order:' + code, JSON.stringify(data)); } catch (e) { /* bỏ qua */ }
}

function takeStashedOrder(code) {
  try {
    var raw = sessionStorage.getItem('fc2:order:' + code);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function loadSiteConfig(then) {
  return fetch('/api/config')
    .then(function (r) { return r.json(); })
    .then(function (c) {
      if (c && c.ok) {
        renderSeats(c);
        renderLienHe(c);
        if (c.demo) showDemoBanner();
        if (then) then(c);
      }
      return c;
    })
    .catch(function () { /* API chưa chạy: trang vẫn hiển thị bình thường */ });
}

/**
 * Điền Zalo và email hỗ trợ vào chân trang, lấy từ /admin → Cài đặt.
 *
 * Trang được dựng sẵn lúc build từ site.config.json, nên đổi số Zalo phải deploy
 * lại. Đọc thêm ở đây để anh Thành đổi trong quản trị là trang đổi theo ngay.
 * Chưa điền trong quản trị thì giữ nguyên giá trị dựng sẵn, không xoá đi.
 *
 * Đồng thời hiện các khối [data-can-zalo] — những chỗ bảo khách "nhắn Zalo".
 * Không có Zalo thì các khối đó ở ẩn, thay vì chỉ đường tới một nơi không tồn tại.
 */
function renderLienHe(c) {
  var lh = (c && c.contact) || {};
  var soZalo = (lh.zalo || '').trim();
  var mail = (lh.email || '').trim();

  if (soZalo || mail) {
    var html = '';
    if (soZalo) {
      html += '<a href="https://zalo.me/' + encodeURIComponent(soZalo.replace(/\D/g, ''))
        + '" style="color:#26643f;text-decoration:none;font-weight:600">Zalo: '
        + soZalo.replace(/[<>&]/g, '') + '</a>';
    }
    if (mail) {
      html += '<a href="mailto:' + encodeURIComponent(mail)
        + '" style="color:#26643f;text-decoration:none;font-weight:600">'
        + mail.replace(/[<>&]/g, '') + '</a>';
    }
    $$('[data-lien-he]').forEach(function (el) { el.innerHTML = html; });
  }

  $$('[data-can-zalo]').forEach(function (el) {
    if (!soZalo) return;
    el.hidden = false;
    $$('a[data-zalo-link]', el).forEach(function (a) {
      a.href = 'https://zalo.me/' + encodeURIComponent(soZalo.replace(/\D/g, ''));
    });
  });
}

/** Gắn xử lý cho các nút "Sao chép" bên trong một khối. */
function wireCopyButtons(scope) {
  if (!scope) return;
  scope.addEventListener('click', function (e) {
    var btn = e.target.closest('.fc2-copy');
    if (!btn) return;
    var target = $('[data-' + btn.getAttribute('data-copy-target') + ']', scope);
    if (!target) return;
    var text = target.textContent.trim();
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Đã chép';
      btn.classList.add('fc2-done');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('fc2-done'); }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { /* bỏ qua */ });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (err) { /* bỏ qua */ }
      document.body.removeChild(ta);
    }
  });
}

/**
 * Nút dừng cho các dải tự chạy (WCAG 2.2.2 — Pause, Stop, Hide).
 * Hover đã dừng sẵn bằng CSS, nhưng bàn phím và màn hình cảm ứng thì không hover được.
 */
function wireMarqueePause() {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-pause]');
    if (!btn) return;
    var wrap = btn.closest('.fc2-marqwrap');
    if (!wrap) return;
    var paused = wrap.hasAttribute('data-paused');
    if (paused) wrap.removeAttribute('data-paused');
    else wrap.setAttribute('data-paused', '');
    btn.setAttribute('aria-pressed', String(!paused));
    var label = btn.querySelector('[data-pause-label]');
    if (label) label.textContent = paused ? 'Tạm dừng' : 'Chạy tiếp';
  });

  // Người dùng đã bật "giảm chuyển động" thì dừng sẵn, không cần bấm
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      $$('.fc2-marqwrap').forEach(function (w) {
        w.setAttribute('data-paused', '');
        var b = w.querySelector('[data-pause]');
        if (b) {
          b.setAttribute('aria-pressed', 'true');
          var l = b.querySelector('[data-pause-label]');
          if (l) l.textContent = 'Chạy tiếp';
        }
      });
    }
  } catch (e) { /* bỏ qua */ }
}

/* ==========================================================================
   BẮT MÃ GIỚI THIỆU  ?ref=...
   ==========================================================================

   ĐÂY LÀ MẮT XÍCH TỪNG BỊ ĐỨT HOÀN TOÀN.

   Toàn bộ hệ thống hoa hồng phía máy chủ chạy đúng và có bài test: /api/ref
   ghi lượt bấm rồi đặt cookie, /api/leads đọc cookie đó, webhook ngân hàng
   sinh dòng hoa hồng 20%. Nhưng KHÔNG MỘT TRANG NÀO của bộ dựng này gọi tới
   /api/ref — đoạn bắt ?ref= chỉ tồn tại ở apps/funnel/static/funnel.js, tức
   bộ dựng của TEMPLATE, không phải bộ đang chạy (package.json: build:funnel
   trỏ vào apps/funnel-gc).

   Nên dây chuyền đứt ngay mắt đầu tiên:
     khách bấm  /?ref=ABC  ->  không ai gọi /api/ref
       -> không có cookie giới thiệu
       -> cũng không có /api/track nên sessions.landing_url để rỗng
       -> refCodeFromRequest và refCodeFromSession đều trả chuỗi rỗng
       -> creditReferral không bao giờ chạy
       -> bảng commissions không bao giờ có dòng nào.

   Đại lý chia sẻ link, bạn họ mua thật, cổng đại lý hiện 0 lượt / 0 người /
   0đ. Không lỗi, không cảnh báo. 20% hoa hồng mà trang bán hàng hứa thì
   không ai nhận được.

   Bộ test không bắt được vì nó gọi thẳng POST /api/ref rồi POST /api/leads —
   một con đường không trang nào đi. Trang thật nộp form qua /api/register.

   GỌI CẢ KHI KHÔNG CÓ ?ref=: lệnh này còn ghi landing_url, utm_* và fbclid
   vào sessions, tức là nguồn quảng cáo. Trang Doanh thu đọc utm_source để
   biết tiền về từ đâu; không ghi thì cột đó vĩnh viễn trống.
   ========================================================================== */
var REF_LUU = 'gc_ref_attr';

function refThuocTinh() {
  var p = new URLSearchParams(location.search);
  return {
    landing_url: location.href.slice(0, 500),
    referrer: String(document.referrer || '').slice(0, 300),
    utm_source: p.get('utm_source') || '',
    utm_medium: p.get('utm_medium') || '',
    utm_campaign: p.get('utm_campaign') || '',
    utm_content: p.get('utm_content') || '',
    utm_term: p.get('utm_term') || '',
    fbclid: p.get('fbclid') || '',
    gclid: p.get('gclid') || '',
  };
}

function batMaGioiThieu() {
  var attr = refThuocTinh();
  var ma = (new URLSearchParams(location.search).get('ref') || '').trim();

  // Nhớ lại mã của lần vào trước trong CÙNG trình duyệt. Cookie phía máy chủ
  // mới là nguồn thật, nhưng nó có thể mất (trình duyệt xoá, chế độ ẩn danh)
  // trong khi người ta còn đang đọc trang. Giữ thêm một bản ở đây để lần điều
  // hướng sau vẫn báo lại được cho máy chủ.
  if (!ma) {
    try { ma = sessionStorage.getItem(REF_LUU) || ''; } catch (e) { ma = ''; }
  } else {
    try { sessionStorage.setItem(REF_LUU, ma); } catch (e) { /* bỏ qua */ }
  }

  // HAI ĐƯỜNG KHÁC NHAU, ĐỪNG GỘP.
  //
  // /api/ref BẮT BUỘC có mã hợp lệ — thiếu là nó trả 400 và không ghi gì cả
  // (worker/src/routes/affiliate.js:75-78). Nên nguồn quảng cáo phải đi qua
  // /api/track, đường vốn dành cho việc đó; cả hai cùng gọi upsertSession nên
  // landing_url và utm_* vào đúng một chỗ.
  //
  // Việc này cũng vá luôn cột "Nguồn" đang trống trơn trong trang Doanh thu:
  // trang đó đọc sessions.utm_source, mà trước giờ không ai ghi vào đó.
  fetch('/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'page_view', page: location.pathname.slice(0, 60), attribution: attr }),
  }).catch(function () { /* đo lường hỏng thì thôi, không phiền người đọc trang */ });

  if (!ma) return;

  fetch('/api/ref', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: ma,
      landing_url: attr.landing_url,
      referrer: attr.referrer,
      attribution: attr,
    }),
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d && d.valid && d.referrer_name) {
      var el = document.querySelector('[data-nguoi-gioi-thieu]');
      if (el) {
        el.textContent = 'Bạn được ' + d.referrer_name + ' giới thiệu tới chương trình này.';
        el.removeAttribute('hidden');
      }
    }
  }).catch(function () {
    // Im lặng là ĐÚNG ở đây: người đang đọc trang bán hàng không làm gì được
    // với một lỗi mạng của việc ghi nhận giới thiệu, và một hộp lỗi hiện lên
    // giữa trang bán hàng thì hại nhiều hơn lợi.
  });
}

try { batMaGioiThieu(); } catch (e) { /* không được để hỏng cả trang */ }
