/* Trang /dang-ky — gửi thông tin rồi chuyển sang trang thanh toán. */
(function () {
  'use strict';

  var form = $('#fc2-form');
  if (!form) return;

  var fallback = $('#fc2-fallback');
  var submitBtn = $('#fc2-submit');
  var submitLabel = $('[data-label]', submitBtn);

  loadSiteConfig();

  var LABELS = {
    name: 'Họ và tên', phone: 'Số điện thoại', email: 'Email',
    field: 'Lĩnh vực đang làm', note: 'Điều mong muốn nhất',
  };

  /** Bảng tóm tắt lỗi ở đầu form, mỗi dòng nhảy được tới đúng ô sai. */
  function showErrorSummary(errors) {
    var box = $('#fc2-errsummary');
    var list = $('[data-errlist]', box);
    var keys = Object.keys(errors).filter(function (k) { return k.charAt(0) !== '_'; });
    if (!keys.length) { box.classList.remove('fc2-on'); return; }
    list.innerHTML = keys.map(function (k) {
      return '<li><a href="#fc2-' + k + '">' + (LABELS[k] || k) + ': ' + errors[k] + '</a></li>';
    }).join('');
    box.classList.add('fc2-on');
    box.focus();
  }

  function clearErrors() {
    var box = $('#fc2-errsummary');
    if (box) { box.classList.remove('fc2-on'); $('[data-errlist]', box).innerHTML = ''; }
    $$('.fc2-err, .fc2-formerr', form).forEach(function (el) { el.classList.remove('fc2-on'); el.textContent = ''; });
    $$('.fc2-input', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
  }

  function showError(field, message) {
    var box = $('[data-err="' + field + '"]', form);
    if (box) { box.textContent = message; box.classList.add('fc2-on'); }
    var input = $('[name="' + field + '"]', form);
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      if (!$('[aria-invalid="true"]', form) || $('[aria-invalid="true"]', form) === input) input.focus();
    }
  }

  function utmParams() {
    var out = {};
    var qs = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].forEach(function (k) {
      if (qs.get(k)) out[k] = qs.get(k).slice(0, 120);
    });
    return Object.keys(out).length ? out : null;
  }

  /** Kiểm tra tại chỗ khi rời ô — bắt lỗi sớm thay vì dồn hết tới lúc bấm gửi. */
  var CHECKS = {
    name: function (v) { return v.trim().length >= 2 ? '' : 'Anh chị vui lòng nhập họ tên.'; },
    phone: function (v) {
      var p = v.replace(/[^\d+]/g, '').replace(/^\+84/, '0').replace(/^84(?=\d{9}$)/, '0');
      return /^0[35789]\d{8}$/.test(p) ? '' : 'Số điện thoại không hợp lệ (ví dụ: 0912345678).';
    },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Email không hợp lệ.'; },
    field: function (v) { return v.trim().length >= 2 ? '' : 'Anh chị cho biết mình đang làm lĩnh vực gì.'; },
    note: function (v) { return v.trim().length >= 5 ? '' : 'Anh chị viết vài chữ về điều mình mong muốn nhất.'; },
  };

  Object.keys(CHECKS).forEach(function (key) {
    var input = form[key];
    if (!input) return;
    input.addEventListener('blur', function () {
      if (!input.value.trim()) return;           // chưa điền thì chưa vội báo
      var msg = CHECKS[key](input.value);
      if (msg) showError(key, msg);
      else {
        var box = $('[data-err="' + key + '"]', form);
        if (box) { box.classList.remove('fc2-on'); box.textContent = ''; }
        input.removeAttribute('aria-invalid');
      }
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    fallback.hidden = true;

    var data = {
      name: form.name.value,
      phone: form.phone.value,
      email: form.email.value,
      field: form.field.value,
      note: form.note.value,
      website: form.website.value,
      source: 'landing',
      utm: utmParams(),
    };

    submitBtn.disabled = true;
    submitLabel.textContent = 'Đang xử lý…';

    fetch('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b.ok) {
          if (b.errors) {
            Object.keys(b.errors).forEach(function (k) { showError(k, b.errors[k]); });
            showErrorSummary(b.errors);
          }
          if (b.soldOut || !b.errors) {
            fallback.hidden = false;
            fallback.textContent = b.error || 'Không gửi được đăng ký, anh chị thử lại giúp Thành.';
          }
          return;
        }
        // Cất sẵn để trang sau hiện ngay, khỏi phải hỏi lại máy chủ
        stashOrder(b.order.code, { order: b.order, payment: b.payment, demo: b.demo });
        // Sang bước 2 — mã đơn nằm trên đường dẫn để anh chị mở lại được
        location.href = '/thanh-toan?ma=' + encodeURIComponent(b.order.code);
      })
      .catch(function () {
        fallback.hidden = false;
        fallback.textContent = 'Mất kết nối tới máy chủ. Anh chị kiểm tra mạng rồi thử lại giúp Thành.';
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitLabel.textContent = 'Tiếp tục tới bước thanh toán';
      });
  });
})();
