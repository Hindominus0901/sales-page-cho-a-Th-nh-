/* Cổng học viên /hoc/<mã> — xem tiến độ, nộp bài, đổi quà. */
(function () {
  'use strict';

  var root = $('[data-state="app"]');
  if (!root) return;

  /* HAI chế độ.

     Có mã trên đường dẫn (/hoc/<mã>) — đường cũ, học viên đang học dùng nó,
     không cần mật khẩu. Không có mã — trang mở bằng phiên đăng nhập.

     Khác nhau đúng ở tiền tố đường API và ở việc đường nào nộp bài. Mọi thứ
     còn lại của trang này không cần biết mình đang ở chế độ nào. */
  var token = (location.pathname.match(/\/hoc\/([0-9a-f]{32})/) || [])[1];
  var api = token ? '/api/hoc/' + token : '/api/hv';
  var duongTrang = token ? api : api + '/trang';
  var state = null;
  var selectedDay = 1;

  function show(name) {
    ['loading', 'error', 'app'].forEach(function (k) {
      var el = $('[data-state="' + k + '"]');
      if (el) el.hidden = k !== name;
    });
  }

  function fail(message) {
    $('[data-error-message]').textContent = message;
    show('error');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var num = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };

  /* Màu ô ngày. Ba trạng thái "chưa xong" gộp lại thành hai màu cho dễ đọc
     trên điện thoại: cần sửa và bị từ chối đều là "làm lại", chờ duyệt là
     "đang chờ mình". */
  var TONE = {
    approved:   { bg: '#2f7a4d', fg: '#fff' },
    pending:    { bg: '#e2a33c', fg: '#231a06' },
    needs_work: { bg: '#c8123a', fg: '#fff' },
    rejected:   { bg: '#c8123a', fg: '#fff' },
    empty:      { bg: 'rgba(25,25,25,.07)', fg: '#55555c' }
  };

  load();
  moiDatMatKhau();

  /* Mời đặt mật khẩu, chỉ khi vào bằng đường link cũ.

     Không hỏi máy chủ xem đã có mật khẩu chưa: câu trả lời đó nói cho bất kỳ
     ai cầm link biết tài khoản này đã có mật khẩu hay chưa, mà chẳng đổi được
     gì cho người dùng thật. Cứ hiện ô, ai đã có mật khẩu thì máy chủ từ chối
     kèm câu giải thích. */
  function moiDatMatKhau() {
    if (!token) return;
    var box = $('[data-dat-mk]');
    if (!box) return;
    box.hidden = false;

    /* Địa chỉ web lấy từ chính trang đang mở, KHÔNG gõ cứng.

       Gõ cứng thì chữ này chỉ đúng cho đúng một tên miền: học viên mở web bằng
       địa chỉ workers.dev sẽ được chỉ tới một nơi họ không đứng, và lần sau đổi
       tên miền là câu này sai mà không có gì báo. */
    var mien = $('[data-mien]');
    if (mien) mien.textContent = location.host;

    var nut = $('[data-dat-nut]');
    var o = $('[data-mk]');
    var msg = $('[data-dat-msg]');

    nut.addEventListener('click', function () {
      var mk = o.value;
      if (mk.length < 12) {
        msg.textContent = 'Mật khẩu phải từ 12 ký tự trở lên — hiện mới ' + mk.length + '.';
        msg.style.color = '#c8123a';
        return;
      }
      nut.disabled = true;
      msg.textContent = 'Đang đặt…';
      msg.style.color = '#55555c';

      fetch('/api/hoc/' + token + '/dat-mat-khau', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matKhau: mk })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) {
            msg.textContent = d.error || 'Không đặt được mật khẩu.';
            msg.style.color = '#c8123a';
            return;
          }
          box.innerHTML = '<div style="font-size:16px;font-weight:800;margin-bottom:6px">'
            + 'Đã đặt mật khẩu</div><p style="font-size:14px;line-height:1.7;color:#55555c;margin:0">'
            + 'Lần sau anh chị vào thẳng <b>' + esc(location.host) + '/dang-nhap</b> '
            + 'bằng email ' + esc(d.email || '') + ' và mật khẩu vừa đặt.</p>';
        })
        .catch(function () {
          msg.textContent = 'Không kết nối được. Anh chị thử lại giúp em.';
          msg.style.color = '#c8123a';
        })
        .finally(function () { nut.disabled = false; });
    });
  }

  function load() {
    fetch(duongTrang, { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        /* Chưa đăng nhập và cũng không có mã: đưa thẳng tới màn hình đăng
           nhập thay vì hiện một câu lỗi rồi để người ta đứng đó. */
        if (res.ok === false && !token && res.d && res.d.error === 'Chưa đăng nhập.') {
          location.href = '/dang-nhap';
          return;
        }
        if (!res.ok || !res.d.ok) return fail(res.d.error || 'Không mở được đường link này.');
        state = res.d;
        selectedDay = pickDay();
        render();
        show('app');
      })
      .catch(function () {
        fail('Không kết nối được. Anh chị kiểm tra mạng rồi tải lại trang giúp em.');
      });
  }

  /* Ô ngày mở sẵn. Ưu tiên ngày bị trả về trước tiên: ở đó có nhận xét của
     team đang chờ đọc và một việc cụ thể phải làm, còn ô trống thì lúc nào
     cũng còn đó. Sau đó mới tới ngày hôm nay, rồi ngày trống đầu tiên. */
  function pickDay() {
    var redo = state.days.find(function (d) {
      return d.status === 'needs_work' || d.status === 'rejected';
    });
    if (redo) return redo.day;

    var today = state.student.currentDay;
    var slot = state.days[today - 1];
    if (slot && slot.status === 'empty') return today;

    var firstEmpty = state.days.find(function (d) { return d.status === 'empty'; });
    return firstEmpty ? firstEmpty.day : today;
  }

  function render() {
    var s = state.student, r = state.rank;

    $('[data-name]').textContent = s.name;
    $('[data-cohort]').textContent = s.cohort ? 'Khoá ' + s.cohort : '';
    $('[data-coin]').textContent = num(s.coin);
    $('[data-streak]').textContent = s.streak + (s.streak > 0 ? ' ngày' : '');
    $('[data-done]').innerHTML = s.postsDone + '<span style="font-size:15px;font-weight:600;color:#77777d">/21</span>';

    $('[data-rank-icon]').textContent = r.icon || '🌱';
    $('[data-rank-name]').textContent = r.name;
    $('[data-rank-next]').textContent = r.next
      ? 'Còn ' + num(r.xpToNext) + ' XP nữa là lên bậc ' + r.next.icon + ' ' + r.next.name
      : 'Anh chị đang ở bậc cao nhất.';
    $('[data-rank-bar]').style.width = Math.round((r.progress || 0) * 100) + '%';

    renderGrid();
    renderForm();
    renderRewards();
    renderRedemptions();
  }

  function renderGrid() {
    $('[data-grid]').innerHTML = state.days.map(function (d) {
      var t = TONE[d.status] || TONE.empty;
      var on = d.day === selectedDay;
      return '<button type="button" data-day="' + d.day + '" '
        + 'style="aspect-ratio:1;border:0;border-radius:12px;cursor:pointer;font:inherit;font-weight:700;'
        + 'background:' + t.bg + ';color:' + t.fg + ';'
        + 'outline:' + (on ? '2px solid #191919' : 'none') + ';outline-offset:2px">'
        + d.day + '</button>';
    }).join('');
  }

  function renderForm() {
    var slot = state.days[selectedDay - 1] || { status: 'empty' };
    var form = $('[data-form]');
    var m = state.mechanics;

    form.day.innerHTML = state.days.map(function (d) {
      var label = 'Ngày ' + d.day
        + (d.status === 'approved' ? ' — đã duyệt'
          : d.status === 'pending' ? ' — chờ duyệt'
          : d.status === 'empty' ? '' : ' — cần sửa');
      return '<option value="' + d.day + '"' + (d.day === selectedDay ? ' selected' : '') + '>'
        + esc(label) + '</option>';
    }).join('');

    form.postUrl.value = slot.postUrl || '';
    form.content.value = slot.content || '';
    form.channel.value = slot.channel || 'facebook';

    var fb = $('[data-feedback]');
    fb.hidden = !slot.feedback;
    if (slot.feedback) $('[data-feedback-text]').textContent = slot.feedback;

    /* Bài đã duyệt thì khoá form lại — sửa được sau khi đã cộng coin nghĩa là
       link đã nhận thưởng có thể bị thay bằng link khác. */
    var locked = slot.status === 'approved';
    form.postUrl.disabled = form.content.disabled = form.channel.disabled = locked;
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = locked;
    btn.textContent = locked ? 'Bài này đã được duyệt' : (slot.status === 'empty' ? 'Nộp bài' : 'Nộp lại bài');
    btn.style.opacity = locked ? '.45' : '1';
    btn.style.cursor = locked ? 'default' : 'pointer';

    $('[data-submit-hint]').textContent = locked
      ? 'Ngày ' + selectedDay + ' đã được duyệt, cộng ' + num(slot.coinAwarded) + ' coin.'
      : 'Mỗi bài được duyệt: ' + num(m.coinPerSubmission) + ' coin + ' + num(m.xpPerSubmission)
        + ' XP. Nộp liền ngày thì mỗi ngày chuỗi cộng thêm ' + m.streakBonusPct + '% coin.';
    $('[data-form-msg]').textContent = '';
  }

  function renderRewards() {
    var box = $('[data-rewards]');
    if (!state.rewards.length) {
      box.innerHTML = '<div style="font-size:14px;color:#55555c">Chưa có phần quà nào đang mở.</div>';
      return;
    }
    box.innerHTML = state.rewards.map(function (r) {
      return '<div class="fc2-shadow" style="background:#fff;border-radius:20px;padding:18px 20px;'
        + 'display:flex;gap:16px;align-items:center;flex-wrap:wrap">'
        + '<div style="flex:1;min-width:180px">'
        +   '<div style="font-size:16px;font-weight:700">' + esc(r.name) + '</div>'
        +   (r.description ? '<div style="font-size:13px;color:#55555c;line-height:1.6;margin-top:3px">' + esc(r.description) + '</div>' : '')
        +   '<div style="font-size:13px;font-weight:700;color:#2f7a4d;margin-top:6px">' + num(r.cost_coin) + ' coin</div>'
        + '</div>'
        + (r.canRedeem
          ? '<button type="button" data-redeem="' + esc(r.id) + '" class="fc2-cta" style="height:46px;padding:0 20px;'
            + 'background:#2f7a4d;color:#fff;font-weight:700;font-size:14px;border:0;border-radius:14px;cursor:pointer">Đổi</button>'
          : '<span style="font-size:13px;color:#77777d">' + esc(r.reason || 'Chưa đổi được') + '</span>')
        + '</div>';
    }).join('');
  }

  var REDEEM_LABEL = {
    requested: 'Đang chờ team duyệt', approved: 'Đã duyệt, chờ gửi',
    fulfilled: 'Đã gửi', rejected: 'Bị từ chối — coin đã hoàn lại', cancelled: 'Đã huỷ'
  };

  function renderRedemptions() {
    var list = state.redemptions || [];
    $('[data-redemptions]').hidden = list.length === 0;
    $('[data-redemptions-list]').innerHTML = list.map(function (r) {
      return '<div style="display:flex;justify-content:space-between;gap:12px;font-size:14px;'
        + 'background:#fff;border-radius:14px;padding:11px 14px">'
        + '<span>' + esc(r.reward_name) + '</span>'
        + '<span style="color:#55555c">' + esc(REDEEM_LABEL[r.status] || r.status) + '</span>'
        + '</div>';
    }).join('');
  }

  // ----------------------------------------------------------------- sự kiện

  $('[data-grid]').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-day]');
    if (!btn) return;
    selectedDay = Number(btn.getAttribute('data-day'));
    renderGrid();
    renderForm();
  });

  $('[data-form]').addEventListener('change', function (e) {
    if (e.target.name !== 'day') return;
    selectedDay = Number(e.target.value);
    renderGrid();
    renderForm();
  });

  $('[data-form]').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var btn = form.querySelector('button[type="submit"]');
    var msg = $('[data-form-msg]');
    var old = btn.textContent;

    btn.disabled = true;
    btn.textContent = 'Đang gửi…';
    msg.textContent = '';

    post(api + '/nop-bai', {
      day: Number(form.day.value),
      postUrl: form.postUrl.value,
      content: form.content.value,
      channel: form.channel.value
    }).then(function (res) {
      btn.disabled = false;
      btn.textContent = old;
      if (!res.ok) {
        msg.style.color = '#c8123a';
        msg.textContent = res.error || 'Chưa gửi được, anh chị thử lại giúp em.';
        return;
      }
      /* Vẽ lại trước rồi mới ghi lời báo: renderForm() xoá ô thông báo, đặt
         lời báo trước thì nó biến mất ngay khi số liệu mới về. */
      refresh().then(function () {
        msg.style.color = '#2f7a4d';
        msg.textContent = res.message;
      });
    });
  });

  $('[data-rewards]').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-redeem]');
    if (!btn) return;
    if (!confirm('Anh chị xác nhận đổi phần quà này?')) return;

    btn.disabled = true;
    btn.textContent = 'Đang đổi…';
    post(api + '/doi-qua', { rewardId: btn.getAttribute('data-redeem'), note: '' })
      .then(function (res) {
        if (!res.ok) {
          alert(res.error || 'Chưa đổi được, anh chị thử lại giúp em.');
          btn.disabled = false;
          btn.textContent = 'Đổi';
          return;
        }
        refresh();
      });
  });

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: 'Mất kết nối. Anh chị thử lại giúp em.' }; });
  }

  /* Tải lại số liệu sau khi nộp/đổi, nhưng GIỮ nguyên ngày đang chọn — nhảy
     về ngày khác ngay sau khi vừa nộp thì học viên tưởng bài mình bay mất. */
  function refresh() {
    var keep = selectedDay;
    return fetch(api, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) return;
        state = d;
        selectedDay = keep;
        render();
      })
      .catch(function () { /* giữ nguyên màn hình đang có */ });
  }
})();
