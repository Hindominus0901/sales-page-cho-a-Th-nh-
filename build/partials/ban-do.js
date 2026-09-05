/* Trang /ban-do-21-ngay — form xin lead (tên + Zalo), đổi lấy tài liệu + mời vào Summit. */
(function () {
  'use strict';

  var form = $('#fc2-lead-form');
  if (!form) return;

  var fallback = $('#fc2-lead-fallback');
  var thanks = $('#fc2-lead-thanks');
  var submitBtn = $('#fc2-lead-submit');
  var submitLabel = $('[data-label]', submitBtn);

  function clearErrors() {
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

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    fallback.hidden = true;

    var data = {
      name: form.name.value,
      phone: form.phone.value,
      email: form.email.value,
      website: form.website.value,
      magnet: 'ban-do-21-ngay',
      source: 'ban-do-21-ngay',
      utm: utmParams(),
    };

    submitBtn.disabled = true;
    submitLabel.textContent = 'Đang gửi…';

    fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b.ok) {
          if (b.errors) Object.keys(b.errors).forEach(function (k) { showError(k, b.errors[k]); });
          if (!b.errors) {
            fallback.hidden = false;
            fallback.textContent = b.error || 'Không gửi được, anh chị thử lại giúp Thành.';
          }
          return;
        }

        form.hidden = true;
        thanks.hidden = false;

        var dl = $('[data-download-btn]', thanks);
        if (b.downloadUrl) {
          dl.href = b.downloadUrl;
          dl.hidden = false;
        }
        var zalo = $('[data-zalo-btn]', thanks);
        if (b.zaloGroupUrl) {
          zalo.href = b.zaloGroupUrl;
          zalo.hidden = false;
        }
      })
      .catch(function () {
        fallback.hidden = false;
        fallback.textContent = 'Mất kết nối tới máy chủ. Anh chị kiểm tra mạng rồi thử lại giúp Thành.';
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitLabel.textContent = 'Nhận Bản Đồ 21 Ngày miễn phí';
      });
  });
})();
