/* Trang /thanh-toan?ma=GCXXXXXX — hiện mã QR chuyển khoản cho một đơn. */
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

  var code = new URLSearchParams(location.search).get('ma');
  if (!code) {
    fail('Đường dẫn thiếu mã đơn. Anh chị đăng ký lại giúp Thành nhé.');
    return;
  }

  wireCopyButtons(states.pay);
  loadSiteConfig();

  var stashed = takeStashedOrder(code);
  var source = stashed
    ? Promise.resolve({ ok: true, order: stashed.order, payment: stashed.payment })
    : fetch('/api/order/' + encodeURIComponent(code)).then(function (r) { return r.json(); });

  source
    .then(function (b) {
      if (!b.ok) return fail(b.error || 'Không tìm thấy đơn đăng ký với mã này.');

      if (b.order.status === 'paid') {
        $('[data-paid-code]').textContent = 'Mã đơn: ' + b.order.code;
        return show('paid');
      }
      if (b.order.status === 'cancelled') {
        return fail('Đơn đăng ký này đã bị huỷ. Anh chị đăng ký lại hoặc nhắn Zalo để được hỗ trợ.');
      }
      if (!b.payment) {
        return fail('Chưa cấu hình tài khoản nhận tiền. Anh chị nhắn Zalo để được hướng dẫn chuyển khoản.');
      }

      render(b.order, b.payment);
      show('pay');
    })
    .catch(function () {
      fail('Mất kết nối tới máy chủ. Anh chị tải lại trang giúp Thành nhé.');
    });

  function render(order, payment) {
    $('[data-order-code]').textContent = order.code;
    $('[data-order-code-inline]').textContent = order.code;
    $('[data-order-name]').textContent = order.name + ' · ' + order.phone;
    $('[data-qr]').src = payment.qrDataUrl;
    $('[data-bank-name]').textContent = payment.bank.name || '—';
    $('[data-bank-account]').textContent = payment.bank.accountNumber || '—';
    $('[data-bank-holder]').textContent = payment.bank.accountName || '—';
    $('[data-amount]').textContent = vnd(payment.amount);
    $('[data-transfer-content]').textContent = payment.transferContent;
    $('[data-transfer-content-inline]').textContent = payment.transferContent;
  }

  $('#fc2-confirm').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    fetch('/api/order/' + encodeURIComponent(code) + '/confirm', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        $('[data-confirm-msg]').textContent = b.message || 'Đã ghi nhận, cảm ơn anh chị.';
        btn.textContent = 'Đã ghi nhận ✓';
      })
      .catch(function () {
        $('[data-confirm-msg]').textContent = 'Không gửi được xác nhận, anh chị nhắn Zalo giúp Thành nhé.';
        btn.disabled = false;
      });
  });
})();
