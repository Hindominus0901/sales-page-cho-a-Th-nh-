// SINH TU brand/brand.json BOI scripts/brand/apply.mjs - DUNG SUA TAY.
// Sua duong dan o brand/brand.json roi chay: npm run brand:apply

/**
 * Trang ban hang duoc dung san vao dist/public/f/ nhung phuc vu o goc ten mien.
 * Lop asset cua Cloudflare tu bo duoi ".html" nen dich la "/f/dang-ky".
 */
export const FUNNEL_PAGES = [
  ["/", "/f/"],
  ["/dang-ky", "/f/dang-ky"],
  ["/thanh-toan", "/f/thanh-toan"],
  ["/tra-cuu", "/f/tra-cuu"],
  ["/chinh-sach-hoan-tien", "/f/chinh-sach-hoan-tien"],
  ["/workshop", "/f/workshop"],
  ["/ban-do-21-ngay", "/f/ban-do-21-ngay"],
];

/**
 * Nhung trang KHONG doi theo thuong hieu:
 *   /quan-tri-funnel  trang quan tri cu cua funnel (de o /admin thi no che mat
 *                     cong quan tri moi nam trong SPA)
 *   /dai-ly           cong cua nguoi gioi thieu
 *   hai trang phap ly Google bat buoc phai co moi cho xuat ban ung dung OAuth
 */
export const FUNNEL_FIXED = [
  ['/quan-tri-funnel', '/f/admin'],
  ['/dai-ly', '/f/dai-ly'],
  ['/chinh-sach-bao-mat', '/f/chinh-sach-bao-mat'],
  ['/dieu-khoan', '/f/dieu-khoan'],
  ['/robots.txt', '/f/robots.txt'],
];
