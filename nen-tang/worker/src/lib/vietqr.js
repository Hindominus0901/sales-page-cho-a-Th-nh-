/**
 * Link anh VietQR (img.vietqr.io) - quet duoc bang moi app ngan hang Viet Nam.
 * Khong goi API, khong can khoa: chi la mot dia chi anh dung theo quy uoc.
 * template: compact | compact2 | qr_only | print
 */
export function qrImageUrl(cfg, { amount, content, template = 'qr_only' }) {
  const { bin, account, accountName } = cfg.bank;
  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo: content,
    accountName,
  });
  return `https://img.vietqr.io/image/${bin}-${account}-${template}.png?${params.toString()}`;
}

/** Thong tin chuyen khoan thu cong hien tren trang thanh toan. */
export function transferInfo(cfg, { amount, content }) {
  return {
    bank_name: cfg.bank.name,
    bank_bin: cfg.bank.bin,
    account_number: cfg.bank.account,
    account_name: cfg.bank.accountName,
    amount,
    amount_text: cfg.formatPrice(amount),
    content,
    qr_url: qrImageUrl(cfg, { amount, content }),
    qr_url_full: qrImageUrl(cfg, { amount, content, template: 'compact2' }),
  };
}
