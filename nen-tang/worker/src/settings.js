/**
 * Doc bang app_settings.
 *
 * Cau hinh admin sua duoc nam trong co so du lieu chu khong trong bien moi
 * truong: doi mot con so khong phai deploy lai. Bi mat (kho API) van la secret
 * cua Worker - khong bao gio cat vao day, vi entity AppSetting cho phep doc.
 *
 * Nho ket qua trong pham vi MOT request: mot lan xu ly co the hoi cung mot
 * khoa nhieu lan, khong can hoi D1 nhieu lan.
 */

/** Ep chuoi trong DB ve dung kieu da khai o cot `type`. */
function cast(row) {
  const v = row.value;
  switch (row.type) {
    case 'number': {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case 'bool': return /^(1|true|yes|on)$/i.test(String(v));
    case 'json':
      try { return JSON.parse(v); } catch { return null; }
    default: return v === '' ? null : v;
  }
}

/**
 * @param {object} rc
 * @param {string[]} keys
 * @returns {Promise<Record<string, any>>} khoa nao khong co thi khong xuat hien
 */
export async function readSettings(rc, keys) {
  if (!keys.length) return {};
  rc._settings = rc._settings || {};

  const missing = keys.filter((k) => !(k in rc._settings));
  if (missing.length) {
    const holes = missing.map(() => '?').join(',');
    let rows = [];
    try {
      rows = await rc.store.all(
        `SELECT key, value, type FROM app_settings WHERE key IN (${holes})`, missing);
    } catch (err) {
      // Chua chay migration -> coi nhu chua cau hinh, dung lam sap request.
      console.warn('[settings] khong doc duoc app_settings:', err?.message || err);
    }
    // Danh dau ca khoa KHONG co trong bang, khong thi lan sau lai hoi lai.
    for (const k of missing) rc._settings[k] = undefined;
    for (const row of rows) rc._settings[row.key] = cast(row);
  }

  const out = {};
  for (const k of keys) if (rc._settings[k] !== undefined) out[k] = rc._settings[k];
  return out;
}

/** Doc mot khoa, tra ve `fallback` neu chua dat. */
export async function readSetting(rc, key, fallback = null) {
  const map = await readSettings(rc, [key]);
  return key in map ? map[key] : fallback;
}
