(function () {
  var form = document.querySelector('[data-form]');
  if (!form) return;
  var msg = form.querySelector('[data-msg]');
  var btn = form.querySelector('button[type=submit]');
  var xong = document.querySelector('[data-xong]');

  function noi(text, mau) { msg.textContent = text; msg.style.color = mau; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    btn.disabled = true;
    noi('Đang gửi…', '#55555c');

    var f = new FormData(form);
    fetch('/api/aff/dang-ky', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: f.get('name'), email: f.get('email'),
        phone: f.get('phone'), kenh: f.get('kenh'), website: f.get('website')
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { noi(d.error || 'Không nộp được hồ sơ.', '#c8123a'); return; }
        form.hidden = true;
        xong.hidden = false;
      })
      .catch(function () { noi('Không kết nối được. Anh chị thử lại giúp em.', '#c8123a'); })
      .finally(function () { btn.disabled = false; });
  });
})();
