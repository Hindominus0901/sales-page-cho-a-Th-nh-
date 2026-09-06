(function () {
  var form = document.querySelector('[data-form]');
  if (!form) return;
  var msg = form.querySelector('[data-msg]');
  var btn = form.querySelector('button[type=submit]');
  var xong = document.querySelector('[data-xong]');
  var thieu = document.querySelector('[data-thieu-ma]');

  var ma = new URLSearchParams(location.search).get('ma');
  if (!ma) { thieu.hidden = false; return; }
  form.hidden = false;

  // Nơi đăng nhập của từng vai trò. Máy chủ trả về vai sau khi đặt lại xong,
  // nên người dùng được đưa thẳng tới đúng cửa của mình thay vì phải tự tìm.
  var CUA = { admin: '/admin', affiliate: '/aff', student: '/dang-nhap' };

  function noi(text, mau) { msg.textContent = text; msg.style.color = mau; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var mk = form.querySelector('[name=matKhau]').value;
    var lai = form.querySelector('[name=lai]').value;

    if (mk !== lai) { noi('Hai ô mật khẩu chưa giống nhau.', '#c8123a'); return; }
    if (mk.length < 12) {
      noi('Mật khẩu phải từ 12 ký tự trở lên — hiện mới ' + mk.length + '.', '#c8123a');
      return;
    }

    btn.disabled = true;
    noi('Đang đặt…', '#55555c');

    fetch('/api/dat-lai-mat-khau', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ma: ma, matKhau: mk })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { noi(d.error || 'Không đặt được mật khẩu.', '#c8123a'); return; }
        form.hidden = true;
        document.querySelector('[data-di-toi]').href = CUA[d.vai] || '/';
        xong.hidden = false;
      })
      .catch(function () { noi('Không đặt được. Anh chị thử lại giúp em.', '#c8123a'); })
      .finally(function () { btn.disabled = false; });
  });
})();
