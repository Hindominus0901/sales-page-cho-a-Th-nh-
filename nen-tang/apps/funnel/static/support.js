/*
 * dc-runtime nhe (khong phu thuoc React/CDN ngoai) - dien giai dung cu phap cua file .dc.html:
 *   {{ bieu.thuc }}          noi suy trong text/attribute (chi ho tro duong dan cham, khong toan tu)
 *   <sc-if value="{{ x }}">  an/hien theo dieu kien
 *   <sc-for list="{{ xs }}" as="item">  lap qua mang
 *   onClick="{{ fn }}" onChange="{{ fn }}"  gan handler that
 *   <script type="text/x-dc" data-dc-script> class Component extends DCLogic { state = {...}; renderVals(){...} }
 *
 * Ly do khong dung runtime that cua Design Canvas: no tai React + Babel standalone (~3MB) tu
 * unpkg.com luc chay - qua nang va phu thuoc CDN ngoai cho mot trang ban hang can toc do + on dinh.
 * File nay chi lam dung tung do cac trang .dc.html trong repo can, khong phai bo dien giai JSX day du.
 *
 * KHONG sua file .dc.html de tuong thich file nay - moi mo rong cu phap deu phai lam o day.
 */
(function () {
  'use strict';

  if (window.customElements) {
    ['x-dc', 'sc-if', 'sc-for', 'helmet'].forEach(function (tag) {
      if (!window.customElements.get(tag)) {
        try { window.customElements.define(tag, class extends HTMLElement {}); }
        catch (e) { /* da dinh nghia o lan chay truoc (HMR/preview) */ }
      }
    });
  }

  // An sc-if/sc-for tu dau (truoc khi JS kip chay) de tranh nhap nhem 2 nhanh cung hien ra.
  var guardCss = document.createElement('style');
  guardCss.textContent = 'sc-if,sc-for{display:none}';
  (document.head || document.documentElement).appendChild(guardCss);

  // ---------------------------------------------------------------- helpers
  var MUSTACHE = /\{\{\s*([\w.]+)\s*\}\}/g;

  function resolvePath(scope, path) {
    var parts = path.split('.');
    var cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function bareExprPath(tpl) {
    var m = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(String(tpl).trim());
    return m ? m[1] : null;
  }

  function substitute(tpl, scope) {
    return String(tpl).replace(MUSTACHE, function (_, path) {
      var v = resolvePath(scope, path);
      return v === undefined || v === null ? '' : String(v);
    });
  }

  var EVENT_ATTRS = {
    onclick: 'click', onchange: 'change', oninput: 'input', onsubmit: 'submit',
    onfocus: 'focus', onblur: 'blur', onkeydown: 'keydown', onkeyup: 'keyup', onmouseenter: 'mouseenter', onmouseleave: 'mouseleave',
  };
  var PROP_ATTRS = { checked: 'checked', disabled: 'disabled', selected: 'selected', readonly: 'readOnly' };

  function applyAttrBinding(b, scope) {
    var el = b.el, name = b.name, tpl = b.tpl;

    if (EVENT_ATTRS[name]) {
      var domEvent = EVENT_ATTRS[name];
      var path = bareExprPath(tpl);
      var fn = path ? resolvePath(scope, path) : null;
      el.removeAttribute(name);
      var storeKey = '__dcCurrent_' + domEvent;
      if (!el['__dcBound_' + domEvent]) {
        el['__dcBound_' + domEvent] = true;
        el.addEventListener(domEvent, function (ev) {
          var h = el[storeKey];
          if (typeof h === 'function') h(ev);
        });
      }
      el[storeKey] = typeof fn === 'function' ? fn : null;
      return;
    }

    if (name === 'data-dc-src') {
      // server (pages.js) da doi src="{{ ... }}" -> data-dc-src="{{ ... }}" de trinh duyet khong
      // tu fetch chuoi placeholder tho ngay khi parse HTML (truoc khi JS kip thay gia tri that).
      el.setAttribute('src', substitute(tpl, scope));
      return;
    }

    if (PROP_ATTRS[name]) {
      var bare = bareExprPath(tpl);
      var raw = bare ? resolvePath(scope, bare) : substitute(tpl, scope);
      el[PROP_ATTRS[name]] = !!raw;
      el.removeAttribute(name);
      return;
    }

    if (name === 'value') {
      var vbare = bareExprPath(tpl);
      var vraw = vbare ? resolvePath(scope, vbare) : substitute(tpl, scope);
      var strVal = vraw == null ? '' : String(vraw);
      if (el.value !== strVal) el.value = strVal;
      el.removeAttribute('value');
      return;
    }

    el.setAttribute(name, substitute(tpl, scope));
  }

  // ---------------------------------------------------------------- binder
  function createBinder(root) {
    var textB = [], attrB = [], ifB = [], forB = [];

    (function walk(node) {
      if (node.nodeType === 3) { // TEXT_NODE
        if (node.nodeValue.indexOf('{{') !== -1) textB.push({ node: node, tpl: node.nodeValue });
        return;
      }
      if (node.nodeType !== 1) return; // ELEMENT_NODE
      var tag = node.tagName.toLowerCase();

      if (tag === 'sc-if') {
        // stash: nhanh bi an duoc CHUYEN HAN ra khoi DOM. Neu chi dat display:none,
        // <iframe> ben trong van tai va van phat tieng - 10 the video cung keu mot luc.
        ifB.push({
          el: node,
          path: bareExprPath(node.getAttribute('value') || ''),
          stash: document.createDocumentFragment(),
          shown: null,
        });
        Array.prototype.forEach.call(Array.prototype.slice.call(node.childNodes), walk);
        return;
      }
      if (tag === 'sc-for') {
        var listPath = bareExprPath(node.getAttribute('list') || '');
        var asName = node.getAttribute('as') || 'item';
        var tpls = Array.prototype.slice.call(node.childNodes).filter(function (n) { return n.nodeType === 1; });
        tpls.forEach(function (n) { node.removeChild(n); });
        forB.push({
          anchor: node, listPath: listPath, asName: asName, tpls: tpls,
          items: [], binders: [], keys: null,
        });
        return;
      }

      if (node.attributes && node.attributes.length) {
        Array.prototype.forEach.call(Array.prototype.slice.call(node.attributes), function (attr) {
          if (attr.value.indexOf('{{') !== -1) attrB.push({ el: node, name: attr.name, tpl: attr.value });
        });
      }
      Array.prototype.forEach.call(Array.prototype.slice.call(node.childNodes), walk);
    })(root);

    function render(scope) {
      textB.forEach(function (b) { b.node.nodeValue = substitute(b.tpl, scope); });
      attrB.forEach(function (b) { applyAttrBinding(b, scope); });
      ifB.forEach(function (b) {
        var show = b.path ? !!resolvePath(scope, b.path) : false;
        if (show === b.shown) return;
        if (show) b.el.appendChild(b.stash);
        else while (b.el.firstChild) b.stash.appendChild(b.el.firstChild);
        b.el.style.display = show ? 'contents' : 'none';
        b.shown = show;
      });
      forB.forEach(function (b) {
        var list = (b.listPath ? resolvePath(scope, b.listPath) : null) || [];
        var keys = list.map(function (item, i) {
          return (item && item.id !== undefined && item.id !== null) ? String(item.id) : ('#' + i);
        });
        var same = b.keys && b.keys.length === keys.length
          && b.keys.every(function (k, i) { return k === keys[i]; });

        // Danh sach khong doi -> chi cap nhat noi dung, GIU NGUYEN node cu.
        // Neu clone lai moi lan setState thi <iframe> dang phat bi thao ra va
        // nap lai tu dau: bam nut phat xong video lai den thui.
        if (same) {
          list.forEach(function (item, i) {
            var itemScope = Object.assign({}, scope);
            itemScope[b.asName] = item;
            b.binders[i].forEach(function (bd) { bd.render(itemScope); });
          });
          return;
        }

        b.items.forEach(function (it) { if (it.parentNode) it.parentNode.removeChild(it); });
        b.items = [];
        b.binders = [];
        var insertAfter = b.anchor;
        list.forEach(function (item) {
          var itemScope = Object.assign({}, scope);
          itemScope[b.asName] = item;
          var made = [];
          b.tpls.forEach(function (tplNode) {
            var clone = tplNode.cloneNode(true);
            var bd = createBinder(clone);
            bd.render(itemScope); // bind truoc khi gan vao DOM (tranh img/iframe fetch nham src tho)
            insertAfter.parentNode.insertBefore(clone, insertAfter.nextSibling);
            insertAfter = clone;
            b.items.push(clone);
            made.push(bd);
          });
          b.binders.push(made);
        });
        b.keys = keys;
      });
    }

    return { render: render };
  }

  // ---------------------------------------------------------------- DCLogic
  function DCLogic() {}
  DCLogic.prototype.setState = function (updater) {
    var partial = typeof updater === 'function' ? updater(this.state) : updater;
    this.state = Object.assign({}, this.state, partial);
    rerender();
  };

  function evalComponent(code) {
    // eslint-disable-next-line no-new-func
    var factory = new Function('DCLogic', code + '\n;return Component;');
    return factory(DCLogic);
  }

  // ---------------------------------------------------------------- boot
  var extraVals = {};
  var instance = null;
  var binder = null;
  var ready = false;
  var readyQueue = [];

  function rerender() {
    if (!binder) return;
    var base = instance && typeof instance.renderVals === 'function' ? instance.renderVals() : {};
    binder.render(Object.assign({}, base, extraVals));
  }

  function boot() {
    var scriptEl = document.querySelector('script[data-dc-script]');
    if (scriptEl) {
      try {
        var Component = evalComponent(scriptEl.textContent);
        instance = new Component();
      } catch (err) {
        console.error('[dc-runtime] loi khoi tao component thiet ke:', err);
      }
    }
    binder = createBinder(document.body);
    rerender();
    ready = true;
    readyQueue.forEach(function (cb) { try { cb(instance); } catch (e) { console.error(e); } });
    readyQueue = [];
    document.dispatchEvent(new CustomEvent('dc:ready', { detail: { instance: instance } }));
  }

  window.DC = {
    /** goi cb(instance) khi runtime da render lan dau (instance = null neu trang khong co dc-script) */
    ready: function (cb) { if (ready) cb(instance); else readyQueue.push(cb); },
    /** ghi de/bo sung gia tri vao renderVals() cua component - dung de bom du lieu that tu backend */
    setExtra: function (partial) { Object.assign(extraVals, partial || {}); rerender(); },
    getInstance: function () { return instance; },
    rerender: rerender,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
