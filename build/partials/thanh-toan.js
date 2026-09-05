/* Trang /thanh-toan/GCXXXXXX — QR chuyển khoản, tự nhận biết khi tiền về. */
(function () {
  'use strict';

  var states = {
    loading: $('[data-state="loading"]'),
    error: $('[data-state="error"]'),
    paid: $('[data-state="paid"]'),
    pay: $('[data-state="pay"]'),
  };
  if (!states.loading) return;

  function show(name) {
    Object.keys(states).forEach(function (k) { states[k].hidden = k !== name; });
  }

  function fail(message) {
    $('[data-error-message]').textContent = message;
    show('error');
  }

  /* Mã đơn nằm trên đường dẫn (/thanh-toan/GCXXXXXX) nên khách mở lại trang
     bất cứ lúc nào bằng chính đường link đó. Vẫn nhận ?ma= để link cũ đã gửi
     cho khách không bị chết. */
  var code = (location.pathname.match(/\/thanh-toan\/([A-Za-z0-9]+)/) || [])[1]
    || new URLSearchParams(location.search).get('ma');
  if (!code) {
    fail('Đường dẫn thiếu mã đơn. Anh chị đăng ký lại giúp Thành nhé.');
    return;
  }
  code = code.toUpperCase();

  wireCopyButtons(states.pay);
  loadSiteConfig();

  var polls = 0;
  var timer = null;

  function load(isPoll) {
    return fetch('/api/order/' + encodeURIComponent(code), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b.ok) { if (!isPoll) fail(b.error || 'Không tìm thấy đơn đăng ký với mã này.'); return; }

        // 'overpaid' cũng là đã trả đủ — khách chuyển thừa vẫn phải được vào lớp,
        // phần thừa để bên Thành hoàn lại, không giữ khách ở màn hình chờ.
        if (b.order.status === 'paid' || b.order.status === 'overpaid') {
          stop();
          $('[data-paid-code]').textContent = 'Mã đơn: ' + b.order.code;
          show('paid');
          return;
        }
        if (b.order.status === 'cancelled' || b.order.status === 'refunded') {
          stop();
          fail('Đơn đăng ký này đã bị huỷ. Anh chị đăng ký lại hoặc nhắn Zalo để được hỗ trợ.');
          return;
        }
        if (!b.payment || !b.payment.accountNo) {
          stop();
          fail('Chưa cấu hình tài khoản nhận tiền. Anh chị nhắn Zalo để được hướng dẫn chuyển khoản.');
          return;
        }

        render(b.order, b.payment);
        show('pay');
      });
  }

  function render(order, payment) {
    $('[data-order-code]').textContent = order.code;
    $('[data-order-code-inline]').textContent = order.code;
    $('[data-order-name]').textContent = order.name;
    $('[data-qr]').src = payment.qrUrl;
    $('[data-bank-name]').textContent = payment.bankName || '—';
    $('[data-bank-account]').textContent = payment.accountNo || '—';
    $('[data-bank-holder]').textContent = payment.accountName || '—';
    $('[data-amount]').textContent = vnd(payment.amount);
    $('[data-transfer-content]').textContent = payment.description;
    $('[data-transfer-content-inline]').textContent = payment.description;

    /* Đã chuyển thiếu: nói rõ đã nhận bao nhiêu, còn thiếu bao nhiêu, và đổi
       QR sang đúng phần còn lại — GIỮ NGUYÊN nội dung chuyển khoản để lần
       chuyển thứ hai vẫn khớp vào đúng đơn này. */
    var partial = $('[data-partial]');
    if (partial) {
      if (order.amountPaid > 0 && order.remaining > 0) {
        $('[data-paid-so-far]').textContent = vnd(order.amountPaid);
        $('[data-remaining]').textContent = vnd(order.remaining);
        partial.hidden = false;
      } else {
        partial.hidden = true;
      }
    }
  }

  /* Poll để trang tự chuyển sang "đã nhận học phí" khi webhook SePay đối soát
     xong — khách không phải tải lại trang hay chờ ai nhắn tin.
     3 giây trong 2 phút đầu (lúc khách vừa bấm chuyển khoản), sau đó giãn ra
     10 giây, và dừng hẳn sau 20 phút để không poll vô tận trên tab bị quên. */
  function schedule() {
    polls++;
    if (polls > 160) return stop();
    var delay = polls <= 40 ? 3000 : 10000;
    timer = setTimeout(function () {
      load(true).catch(function () { /* mạng chập chờn: bỏ qua, lần sau thử lại */ })
        .then(schedule);
    }, delay);
  }

  function stop() { if (timer) clearTimeout(timer); timer = null; polls = 1e9; }

  load(false)
    .then(function () { if (timer === null && polls < 1e9) schedule(); })
    .catch(function () {
      fail('Mất kết nối tới máy chủ. Anh chị tải lại trang giúp Thành nhé.');
    });

  var confirmBtn = $('#fc2-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', function () {
      var btn = this;
      btn.disabled = true;
      fetch('/api/order/' + encodeURIComponent(code) + '/confirm', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function () {
          $('[data-confirm-msg]').textContent =
            'Đã ghi nhận. Hệ thống đang đối soát, trang sẽ tự báo khi tiền về.';
          btn.textContent = 'Đã ghi nhận ✓';
          // Bấm xong thì kiểm tra ngay một lần, khỏi chờ hết chu kỳ poll.
          load(true).catch(function () {});
        })
        .catch(function () {
          $('[data-confirm-msg]').textContent = 'Không gửi được xác nhận, anh chị nhắn Zalo giúp Thành nhé.';
          btn.disabled = false;
        });
    });
  }
})();
