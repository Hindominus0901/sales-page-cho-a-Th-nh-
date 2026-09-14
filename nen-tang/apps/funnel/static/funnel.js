/* Ket noi cac trang thiet ke (.dc.html) voi backend.
   File nay duoc server chen tu dong - khong can sua file thiet ke. */
(function () {
  'use strict';

  var CFG = window.__FUNNEL__ || { page: 'unknown', api: '/api', routes: {} };
  var API = CFG.api || '/api';
  var LS = {
    lead: 'fnl_lead',
    attribution: 'fnl_attr',
    order: 'fnl_order',
    affiliate: 'fnl_aff',
  };

  // ---------- tien ich ----------
  function store(key, value) {
    try {
      if (value === undefined) {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* trinh duyet chan storage */ }
    return null;
  }

  function post(pathname, body) {
    return fetch(API + pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, ok: res.ok, data: data };
      });
    });
  }

  function get(pathname) {
    return fetch(API + pathname, { credentials: 'same-origin' })
      .then(function (res) { return res.json(); });
  }

  // Lan mo trang nay co mang theo nguon moi khong (link gioi thieu, quang cao)?
  function coNguonMoi(params) {
    return !!(params.get('ref') || params.get('utm_source') || params.get('utm_medium')
      || params.get('utm_campaign') || params.get('fbclid') || params.get('gclid'));
  }

  /**
   * Ban cu: doc localStorage, co roi thi tra ve luon - nghia la nguon truy cap
   * bi dong bang o LAN DAU TIEN trinh duyet nay ghe qua, VINH VIEN. Nguoi da
   * vao trang tu hom truoc, hom nay bam link gioi thieu cua ban minh, van gui
   * len nguon cu; dau vet cua nguoi gioi thieu khong con o dau ca.
   *
   * Gio: co tham so nguon moi tren dia chi thi tinh lai va ghi de. May chu van
   * giu nguon DAU TIEN cho moi phien (upsertSession dung COALESCE), nen doi nay
   * khong lam sai so lieu cu - no chi lam cho lan bam moi khong bi cam mieng.
   */
  function attribution() {
    var params = new URLSearchParams(location.search);
    var saved = store(LS.attribution);
    if (saved && !coNguonMoi(params)) return saved;
    var attr = {
      landing_url: location.href.slice(0, 500),
      referrer: document.referrer.slice(0, 300),
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content: params.get('utm_content') || '',
      utm_term: params.get('utm_term') || '',
      fbclid: params.get('fbclid') || '',
      gclid: params.get('gclid') || '',
    };
    store(LS.attribution, attr);
    return attr;
  }

  // Khach vao bang link gioi thieu ?ref=MA -> ghi nhan cho nguoi gioi thieu
  function captureReferral() {
    var code = new URLSearchParams(location.search).get('ref');
    if (!code) return;
    post('/ref', {
      code: code,
      landing_url: location.href.slice(0, 500),
      referrer: document.referrer.slice(0, 300),
      attribution: attribution(),
    }).then(function (result) {
      if (result.ok && result.data && result.data.valid && result.data.referrer_name) {
        toast('Bạn được ' + result.data.referrer_name + ' giới thiệu tới Challenge này.');
      }
    }).catch(function () {});
  }

  function track(type, meta) {
    var lead = store(LS.lead);
    return post('/track', {
      type: type,
      page: CFG.page,
      meta: meta || null,
      lead_id: lead && lead.id ? lead.id : null,
      attribution: attribution(),
    }).catch(function () { /* khong lam vo trang neu tracking loi */ });
  }

  function toast(message, tone) {
    var box = document.getElementById('fnl-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'fnl-toast';
      box.style.cssText = 'position:fixed;z-index:99999;left:50%;transform:translateX(-50%);' +
        'bottom:24px;max-width:90vw;padding:13px 18px;border-radius:12px;font:600 14px/1.45 ' +
        '"Plus Jakarta Sans",system-ui,sans-serif;color:#fff;box-shadow:0 16px 40px rgba(0,0,0,.25);' +
        'opacity:0;transition:opacity .25s ease';
      document.body.appendChild(box);
    }
    box.style.background = tone === 'error' ? '#c0244f' : (tone === 'success' ? '#12a05e' : '#1a1815');
    box.textContent = message;
    box.style.opacity = '1';
    clearTimeout(box._timer);
    box._timer = setTimeout(function () { box.style.opacity = '0'; }, 4200);
  }

  function setBusy(el, busy, busyText) {
    if (!el) return;
    if (busy) {
      el._label = el.textContent;
      el.textContent = busyText || 'Đang xử lý...';
      el.style.pointerEvents = 'none';
      el.style.opacity = '.65';
    } else {
      if (el._label) el.textContent = el._label;
      el.style.pointerEvents = '';
      el.style.opacity = '';
    }
  }

  // ---------- trang FORM ----------
  // Ban thiet ke v2 la form nhieu buoc dieu khien boi Component (DCLogic) trong chinh file .dc.html
  // (xem support.js/dc-runtime). O day chi can moc vao instance dang chay that de goi API that khi
  // bam nut cuoi cung, thay vi handler tinh (`submitForm`) chi dieu huong sang trang xac nhan.
  function initFormV2(instance) {
    var submitting = false;
    var started = false;

    document.body.addEventListener('input', function () {
      if (started) return;
      started = true;
      track('form_start');
    });
    document.body.addEventListener('change', function () {
      if (started) return;
      started = true;
      track('form_start');
    });

    function errorBox() {
      var box = document.getElementById('fnl-form-error');
      if (!box) {
        box = document.createElement('div');
        box.id = 'fnl-form-error';
        box.style.cssText = 'display:none;margin:14px 0 0;padding:12px 14px;border-radius:12px;' +
          'background:#fdecef;border:1px solid #f3b8c5;color:#a4123c;font-size:13.5px;font-weight:600;';
        var navRow = document.querySelector('[data-nav]');
        var container = navRow ? navRow.closest('div') : null;
        if (container && container.parentNode) container.parentNode.insertBefore(box, container);
        else document.body.appendChild(box);
      }
      return box;
    }

    function showError(message) {
      var box = errorBox();
      box.textContent = message;
      box.style.display = 'block';
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      track('form_error', { message: message });
    }

    function clearError() {
      var box = document.getElementById('fnl-form-error');
      if (box) box.style.display = 'none';
    }

    /** Buoc nay dang thieu gi? Noi bang tieng nguoi, khong noi "khong hop le". */
    function thieuGi(s) {
      if (s.step === 0) {
        if (!String(s.name || '').trim()) return 'Bạn chưa điền họ và tên.';
        if (!String(s.email || '').trim()) return 'Bạn chưa điền email.';
        return 'Bạn chưa điền số điện thoại.';
      }
      return 'Bạn hãy chọn một đáp án trước khi tiếp tục.';
    }

    /**
     * Nut "Tiep tuc" trong sang nhung bam vao khong co gi xay ra.
     *
     * Rang buoc disabled cua runtime khong an o lan ve DAU TIEN (do van con
     * true o nhung lan ve sau, nen chi lan dau la hong). Nguoi vao trang, chua
     * dien gi, bam nut - va man hinh dung im: khong loi, khong nhuc nhich,
     * khong biet minh thieu gi. Rat nhieu nguoi bo di ngay o day.
     *
     * Hai lop chan, doc lap voi runtime:
     *   - to mo nut khi chua du dieu kien, de nhin la biet
     *   - bam vao thi NOI RA dang thieu gi
     */
    function capNhatNut() {
      var btn = document.querySelector('[data-nav][data-primary]');
      if (!btn || typeof instance.canProceed !== 'function') return;
      var duoc = instance.canProceed(instance.state.step);
      btn.disabled = !duoc;
      btn.style.opacity = duoc ? '' : '.5';
      btn.style.cursor = duoc ? '' : 'not-allowed';
    }

    document.body.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest('[data-nav][data-primary]');
      if (!btn || typeof instance.canProceed !== 'function') return;
      // Bam nut la o dang go vua mat tieu diem -> `change` da chay xong, state
      // moi nhat. Doc o day la doc dung thu nguoi dung vua go.
      if (instance.canProceed(instance.state.step)) { clearError(); return; }
      ev.preventDefault();
      ev.stopPropagation();
      showError(thieuGi(instance.state));
    }, true);

    ['input', 'change', 'click'].forEach(function (ten) {
      document.body.addEventListener(ten, function () { setTimeout(capNhatNut, 0); }, true);
    });
    setTimeout(capNhatNut, 0);

    window.DC.setExtra({
      submitForm: function () {
        if (submitting) return;
        var s = instance.state;
        if (typeof instance.canProceed === 'function' && !instance.canProceed(s.step)) return;
        clearError();
        submitting = true;
        var btn = document.querySelector('[data-nav][data-primary]');
        setBusy(btn, true, 'Đang gửi...');

        post('/leads', {
          full_name: s.name,
          email: s.email,
          phone: s.phone,
          country_code: s.phoneCode || '+84',
          answers: { q1: s.q1, q2: s.q2, q3: s.q3, q5: s.q5, q8: s.q8 },
          answers_schema: 'html',
          attribution: attribution(),
        }).then(function (result) {
          submitting = false;
          setBusy(btn, false);
          if (!result.ok) {
            var err = result.data && result.data.error;
            var fields = err && err.fields;
            var first = fields ? fields[Object.keys(fields)[0]] : null;
            return showError(first || (err && err.message) || 'Gửi không thành công, vui lòng thử lại.');
          }
          store(LS.lead, result.data.lead);
          if (result.data.affiliate) store(LS.affiliate, result.data.affiliate);
          location.href = CFG.routes.confirmation || '/xac-nhan';
        }).catch(function () {
          submitting = false;
          setBusy(btn, false);
          showError('Không kết nối được máy chủ. Kiểm tra mạng và thử lại nhé.');
        });
      },
    });
  }

  // Duong lui: neu trang form khong dung Component (ban thiet ke cu hon, input tinh voi name="qN"),
  // giu nguyen cach do DOM truc tiep nhu truoc.
  function initFormLegacy() {
    var nameInput = document.querySelector('input[type="text"]');
    var emailInput = document.querySelector('input[type="email"]');
    var phoneInput = document.querySelector('input[type="tel"]');
    var ccSelect = document.querySelector('select');
    var cta = Array.prototype.slice.call(document.querySelectorAll('a'))
      .filter(function (a) { return /VÉ MIỄN PHÍ|NHẬN VÉ|ĐĂNG KÝ/i.test(a.textContent); })[0]
      || document.querySelector('a[href="' + (CFG.routes.confirmation || '/xac-nhan') + '"]');

    if (!cta || !nameInput) return;

    var started = false;
    document.body.addEventListener('input', function () {
      if (started) return;
      started = true;
      track('form_start');
    });

    function errorBox() {
      var box = document.getElementById('fnl-form-error');
      if (!box) {
        box = document.createElement('div');
        box.id = 'fnl-form-error';
        box.style.cssText = 'display:none;margin:4px 0 0;padding:12px 14px;border-radius:12px;' +
          'background:#fdecef;border:1px solid #f3b8c5;color:#a4123c;font-size:13.5px;font-weight:600;';
        cta.parentNode.insertBefore(box, cta);
      }
      return box;
    }

    function showError(message) {
      var box = errorBox();
      box.textContent = message;
      box.style.display = 'block';
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      track('form_error', { message: message });
    }

    function collectAnswers() {
      var answers = {};
      var missing = [];
      var groups = {};
      Array.prototype.forEach.call(document.querySelectorAll('input[name]'), function (input) {
        (groups[input.name] = groups[input.name] || []).push(input);
      });

      Object.keys(groups).forEach(function (name) {
        var inputs = groups[name];
        var isCheckbox = inputs[0].type === 'checkbox';
        var picked = inputs.filter(function (i) { return i.checked; })
          .map(function (i) {
            var label = i.closest('label');
            return (label ? label.textContent : '').replace(/\s+/g, ' ').trim();
          })
          .filter(Boolean);
        if (!picked.length) { missing.push(name); return; }
        answers[name] = isCheckbox ? picked : picked[0];
      });

      return { answers: answers, missing: missing };
    }

    cta.addEventListener('click', function (event) {
      event.preventDefault();
      var collected = collectAnswers();

      if (!nameInput.value.trim() || !emailInput.value.trim() || !phoneInput.value.trim()) {
        return showError('Vui lòng điền đầy đủ họ tên, email và số điện thoại.');
      }
      if (collected.missing.length) {
        return showError('Bạn còn ' + collected.missing.length + ' câu hỏi chưa trả lời. Vui lòng chọn đủ trước khi gửi.');
      }

      setBusy(cta, true, 'Đang gửi...');
      post('/leads', {
        full_name: nameInput.value,
        email: emailInput.value,
        phone: phoneInput.value,
        country_code: ccSelect ? ccSelect.value || ccSelect.options[ccSelect.selectedIndex].text : '+84',
        answers: collected.answers,
        answers_schema: 'html',
        attribution: attribution(),
      }).then(function (result) {
        setBusy(cta, false);
        if (!result.ok) {
          var err = result.data && result.data.error;
          var fields = err && err.fields;
          var first = fields ? fields[Object.keys(fields)[0]] : null;
          return showError(first || (err && err.message) || 'Gửi không thành công, vui lòng thử lại.');
        }
        store(LS.lead, result.data.lead);
        if (result.data.affiliate) store(LS.affiliate, result.data.affiliate);
        location.href = CFG.routes.confirmation || '/xac-nhan';
      }).catch(function () {
        setBusy(cta, false);
        showError('Không kết nối được máy chủ. Kiểm tra mạng và thử lại nhé.');
      });
    });
  }

  function initForm() {
    window.DC.ready(function (instance) {
      if (instance && typeof instance.canProceed === 'function') initFormV2(instance);
      else initFormLegacy();
    });
  }

  // ---------- trang XAC NHAN ----------
  // Mau thuong hieu do build.mjs tiem vao window.__FUNNEL__. File nay duoc chep
  // NGUYEN VAN sang dist nen khong the token hoa - phai doc luc chay.
  var PINK = (CFG.brand_color || '#111111');
  var INK = '#0a0a0a';

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function shareTo(channel, data) {
    var url = data.share.url;
    var message = data.share.messages[channel === 'facebook' ? 'facebook' : 'zalo'];
    track('cta_click', { target: 'share_' + channel });

    if (channel === 'facebook') {
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url),
        '_blank', 'noopener,width=640,height=640');
      copyText(message);
      toast('Đã mở Facebook và copy sẵn nội dung — dán vào ô viết bài nhé.', 'success');
      return;
    }
    if (navigator.share) {
      navigator.share({ title: (CFG.share_title || CFG.brand_name || ''), text: message, url: url }).catch(function () {});
      return;
    }
    copyText(message);
    toast('Đã copy lời mời — mở Zalo và dán cho bạn bè nhé.', 'success');
  }

  function copyText(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text).catch(function () {});
    var box = document.createElement('textarea');
    box.value = text;
    document.body.appendChild(box);
    box.select();
    try { document.execCommand('copy'); } catch (e) { /* bo qua */ }
    document.body.removeChild(box);
  }

  function progressBlock(d) {
    var p = d.progress;
    var next = d.next_tier;
    var done = !next;
    var headline = done
      ? 'Bạn đã mở khoá toàn bộ phần thưởng 🎉'
      : (p.valid_referrals === 0
        ? 'Giới thiệu ' + next.target + ' người bạn để mở khoá <b>' + esc(next.title) + '</b>'
        : 'Còn <b>' + next.remaining + ' người</b> nữa là bạn mở khoá <b>' + esc(next.title) +
          '</b> <span style="color:' + PINK + '">(' + esc(next.value_text) + ')</span>');

    return '' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
        '<span style="background:' + (d.affiliate.level > 1 ? '#12a05e' : PINK) + ';color:#fff;font-size:10.5px;' +
        'font-weight:800;letter-spacing:.05em;padding:4px 10px;border-radius:999px">' +
        (d.affiliate.level > 1 ? 'ĐÃ MỞ KHOÁ LEVEL ' + d.affiliate.level : 'LEVEL 1') + '</span>' +
        '<b style="font-size:17px">Phần thưởng khi bạn giới thiệu bạn bè</b>' +
      '</div>' +
      '<div style="font-size:14.5px;line-height:1.6;color:#4b4855;margin-bottom:10px">' + headline + '</div>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">' +
        '<div style="flex:1;height:12px;border-radius:999px;background:#efecf2;overflow:hidden">' +
          '<i style="display:block;height:100%;width:' + p.percent + '%;border-radius:999px;' +
          'background:linear-gradient(90deg,' + PINK + ',' + PINK + '99);transition:width .6s ease"></i>' +
        '</div>' +
        '<b style="font-size:15px;white-space:nowrap">' + p.valid_referrals +
        (p.next_target ? '/' + p.next_target : '') + ' người</b>' +
      '</div>';
  }

  function linkBlock(d) {
    return '' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">' +
        '<input id="fnl-aff-link" readonly value="' + esc(d.share.url) + '" ' +
          'style="flex:1;min-width:210px;padding:13px 14px;border-radius:12px;border:1px solid rgba(0,0,0,.14);' +
          'background:#fff;font:600 13px/1.4 \'JetBrains Mono\',ui-monospace,monospace;color:' + INK + '">' +
        '<button data-act="copy" style="padding:13px 20px;border-radius:12px;border:none;background:' + PINK + ';' +
          'color:#fff;font:800 13.5px/1 inherit;cursor:pointer">Copy link</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px">' +
        ['<button data-act="zalo" style="' + shareBtn('#0068ff') + '">Gửi qua Zalo</button>',
         '<button data-act="facebook" style="' + shareBtn('#1877f2') + '">Chia sẻ Facebook</button>',
         '<button data-act="message" style="' + shareBtn('#5b5766') + '">Copy lời mời</button>'].join('') +
      '</div>';
  }

  function shareBtn(color) {
    return 'flex:1;min-width:130px;padding:12px 14px;border-radius:12px;border:1px solid ' + color +
      '33;background:#fff;color:' + color + ';font:800 13px/1 inherit;cursor:pointer';
  }

  function tiersBlock(d) {
    return '<div style="margin-top:20px;display:grid;gap:8px">' +
      d.tiers.map(function (t) {
        var on = t.unlocked;
        return '<div style="display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:13px;' +
          'background:' + (on ? '#f0fbf5' : '#fff') + ';border:1px solid ' + (on ? '#a8e0c4' : 'rgba(0,0,0,.09)') + '">' +
          '<span style="width:26px;height:26px;flex:none;border-radius:50%;display:grid;place-items:center;' +
          'background:' + (on ? '#12a05e' : '#efecf2') + ';color:' + (on ? '#fff' : '#8a8792') + ';' +
          'font:800 12px/1 inherit">' + (on ? '✓' : t.target) + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<b style="font-size:13.5px">' + esc(t.title) + '</b>' +
            '<div style="font-size:12px;color:#726f7a">' + esc(t.description || '') + '</div>' +
          '</div>' +
          '<span style="font:800 12.5px/1 inherit;color:' + (on ? '#0b6b42' : PINK) + ';white-space:nowrap">' +
          (on ? 'Đã mở' : t.remaining + ' người nữa') + '</span>' +
        '</div>';
      }).join('') + '</div>';
  }

  function referralsBlock(d) {
    if (!d.referrals.length) return '';
    return '<div style="margin-top:18px">' +
      '<div style="font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;' +
      'color:#726f7a;margin-bottom:7px">Đã đăng ký qua link của bạn</div>' +
      d.referrals.slice(0, 8).map(function (r) {
        return '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;' +
          'border-bottom:1px solid rgba(0,0,0,.06);font-size:13px">' +
          '<span>' + esc(r.name) + '</span>' +
          '<span style="color:' + (r.valid ? '#0b6b42' : '#8a5a06') + ';font-weight:700">' +
          (r.valid ? 'đã tính' : 'đang chờ xác minh') + '</span></div>';
      }).join('') + '</div>';
  }

  function leaderboardBlock(d) {
    if (!d.leaderboard || !d.leaderboard.length) return '';
    var me = d.rank || {};
    var mine = me.in_top
      ? 'Bạn đang ở <b>hạng ' + me.position + '</b> — giữ vững nhé!'
      : (me.position
        ? 'Bạn đang hạng <b>' + me.position + '</b>, thêm <b>' + me.need_for_top + ' lượt</b> nữa là vào top ' + me.top + '.'
        : 'Chỉ cần <b>1 lượt giới thiệu</b> là bạn có tên trên bảng này.');

    return '<div style="margin-top:20px;padding:15px 16px;border-radius:15px;background:#fff;' +
      'border:1px solid rgba(0,0,0,.09)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
        '<b style="font-size:14px">' + esc(d.contest.title) + '</b>' +
        '<span style="font-size:12px;color:' + PINK + ';font-weight:800">Giải thưởng ' +
        esc(d.contest.prize_pool_text) + '</span>' +
      '</div>' +
      d.leaderboard.map(function (row) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px">' +
          '<span style="width:22px;height:22px;flex:none;border-radius:50%;display:grid;place-items:center;' +
          'background:' + (row.position <= 3 ? PINK : '#efecf2') + ';color:' + (row.position <= 3 ? '#fff' : '#5b5766') +
          ';font:800 11px/1 inherit">' + row.position + '</span>' +
          '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          esc(row.name) + '</span>' +
          '<b>' + row.referrals + '</b></div>';
      }).join('') +
      '<div style="margin-top:9px;padding-top:9px;border-top:1px solid rgba(0,0,0,.07);font-size:12.5px;' +
      'color:#4b4855">' + mine + '</div></div>';
  }

  function commissionBlock(d) {
    return '<div style="margin-top:16px;padding:12px 14px;border-radius:12px;background:#fdf4fa;' +
      'border:1px dashed rgba(235,22,150,.3);font-size:12.5px;line-height:1.6;color:#4b4855">' +
      'Ngoài phần thưởng trên: ai mua <b>' + esc(d.product.name) + '</b> qua link của bạn, ' +
      'bạn nhận <b style="color:' + PINK + '">' + esc(d.product.commission_per_sale_text) + '</b> hoa hồng. ' +
      '<a href="' + esc(d.links.portal_url) + '" style="color:' + PINK + ';font-weight:700">' +
      'Xem trang cộng tác viên →</a></div>';
  }

  function affiliateCard(d, opts) {
    opts = opts || {};
    var old = document.getElementById('fnl-aff-card');
    if (old) old.remove();

    var card = document.createElement('div');
    card.id = 'fnl-aff-card';
    card.style.cssText = 'max-width:640px;margin:26px auto 0;padding:24px;border-radius:20px;' +
      'background:linear-gradient(180deg,#fff,#fdf4fa);border:1.5px solid rgba(235,22,150,.25);' +
      'box-shadow:0 18px 44px rgba(235,22,150,.12);font-family:"Plus Jakarta Sans",system-ui,sans-serif;' +
      'color:' + INK + ';';
    // opts.skipLink: trang da co san khoi "copy link + chia se" rieng (thiet ke v2) -> khong lap lai o day
    card.innerHTML = progressBlock(d) + (opts.skipLink ? '' : linkBlock(d)) + tiersBlock(d) +
      referralsBlock(d) + leaderboardBlock(d) + commissionBlock(d);

    var anchor = Array.prototype.slice.call(document.querySelectorAll('h2, h3'))
      .filter(function (h) { return /Các Bước|Bước Cần Làm/i.test(h.textContent); })[0];
    var host = anchor ? anchor.closest('div') : null;
    if (host && host.parentNode) host.parentNode.insertBefore(card, host);
    else document.body.appendChild(card);

    card.addEventListener('click', function (event) {
      var action = event.target.getAttribute && event.target.getAttribute('data-act');
      if (!action) return;
      if (action === 'copy') {
        var input = document.getElementById('fnl-aff-link');
        input.select();
        copyText(d.share.url);
        toast('Đã copy link giới thiệu của bạn.', 'success');
        track('cta_click', { target: 'copy_affiliate_link' });
      } else if (action === 'message') {
        copyText(d.share.messages.zalo);
        toast('Đã copy lời mời — gửi cho bạn bè là xong.', 'success');
        track('cta_click', { target: 'copy_invite_message' });
      } else {
        shareTo(action, d);
      }
    });
  }

  function fillNativeReferralBlock(instance, d) {
    // Thiet ke v2 co san 1 khoi rieng (link + nut copy + share Zalo/Facebook + so nguoi da moi)
    // dieu khien boi Component ({{ referralLink }}, {{ copyReferralLink }}...) voi du lieu gia (TODO
    // trong file thiet ke). Bom du lieu that vao day qua DC.setExtra thay vi sua file thiet ke.
    var copied = false;
    window.DC.setExtra({
      referralLink: d.share.url,
      referralCount: d.progress.valid_referrals,
      copyButtonLabel: copied ? 'Đã sao chép ✓' : 'Sao chép link',
      zaloShareLink: 'https://zalo.me/share?url=' + encodeURIComponent(d.share.url) +
        '&text=' + encodeURIComponent(d.share.messages.zalo),
      facebookShareLink: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(d.share.url),
      copyReferralLink: function () {
        copyText(d.share.url);
        toast('Đã copy link giới thiệu của bạn.', 'success');
        track('cta_click', { target: 'copy_affiliate_link' });
        window.DC.setExtra({ copyButtonLabel: 'Đã sao chép ✓' });
        setTimeout(function () { window.DC.setExtra({ copyButtonLabel: 'Sao chép link' }); }, 2200);
      },
    });
  }

  function initConfirmation() {
    var lead = store(LS.lead);

    Array.prototype.forEach.call(document.querySelectorAll('a[href*="zalo"]'), function (a) {
      a.addEventListener('click', function () { track('zalo_click', { href: a.href }); });
    });

    window.DC.ready(function (instance) {
      var hasNativeReferralVals = instance && typeof instance.renderVals === 'function' &&
        'referralLink' in instance.renderVals();

      if (!hasNativeReferralVals && lead && lead.full_name) {
        var heading = document.querySelector('h1');
        if (heading && /\{ten\}|\[Họ tên\]/i.test(heading.textContent)) {
          heading.textContent = heading.textContent.replace(/\{ten\}|\[Họ tên\]/gi, lead.full_name);
        }
      }

      // Luon hoi server de co so lieu moi nhat (tien do, bang xep hang)
      get('/affiliate/me').then(function (data) {
        if (!data || !data.ok) return;
        store(LS.affiliate, { code: data.affiliate.code, share_url: data.share.url,
          portal_url: data.links.portal_url });
        if (hasNativeReferralVals) {
          fillNativeReferralBlock(instance, data);
          affiliateCard(data, { skipLink: true });
        } else {
          affiliateCard(data);
        }
      }).catch(function () {});
    });
  }

  // ---------- trang OTO2 ----------
  function initOto() {
    track('oto_view');
    Array.prototype.forEach.call(
      document.querySelectorAll('a[href="' + (CFG.routes.checkout || '/thanh-toan') + '"]'),
      function (a) {
        a.addEventListener('click', function () { track('cta_click', { target: 'checkout' }); });
      });
  }

  // ---------- trang THANH TOAN ----------
  function initCheckout() {
    // Anh QR: ban thiet ke danh dau bang data-qr-cho ("cho duoc dien vao"), va
    // dat san mot anh MAU o do. Truoc day cho nay chi tim img[src*="vietqr.io"]
    // - tuc la tim mot anh QR DA co san - nen khong bao gio khop, va khach nhin
    // thay nguyen tam anh mau "ANH MAU - thay bang anh cua ban".
    // Khong quet duoc thi khong tra duoc tien: giu ca hai cach tim.
    var qrImage = document.querySelector('img[data-qr-cho], img[src*="vietqr.io"]');
    var pollTimer = null;

    function fillOrder(order) {
      store(LS.order, { code: order.code, amount: order.amount });

      if (qrImage) qrImage.src = order.transfer.qr_url;

      // Bang thong tin chuyen khoan trong ban thiet ke VIET CUNG so tai khoan va
      // ten chu tai khoan. Ma QR thi sinh tu cau hinh. Hai nguon do co the lech
      // nhau - va khi lech, khach doc so tren man hinh roi chuyen tay vao tai
      // khoan cu, trong khi he thong doi tien o tai khoan moi. Khong log, khong
      // canh bao, chi mat tien. Nen o day ghi de bang so THAT tu may chu.
      var nhan = {
        'Ngân hàng': order.transfer.bank_name,
        'Số tài khoản': order.transfer.account_number,
        'Chủ tài khoản': order.transfer.account_name,
      };
      Array.prototype.forEach.call(document.querySelectorAll('span, div, td'), function (el) {
        if (el.children.length) return;
        var key = el.textContent.trim();
        if (!Object.prototype.hasOwnProperty.call(nhan, key) || !nhan[key]) return;
        var giaTri = el.nextElementSibling;
        if (giaTri && !giaTri.children.length) {
          giaTri.textContent = nhan[key];
          giaTri.style.userSelect = 'all';
        }
      });

      // Cap nhat "Nội dung" chuyen khoan + so tien trong bang thong tin
      Array.prototype.forEach.call(document.querySelectorAll('span, div, td'), function (el) {
        if (el.children.length) return;
        var text = el.textContent.trim();
        if (/^VIP\s*\[Họ tên\]/i.test(text) || /\[Họ tên\]\s*\[SĐT\]/i.test(text)) {
          el.textContent = order.transfer.content;
          el.style.userSelect = 'all';
        } else if (text === '[GIÁ]') {
          el.textContent = order.amount_text;
        }
      });

      banner(order);
    }

    function banner(order) {
      var box = document.getElementById('fnl-order-banner');
      if (!box) {
        box = document.createElement('div');
        box.id = 'fnl-order-banner';
        box.style.cssText = 'max-width:1100px;margin:16px auto 0;padding:14px 18px;border-radius:14px;' +
          'font:600 13.5px/1.5 "Plus Jakarta Sans",system-ui,sans-serif;';
        var host = document.querySelector('img[data-qr-cho], img[src*="vietqr.io"]');
        var anchor = host ? host.closest('div').parentNode : document.body.firstChild;
        anchor.parentNode.insertBefore(box, anchor);
      }
      if (order.status === 'paid') {
        box.style.background = '#e8f8f0';
        box.style.border = '1px solid #9ddcbd';
        box.style.color = '#0b6b42';
        box.innerHTML = '✅ Đã nhận được thanh toán cho đơn <b>' + order.code +
          '</b>. Vé VIP của bạn đã được kích hoạt — ' + (CFG.host_name || 'chúng tôi') + ' sẽ nhắn qua ' + (CFG.channel_label || 'Zalo') + ' trong ít phút.';
      } else {
        box.style.background = '#fff7e6';
        box.style.border = '1px solid #f2d79b';
        box.style.color = '#8a5a06';
        box.innerHTML = 'Mã đơn của bạn: <b style="user-select:all">' + order.code + '</b> · ' +
          'Nội dung chuyển khoản: <b style="user-select:all">' + order.transfer.content + '</b> · ' +
          'Số tiền: <b>' + order.amount_text + '</b>. Trang sẽ tự cập nhật khi hệ thống nhận được tiền.';
      }
    }

    function poll(code) {
      clearInterval(pollTimer);
      pollTimer = setInterval(function () {
        get('/orders/' + code).then(function (data) {
          if (data && data.ok && data.order.status === 'paid') {
            clearInterval(pollTimer);
            banner(data.order);
            toast('Đã xác nhận thanh toán. Cảm ơn bạn!', 'success');
          }
        }).catch(function () { /* bo qua */ });
      }, 8000);
    }

    track('checkout_view');
    post('/orders', {}).then(function (result) {
      if (!result.ok) {
        var err = result.data && result.data.error;
        if (err && err.code === 'lead_required') {
          toast('Bạn cần đăng ký trước khi thanh toán. Đang chuyển về form đăng ký...', 'error');
          setTimeout(function () { location.href = CFG.routes.form || '/dang-ky'; }, 2200);
          return;
        }
        toast((err && err.message) || 'Không tạo được đơn, vui lòng thử lại.', 'error');
        return;
      }
      fillOrder(result.data.order);
      if (result.data.order.status !== 'paid') poll(result.data.order.code);
    }).catch(function () {
      toast('Không kết nối được máy chủ.', 'error');
    });

    // Bam vao so tai khoan / noi dung de copy nhanh
    document.addEventListener('click', function (event) {
      var el = event.target;
      if (!el || el.children.length) return;
      var text = (el.textContent || '').trim();
      if (!/^(\d[\d ]{6,}|VIP [A-Z0-9 ]+)$/.test(text)) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text.replace(/\s+/g, text.startsWith('VIP') ? ' ' : ''));
        toast('Đã copy: ' + text, 'success');
        track('checkout_copy', { value: text.slice(0, 40) });
      }
    });
  }

  // ---------- anh thieu ----------
  // File thiet ke tro toi assets/*.jpg|png; neu chua co anh that thi thay bang
  // khoi nen cung kich thuoc, tranh icon "anh vo" tren trang ban cho khach xem.
  function placeholderFor(img) {
    var isLogo = /logo/i.test(img.getAttribute('src') || '') || /logo/i.test(img.alt || '');
    var box = document.createElement(isLogo ? 'span' : 'div');
    var rect = img.getBoundingClientRect();
    var styles = window.getComputedStyle(img);

    if (isLogo) {
      box.textContent = (img.alt || CFG.logo_text || '').toUpperCase();
      box.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;' +
        'height:' + (rect.height || 48) + 'px;padding:0 14px;border-radius:10px;' +
        'background:#0A0A0A;color:#fff;font:800 15px/1 "Plus Jakarta Sans",system-ui,sans-serif;' +
        'letter-spacing:.06em;white-space:nowrap;';
    } else {
      box.style.cssText = 'display:block;width:' + (styles.width !== 'auto' ? styles.width : '100%') + ';' +
        'height:' + (rect.height ? rect.height + 'px' : styles.height) + ';' +
        'aspect-ratio:' + (styles.aspectRatio && styles.aspectRatio !== 'auto' ? styles.aspectRatio : '16/10') + ';' +
        'border-radius:' + styles.borderRadius + ';object-fit:cover;' +
        'background:linear-gradient(135deg,#f4eef6,#fdf0f8 45%,#eef7f2);' +
        'border:1px dashed rgba(235,22,150,.28);';
      box.title = 'Ảnh chưa được tải lên: ' + (img.getAttribute('src') || '');
    }
    return box;
  }

  function handleBrokenImage(img) {
    if (img.dataset.fnlFixed) return;
    img.dataset.fnlFixed = '1';
    var box = placeholderFor(img);
    if (img.parentNode) img.parentNode.replaceChild(box, img);
  }

  function guardImages() {
    Array.prototype.forEach.call(document.querySelectorAll('img'), function (img) {
      img.addEventListener('error', function () { handleBrokenImage(img); }, { once: true });
      if (img.complete && img.naturalWidth === 0) handleBrokenImage(img);
    });
  }

  // ---------- trang LANDING: doi video chinh (VSL) qua .env neu co cau hinh ----------
  //
  // Ban cu tim 'iframe[src*="youtube.com/embed/"]' roi doi src. Cach do khong con
  // chay: iframe cua hero gio nam ngoai DOM cho den khi nguoi xem bam phat (de
  // khong tu dong keu tieng), nen querySelector khong thay gi va viec doi video
  // that bai am tham. Gio ghi de thang gia tri ma ban thiet ke dang doc.
  function initHeroVideoOverride() {
    var id = CFG.hero_video_id;
    if (!id) return; // khong cau hinh -> giu video co san trong ban thiet ke
    var provider = CFG.hero_video_provider || 'youtube';

    if (provider === 'wistia') {
      // Wistia tu ve anh dai dien va nut phat cua no, dep hon va dung thuong
      // hieu hon la muon anh cua YouTube. Nen thay han khoi hero bang trinh
      // phat Wistia thay vi chi doi duong dan.
      window.DC.ready(function () {
        var box = document.getElementById('hero-video');
        if (!box) return;
        box.innerHTML = '';
        var frame = document.createElement('iframe');
        // silentAutoPlay=allow: thu phat co tieng truoc, trinh duyet chan thi lui
        // ve tat tieng va Wistia hien nut "Click for Sound". KHONG dat muted=true
        // - cai do lam mat luon nut bat tieng, nguoi xem khong biet duong nao ma bat.
        var opts = '?videoFoam=true';
        if (CFG.hero_video_autoplay) opts += '&autoPlay=true&silentAutoPlay=allow';
        frame.src = 'https://fast.wistia.net/embed/iframe/' + encodeURIComponent(id) + opts;
        frame.title = 'Video giới thiệu';
        frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
        frame.allowFullscreen = true;
        frame.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border:0;';
        box.appendChild(frame);
      });
      return;
    }

    // Dat len chinh component roi ve lai mot lan. KHONG dung setExtra: gia tri
    // cua setExtra de len tren ket qua tinh cua component va khong bao gio bi
    // tinh lai, nen bam phat xong duong dan van la 'about:blank'.
    window.DC.ready(function (instance) {
      if (!instance) return;
      instance.heroId = id;
      instance.heroProvider = provider;
      if (CFG.hero_video_thumb) instance.heroThumb = CFG.hero_video_thumb;
      window.DC.rerender();
    });
  }

  // ---------- trang CAM ON: gan video huong dan ----------
  //
  // Trong ban thiet ke, o video la mot tam anh tinh kem nut ▶ ve bang CSS - bam
  // vao khong co gi xay ra. Day la khoi thay no bang trinh phat that.
  //
  // Khong tu phat: nguoi vua bam xong nut dang ky, mot doan video tu keu len la
  // giat minh va phan xa dau tien la dong tab.
  function initConfirmVideo() {
    var id = CFG.confirm_video_id;
    if (!id) return;
    var box = document.getElementById('confirm-video');
    if (!box) return;

    if ((CFG.confirm_video_provider || 'wistia') !== 'wistia') return;

    // Giu lai dong chu duoi day video ("Video huong dan: 3 viec can lam...") roi
    // dat de len tren trinh phat - do la thu noi cho nguoi xem biet ho sap xem gi.
    var caption = box.lastElementChild;
    box.innerHTML = '';

    var frame = document.createElement('iframe');
    var opts = '?videoFoam=true';
    if (CFG.confirm_video_autoplay) opts += '&autoPlay=true&silentAutoPlay=allow';
    frame.src = 'https://fast.wistia.net/embed/iframe/' + encodeURIComponent(id) + opts;
    frame.title = 'Video hướng dẫn';
    frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
    frame.allowFullscreen = true;
    frame.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border:0;';
    box.appendChild(frame);

    // Trong ban thiet ke, dong chu nam DE LEN goc duoi anh tinh. Voi trinh phat
    // that thi cho do la thanh tua va cac nut cua Wistia - de chu len la vua che
    // mat nut, vua khong doc duoc. Ha xuong duoi khung.
    if (caption) {
      caption.style.cssText = 'margin:12px 2px 0; font-size:13.5px; font-weight:600; color:#5b5963;';
      if (box.parentNode) box.parentNode.insertBefore(caption, box.nextSibling);
    }
  }

  // Ban thiet ke da co san co che dung carousel testimonial khi ruoc chuot vao (onMouseEnter/
  // onMouseLeave -> pauseTestimonialMarquee/resumeTestimonialMarquee), nhung tren dien thoai
  // khong co "hover" nen chua dung duoc. Cham tay vao thi goi lai dung handler co san.
  // ---------- bang tin cam nhan: tu chay + keo duoc ----------
  //
  // Truoc day day la mot animation CSS chay mai, nguoi xem chi dung duoc bang
  // cach ruoc chuot vao - khong lui lai duoc, khong tua nhanh duoc, va tren
  // dien thoai thi gan nhu chiu.
  //
  // Gio la vung CUON NGANG THAT: dien thoai vuot duoc ngay (native, co quan
  // tinh), chuot keo duoc, va van tu chay khi khong ai dung toi.
  function initTestimonialCarousel() {
    window.DC.ready(function () {
      var wrap = document.getElementById('testimonial-track');
      if (!wrap) return;

      var TOC = 0.5;          // pixel moi khung hinh, ~30px/giay
      var dungToi = false;    // nguoi xem dang ruoc chuot / cham vao
      var dangKeo = false;
      var batDauX = 0, batDauScroll = 0, daDiChuyen = 0;

      // Danh sach duoc nhan doi trong ban thiet ke, nen chay het mot ban thi
      // nhay ve dau - mat thuong khong thay diem noi.
      function tuChay() {
        if (!dungToi && !dangKeo && wrap.scrollWidth > wrap.clientWidth) {
          var nua = wrap.scrollWidth / 2;
          wrap.scrollLeft = wrap.scrollLeft >= nua ? wrap.scrollLeft - nua : wrap.scrollLeft + TOC;
        }
        requestAnimationFrame(tuChay);
      }
      requestAnimationFrame(tuChay);

      var dung = function () { dungToi = true; };
      var chay = function () { dungToi = false; };
      wrap.addEventListener('mouseenter', dung);
      wrap.addEventListener('mouseleave', function () { chay(); ketThucKeo(); });
      wrap.addEventListener('touchstart', dung, { passive: true });
      // Cham xong doi mot chut roi chay tiep, de nguoi xem kip doc.
      wrap.addEventListener('touchend', function () { setTimeout(chay, 2500); }, { passive: true });

      // --- keo bang chuot ---
      wrap.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        dangKeo = true; daDiChuyen = 0;
        batDauX = e.pageX;
        batDauScroll = wrap.scrollLeft;
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) {
        if (!dangKeo) return;
        var di = e.pageX - batDauX;
        daDiChuyen = Math.max(daDiChuyen, Math.abs(di));
        // Qua 4px moi coi la keo, duoi nguong do van tinh la bam de xem video.
        if (daDiChuyen > 4) wrap.classList.add('dang-keo');
        wrap.scrollLeft = batDauScroll - di;
      });
      function ketThucKeo() {
        if (!dangKeo) return;
        dangKeo = false;
        wrap.classList.remove('dang-keo');
      }
      document.addEventListener('mouseup', ketThucKeo);

      // Keo xong, chuot nha ra dung tren mot the video -> trinh duyet van ban
      // mot su kien click. Chan lai, khong thi keo mot cai la video tu phat.
      wrap.addEventListener('click', function (e) {
        if (daDiChuyen > 4) { e.stopPropagation(); e.preventDefault(); daDiChuyen = 0; }
      }, true);
    });
  }

  // ---------- khoi dong ----------
  function boot() {
    attribution();
    captureReferral();
    track('page_view', { path: location.pathname });

    // Quet anh vo SAU khi dc-runtime da render xong sc-for/sc-if (vd anh dai dien testimonial).
    // Chay som hon se bat nham anh mau ben trong template chua duoc nhan ban va pha luon template do.
    if (window.DC) window.DC.ready(guardImages); else guardImages();

    if (CFG.page === 'form') initForm();
    else if (CFG.page === 'confirmation') { initConfirmation(); initConfirmVideo(); }
    else if (CFG.page === 'oto2') initOto();
    else if (CFG.page === 'checkout') initCheckout();
    else {
      if (CFG.page === 'landing') { initHeroVideoOverride(); initTestimonialCarousel(); }
      Array.prototype.forEach.call(document.querySelectorAll('a[href="' + (CFG.routes.form || '/dang-ky') + '"]'),
        function (a) { a.addEventListener('click', function () { track('cta_click', { target: 'form' }); }); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
