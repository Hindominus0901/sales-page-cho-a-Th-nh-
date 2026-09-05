/* Trang /tra-cuu — tìm lại đơn bằng số điện thoại. */
(function () {
  'use strict';

  var form = $('[data-form]');
  if (!form) return;

  var LABEL = {
    pending:        { text: 'Chờ chuyển khoản',      color: '#8a5a00', bg: 'rgba(240,165,0,.14)' },
    partially_paid: { text: 'Đã nhận một phần',      color: '#8a5a00', bg: 'rgba(240,165,0,.14)' },
    paid:           { text: 'Đã thanh toán',         color: '#1f6b3c', bg: 'rgba(47,122,77,.14)' },
    overpaid:       { text: 'Đã thanh toán (thừa)',  color: '#1f6b3c', bg: 'rgba(47,122,77,.14)' },
    expired:        { text: 'Đã quá hạn giữ chỗ',    color: '#55555c', bg: 'rgba(25,25,25,.07)' },
    cancelled:      { text: 'Đã huỷ',                color: '#55555c', bg: 'rgba(25,25,25,.07)' }
  };

  var vndFmt = function (n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    var msg = $('[data-msg]');
    var old = btn.textContent;

    btn.disabled = true;
    btn.textContent = 'Đang tìm…';
    msg.textContent = '';
    $('[data-results]').innerHTML = '';
    $('[data-help]').hidden = true;

    fetch('/api/tra-cuu', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: form.phone.value })
    })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: 'Mất kết nối. Anh chị thử lại giúp em.' }; })
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = old;

        if (!res.ok) {
          msg.style.color = '#c8123a';
          msg.textContent = res.error || 'Chưa tìm được, anh chị thử lại giúp em.';
          return;
        }
        if (!res.orders.length) {
          $('[data-help]').hidden = false;
          return;
        }
        render(res.orders);
      });
  });

  function render(orders) {
    $('[data-results]').innerHTML = orders.map(function (o) {
      var s = LABEL[o.status] || { text: o.status, color: '#55555c', bg: 'rgba(25,25,25,.07)' };
      /* Đơn chưa trả xong thì nút dẫn thẳng sang trang thanh toán — ở đó đã có
         sẵn QR cho đúng phần còn thiếu. Đơn đã xong thì vẫn cho mở lại để xem. */
      var chuaXong = o.status === 'pending' || o.status === 'partially_paid';
      return '<div class="fc2-shadow" style="background:#fff;border-radius:20px;padding:20px 22px">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">'
        +   '<span style="font-size:22px;font-weight:800;letter-spacing:.05em">' + o.code + '</span>'
        +   '<span style="font-size:13px;font-weight:700;padding:5px 12px;border-radius:999px;color:'
        +     s.color + ';background:' + s.bg + '">' + s.text + '</span>'
        + '</div>'
        + '<div style="font-size:15px;color:#55555c;margin-top:8px">'
        +   vndFmt(o.amount)
        +   (o.remaining > 0 && o.amountPaid > 0
              ? ' · đã nhận ' + vndFmt(o.amountPaid) + ', còn thiếu <b style="color:#8a5a00">' + vndFmt(o.remaining) + '</b>'
              : '')
        + '</div>'
        + '<a href="/thanh-toan/' + encodeURIComponent(o.code) + '" class="fc2-cta" style="display:inline-flex;'
        +   'align-items:center;height:46px;padding:0 20px;margin-top:14px;background:'
        +   (chuaXong ? '#2f7a4d' : 'transparent') + ';color:' + (chuaXong ? '#fff' : '#26643f')
        +   ';border:' + (chuaXong ? '0' : '1px solid rgba(47,122,77,.4)')
        +   ';font-weight:700;font-size:15px;border-radius:14px;text-decoration:none">'
        +   (chuaXong ? 'Chuyển khoản nốt' : 'Xem đơn') + '</a>'
        + '</div>';
    }).join('');
  }
})();
