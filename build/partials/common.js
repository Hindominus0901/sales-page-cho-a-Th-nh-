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
        if (c.demo) showDemoBanner();
        if (then) then(c);
      }
      return c;
    })
    .catch(function () { /* API chưa chạy: trang vẫn hiển thị bình thường */ });
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
