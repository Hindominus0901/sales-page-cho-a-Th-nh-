/* Trang giới thiệu: trình phát video feedback + số chỗ còn lại. */
(function () {
  'use strict';

  var lb = $('#fc2-lightbox');
  if (!lb) return;

  var lbVideo = $('[data-lb-video]', lb);
  var lbYt = $('[data-lb-yt]', lb);
  var lbImg = $('[data-lb-img]', lb);
  var lbCaption = $('[data-lb-caption]', lb);
  var thumbs = [];
  var current = -1;
  var lastFocused = null;

  // Dải marquee nhân đôi thumbnail — chỉ đếm bản gốc để mũi tên qua lại không lặp.
  function refreshThumbs() {
    thumbs = $$('.fc2-vthumb').filter(function (el) { return !el.hasAttribute('data-clone'); });
  }
  function playable(el) { return el && (el.getAttribute('data-video') || el.getAttribute('data-youtube')); }

  /** Bấm vào bản sao thì mở đúng video gốc tương ứng. */
  function indexOfThumb(el) {
    var i = thumbs.indexOf(el);
    if (i >= 0) return i;
    var key = el.getAttribute('data-video') || el.getAttribute('data-youtube');
    for (var j = 0; j < thumbs.length; j++) {
      if ((thumbs[j].getAttribute('data-video') || thumbs[j].getAttribute('data-youtube')) === key) return j;
    }
    return 0;
  }

  /** Dọn cả hai trình phát trước khi mở cái mới. */
  function resetPlayers() {
    lbVideo.pause();
    lbVideo.removeAttribute('src');
    lbVideo.load();
    lbVideo.hidden = false;
    lbYt.innerHTML = '';
    lbYt.hidden = true;
    lbImg.removeAttribute('src');
    lbImg.hidden = true;
  }

  /** Ảnh chụp feedback: mở bản đầy đủ, không bị cắt như trong lưới. */
  function openImage(el) {
    resetPlayers();
    lbVideo.hidden = true;
    lbImg.src = el.getAttribute('data-image');
    lbImg.alt = el.getAttribute('alt') || '';
    lbImg.hidden = false;
    lbCaption.textContent = '';
    openLightbox();
    current = -1;
    $('[data-lb-close]', lb).focus();
  }

  function openAt(index) {
    refreshThumbs();
    if (!thumbs.length) return;
    current = (index + thumbs.length) % thumbs.length;
    var el = thumbs[current];
    if (!playable(el)) return;

    resetPlayers();
    var ytId = el.getAttribute('data-youtube');

    if (ytId) {
      // youtube-nocookie: không đặt cookie theo dõi trước khi người xem bấm play
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(ytId)
        + '?autoplay=1&rel=0&playsinline=1&modestbranding=1';
      iframe.title = el.getAttribute('data-caption') || 'Video feedback học viên';
      iframe.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.setAttribute('frameborder', '0');
      lbVideo.hidden = true;
      lbYt.hidden = false;
      lbYt.appendChild(iframe);
    } else {
      lbVideo.setAttribute('poster', el.getAttribute('data-poster') || '');
      lbVideo.src = el.getAttribute('data-video');
      var play = lbVideo.play();
      if (play && play.catch) play.catch(function () { /* trình duyệt chặn autoplay: người dùng bấm nút play */ });
    }

    lbCaption.textContent = el.getAttribute('data-caption') || '';
    openLightbox();
    $('[data-lb-close]', lb).focus();
  }

  /** Bật hiển thị trước, gắn .fc2-in ở khung hình sau để transition có chỗ bắt đầu. */
  function openLightbox() {
    lb.classList.add('fc2-open');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { lb.classList.add('fc2-in'); });
    });
  }

  function closeLb() {
    lb.classList.remove('fc2-in');
    lb.classList.remove('fc2-open');
    resetPlayers();
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  document.addEventListener('click', function (e) {
    var thumb = e.target.closest ? e.target.closest('.fc2-vthumb') : null;
    if (playable(thumb)) {
      lastFocused = thumb;
      refreshThumbs();
      openAt(indexOfThumb(thumb));
      return;
    }
    var img = e.target.closest ? e.target.closest('.fc2-imgthumb') : null;
    if (img) {
      lastFocused = img;
      openImage(img);
      return;
    }
    if (e.target.closest('[data-lb-close]') || e.target === lb) closeLb();
    else if (e.target.closest('[data-lb-prev]')) openAt(current - 1);
    else if (e.target.closest('[data-lb-next]')) openAt(current + 1);
  });

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('fc2-imgthumb') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      lastFocused = t;
      openImage(t);
      return;
    }
    if (t && t.classList && t.classList.contains('fc2-vthumb') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      lastFocused = t;
      refreshThumbs();
      openAt(indexOfThumb(t));
      return;
    }
    if (!lb.classList.contains('fc2-open')) return;
    if (e.key === 'Escape') closeLb();
    else if (current < 0) return; // đang xem ảnh, không có trước/sau
    else if (e.key === 'ArrowLeft') openAt(current - 1);
    else if (e.key === 'ArrowRight') openAt(current + 1);
  });

  /**
   * Nạp ảnh trong các dải tự chạy khi cả dải sắp vào khung nhìn.
   *
   * Vì sao cần: dải marquee nhân đôi nội dung rồi kéo bằng translateX. Chrome
   * KHÔNG kích hoạt loading="lazy" cho ảnh nằm trong khối bị transform như vậy
   * — đo thực tế thì sau 40 giây vẫn còn 10 thumbnail chưa tải, và khách thấy
   * ô trắng đúng lúc dải cuộn chúng vào.
   *
   * Cách sửa giữ nguyên ý nghĩa của lazy: vẫn không tải gì cho tới khi dải gần
   * vào màn hình, chỉ là quan sát trên CẢ DẢI thay vì từng ảnh.
   */
  function wireMarqueeImages() {
    var wraps = $$('.fc2-marqwrap, .fc2-vmarquee');
    if (!wraps.length) return;

    var load = function (wrap) {
      $$('img[loading="lazy"]', wrap).forEach(function (img) {
        img.loading = 'eager';
        // Gán lại src để Chrome nạp ngay, không chờ lần bố cục sau.
        var src = img.getAttribute('src');
        if (src) img.setAttribute('src', src);
      });
    };

    if (!('IntersectionObserver' in window)) {
      wraps.forEach(load);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        load(en.target);
        io.unobserve(en.target);
      });
    }, { rootMargin: '600px 0px' });
    wraps.forEach(function (w) { io.observe(w); });
  }

  loadSiteConfig();
  wireMarqueePause();
  wireMarqueeImages();
})();
