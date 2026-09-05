/* Trang /workshop — đăng ký buổi Zoom miễn phí, thay hoàn toàn Google Form. */
(function () {
  'use strict';

  var form = $('#fc2-ws-form');
  if (!form) return;

  var fallback = $('#fc2-ws-fallback');
  var thanks = $('#fc2-ws-thanks');
  var submitBtn = $('#fc2-ws-submit');
  var submitLabel = $('[data-label]', submitBtn);
  var originalLabel = submitLabel.textContent;

  function clearErrors() {
    $$('.fc2-err, .fc2-formerr', form).forEach(function (el) {
      el.classList.remove('fc2-on'); el.textContent = '';
    });
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

  /** 'HH:mm, thứ ... DD/MM/YYYY' theo giờ Việt Nam, từ unix giây. */
  function formatWhen(unixSec) {
    if (!unixSec) return '';
    var d = new Date(unixSec * 1000);
    try {
      return new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
      }).format(d);
    } catch (e) {
      return d.toLocaleString('vi-VN');
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    fallback.hidden = true;

    var data = {};
    ['name', 'phone', 'email', 'field', 'channel', 'daily_time', 'goal', 'stuck', 'website']
      .forEach(function (k) { if (form[k]) data[k] = form[k].value; });

    submitBtn.disabled = true;
    submitLabel.textContent = 'Đang gửi…';

    fetch('/api/workshop/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b.ok) {
          if (b.errors) {
            Object.keys(b.errors).forEach(function (k) { showError(k, b.errors[k]); });
          } else {
            fallback.hidden = false;
            fallback.textContent = b.error || 'Không gửi được, anh chị thử lại giúp Thành.';
          }
          return;
        }

        form.hidden = true;
        thanks.hidden = false;

        var s = b.session || {};
        var when = formatWhen(s.startsAt);
        if (when || s.zoomMeetingId || s.zoomPasscode) {
          $('[data-zoom-box]', thanks).hidden = false;
          $('[data-zoom-when]', thanks).textContent = when ? 'Thời gian: ' + when : '';
          if (s.zoomMeetingId) {
            var idEl = $('[data-zoom-id]', thanks);
            idEl.textContent = 'ID phòng: ' + s.zoomMeetingId;
            idEl.hidden = false;
          }
          if (s.zoomPasscode) {
            var passEl = $('[data-zoom-pass]', thanks);
            passEl.textContent = 'Mật khẩu: ' + s.zoomPasscode;
            passEl.hidden = false;
          }
        }

        // Chỉ hiện nút khi có link thật — không bao giờ hiện nút chết.
        var zoomBtn = $('[data-zoom-btn]', thanks);
        if (s.zoomUrl) { zoomBtn.href = s.zoomUrl; zoomBtn.hidden = false; }
        var zaloBtn = $('[data-zalo-btn]', thanks);
        if (s.zaloGroupUrl) { zaloBtn.href = s.zaloGroupUrl; zaloBtn.hidden = false; }

        thanks.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      })
      .catch(function () {
        fallback.hidden = false;
        fallback.textContent = 'Mất kết nối tới máy chủ. Anh chị kiểm tra mạng rồi thử lại giúp Thành.';
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitLabel.textContent = originalLabel;
      });
  });
})();
