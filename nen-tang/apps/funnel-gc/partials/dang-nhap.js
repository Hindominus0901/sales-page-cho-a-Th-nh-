(function () {
  var form = document.querySelector('[data-form]');
  if (!form) return;
  var msg = form.querySelector('[data-msg]');
  var btn = form.querySelector('button[type=submit]');

  function noi(text, mau) { msg.textContent = text; msg.style.color = mau; }

  // Đã đăng nhập rồi mà mở lại trang này thì đưa thẳng vào lớp — đứng trước
  // một form đăng nhập trong khi đang đăng nhập là khó hiểu.
  fetch('/api/hv/me', { cache: 'no-store' })
    .then(function (r) { if (r.ok) location.href = '/hoc'; })
    .catch(function () {});

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    btn.disabled = true;
    noi('Đang kiểm tra…', '#55555c');

    fetch('/api/hv/dang-nhap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: form.querySelector('[name=email]').value.trim(),
        password: form.querySelector('[name=password]').value
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { noi(d.error || 'Không đăng nhập được.', '#c8123a'); return; }
        location.href = '/hoc';
      })
      .catch(function () { noi('Không kết nối được. Anh chị thử lại giúp em.', '#c8123a'); })
      .finally(function () { btn.disabled = false; });
  });
})();
