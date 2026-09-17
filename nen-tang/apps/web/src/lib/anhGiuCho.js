/**
 * Anh giu cho khi mot buc anh khong tai duoc.
 *
 * VI SAO TU VE CHU KHONG TAI VE
 *
 * Duong du phong duy nhat cua app truoc day tro toi mot tep tren CDN cua Wix
 * (components/ui/image.jsx, di tich tu ban goc Base44). Mot app tu host tren
 * Cloudflare ma duong HONG lai phu thuoc mot ben thu ba khong lien quan: neu
 * Wix doi duong dan hay chan luot truy cap, thi ngay ca cai bien bao "anh nay
 * hong" cung hong theo - va khong ai o day biet duoc.
 *
 * Day la data: URI nen no nam trong chinh goi JavaScript. Khong co luot mang
 * nao, khong the hong, chay duoc ca khi mat mang.
 *
 * CSP dang cho phep `data:` trong img-src (worker/src/lib/respond.js) nen the
 * <img> ve duoc.
 */

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">`
  + `<rect width="400" height="300" fill="#e7e5e4"/>`
  + `<g fill="none" stroke="#a8a29e" stroke-width="8" stroke-linejoin="round">`
  + `<rect x="150" y="110" width="100" height="76" rx="8"/>`
  + `<path d="M150 168l28-26 22 20 24-30 26 36"/></g>`
  + `<circle cx="222" cy="132" r="7" fill="#a8a29e"/></svg>`;

export const ANH_GIU_CHO = `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`;

/**
 * Gan vao `onError` cua mot the <img> tran.
 *
 * Tu go chinh minh ra khoi su kien sau lan dau (`onerror = null`): neu anh giu
 * cho vi ly do nao do cung khong ve duoc thi trinh duyet se ban su kien error
 * mot lan nua, va vong lap vo tan do lam treo tab.
 */
export function khiAnhHong(e) {
  const img = e.currentTarget;
  if (!img || img.dataset.daThay === '1') return;
  img.dataset.daThay = '1';
  img.onerror = null;
  img.src = ANH_GIU_CHO;
}
