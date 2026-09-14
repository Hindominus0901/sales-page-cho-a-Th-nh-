/**
 * Facebook Pixel cho khu vuc thanh vien (ban dung Vite).
 *
 * De o file rieng chu khong nhung thang vao <head> la co y: CSP cua khu vuc
 * thanh vien dat script-src 'self', khong cho script inline. Nhung thang vao
 * HTML thi phai mo 'unsafe-inline' - tuc la ha mot trong nhung lop chan XSS
 * quan trong nhat, o dung noi co noi dung do nguoi dung nhap. Khong dang.
 *
 * Ma pixel doc tu the <meta name="fb-pixel-id"> do Worker chen vao.
 */
(function () {
  var meta = document.querySelector('meta[name="fb-pixel-id"]');
  var id = meta && meta.getAttribute('content');
  if (!id) return;

  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  window.fbq('init', id);
  window.fbq('track', 'PageView');
})();
