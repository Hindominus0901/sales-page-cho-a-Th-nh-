(function () {
  var form = document.querySelector('[data-form]');
  if (!form) return;
  var msg = form.querySelector('[data-msg]');
  var btn = form.querySelector('button[type=submit]');

  // Ba vai trò, ba đường API. Học viên và CTV không được phép gọi đường của
  // quản trị, nên tách hẳn ở máy chủ chứ không phải chỉ ở đây.
  var DUONG = {
    hv: '/api/hv/quen-mat-khau',
    ctv: '/api/aff/quen-mat-khau',
    admin: '/api/admin/quen-mat-khau'
  };

  // Đến từ màn hình đăng nhập nào thì chọn sẵn mục đó — người dùng không phải
  // tự hiểu mình thuộc vai nào, và chọn nhầm vai là nhận đúng câu "nếu email
  // này có tài khoản…" mà không bao giờ có thư.
  var vaiTuLink = new URLSearchParams(location.search).get('vai');
  if (vaiTuLink && DUONG[vaiTuLink]) form.querySelector('[data-vai]').value = vaiTuLink;

  function noi(text, mau) {
    msg.textContent = text;
    msg.style.color = mau;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var vai = form.querySelector('[data-vai]').value;
    var email = form.querySelector('[name=email]').value.trim();
    if (!email) return;

    btn.disabled = true;
    noi('Đang gửi…', '#55555c');

    fetch(DUONG[vai] || DUONG.admin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        // Máy chủ cố ý trả cùng một câu dù email có tài khoản hay không, để
        // trang này không thành công cụ dò xem ai có tài khoản. Nên ở đây cũng
        // không được đoán thêm gì.
        noi(d.message || 'Nếu email này có tài khoản, em đã gửi hướng dẫn tới đó.', '#26643f');
        form.querySelector('[name=email]').value = '';
      })
      .catch(function () {
        noi('Không gửi được. Anh chị thử lại giúp em.', '#c8123a');
      })
      .finally(function () { btn.disabled = false; });
  });
})();
