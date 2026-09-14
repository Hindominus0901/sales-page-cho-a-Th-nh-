/**
 * Phan thuong cho nguoi gioi thieu.
 *
 * TAM THOI van nam trong code nhu ban cu (co the ghi de bang bien moi truong
 * REWARD_TIERS_JSON / SHARE_MESSAGES_JSON). Giai doan 6 se chuyen han vao D1
 * de admin tu sua trong trang quan tri, khong phai deploy lai.
 */

/**
 * Ban MAC DINH trung tinh - chi de he thong chay duoc khi chua cau hinh gi.
 * Phan thuong that dat trong REWARD_TIERS_JSON (sinh tu brand/brand.json) hoac
 * sua trong trang quan tri. Truoc day o day ghi ten qua that cua mot khach
 * ("Buoi Q&A rieng voi <ten nguoi>") - ai cam ma nay ve ma quen doi la moi
 * nguoi gioi thieu duoc hua mot buoi hoc voi mot nguoi ho chua tung gap.
 *
 * Cau chu o day LA CAU KHACH DOC. Ban cu viet thang "dat trong
 * REWARD_TIERS_JSON" - va no da nam nguyen tren ban that: moi cong tac vien mo
 * trang deu thay ba dong ten bien moi truong thay cho ten phan thuong. Loi
 * nhac cho nguoi quan tri di bang console.warn ben duoi, khong bay ra mat khach.
 */
const DEFAULT_TIERS = [
  {
    level: 2,
    target: 2,
    title: 'Phần thưởng mốc 2 người',
    value: 0,
    description: 'Phần thưởng sẽ được công bố sớm.',
  },
  {
    level: 3,
    target: 5,
    title: 'Phần thưởng mốc 5 người',
    value: 0,
    description: 'Phần thưởng sẽ được công bố sớm.',
  },
  {
    level: 4,
    target: 10,
    title: 'Phần thưởng mốc 10 người',
    value: 0,
    description: 'Phần thưởng sẽ được công bố sớm.',
  },
];

/**
 * Cau chu chia se san. {link} duoc thay bang link gioi thieu, {ten} bang ten
 * chuong trinh. Dat cau that trong SHARE_MESSAGES_JSON.
 */
const DEFAULT_SHARE_MESSAGES = {
  zalo: 'Mình vừa giữ chỗ {ten}. Miễn phí, mình thấy hợp với bạn nên gửi luôn: {link}',
  facebook: 'Mình đang tham gia {ten} (miễn phí). Ai quan tâm thì vào cùng mình nhé: {link}',
  sms: 'Mình gửi bạn vé miễn phí {ten}: {link}',
};

const parseJson = (env, key, fallback) => {
  const raw = env[key];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`[rewards] ${key} khong phai JSON hop le, dung gia tri mac dinh`);
    return fallback;
  }
};

/**
 * @param {object} env  bien moi truong cua Worker
 * @param {object} cfg  ket qua readConfig(env) - can formatPrice
 */
export function createRewards(env, cfg) {
  if (!env.REWARD_TIERS_JSON) {
    console.warn('[rewards] CHUA dat REWARD_TIERS_JSON - trang cong tac vien dang'
      + ' hien "Phần thưởng sẽ được công bố sớm" thay cho phan thuong that.');
  }
  const TIERS = parseJson(env, 'REWARD_TIERS_JSON', DEFAULT_TIERS)
    .map((t) => ({ ...t, target: Number(t.target), level: Number(t.level) }))
    .sort((a, b) => a.target - b.target);

  const CONTEST = {
    title: env.CONTEST_TITLE || 'Cuộc đua Top 5',
    prize_pool: Number(env.CONTEST_PRIZE_POOL || 50000000),
    top: Number(env.CONTEST_TOP || 5),
    // Chi tinh nguoi dang ky trong khoang nay (ISO date). De trong = tinh tat ca.
    starts_at: env.CONTEST_START || '',
    ends_at: env.CONTEST_END || '',
  };

  const SHARE_MESSAGES = parseJson(env, 'SHARE_MESSAGES_JSON', DEFAULT_SHARE_MESSAGES);
  const MAX_TARGET = TIERS.length ? TIERS[TIERS.length - 1].target : 0;
  const money = (amount) => cfg.formatPrice(amount);

  /** Trang thai tung bac ung voi so luot gioi thieu hop le hien tai. */
  const tierStatus = (validReferrals) => TIERS.map((tier) => ({
    level: tier.level,
    target: tier.target,
    title: tier.title,
    description: tier.description,
    value: tier.value,
    value_text: money(tier.value),
    unlocked: validReferrals >= tier.target,
    remaining: Math.max(0, tier.target - validReferrals),
  }));

  /** Bac cao nhat da dat (1 = chua dat bac nao). */
  const levelFor = (validReferrals) => {
    let level = 1;
    for (const tier of TIERS) {
      if (validReferrals >= tier.target) level = Math.max(level, tier.level);
    }
    return level;
  };

  /** Bac ke tiep, null neu da dat het. */
  const nextTier = (validReferrals) => {
    const tier = TIERS.find((t) => validReferrals < t.target);
    if (!tier) return null;
    return {
      level: tier.level,
      target: tier.target,
      title: tier.title,
      value_text: money(tier.value),
      remaining: tier.target - validReferrals,
    };
  };

  const progress = (validReferrals) => {
    const next = nextTier(validReferrals);
    const target = next ? next.target : MAX_TARGET || 1;
    return {
      valid_referrals: validReferrals,
      next_target: next ? next.target : null,
      remaining: next ? next.remaining : 0,
      percent: Math.min(100, Math.round((validReferrals / target) * 100)),
      completed_all: !next,
    };
  };

  // {ten} = ten chuong trinh cua thuong hieu dang chay. Truoc day ten nay viet
  // thang trong cau chu, nen khach moi gui di mot loi moi mang ten chuong trinh
  // cua nguoi khac.
  const tenChuongTrinh = cfg?.brand?.productLine || cfg?.brand?.name || cfg?.product?.name || '';
  const shareMessages = (link) => Object.fromEntries(
    Object.entries(SHARE_MESSAGES).map(([key, text]) => [
      key,
      String(text).split('{link}').join(link).split('{ten}').join(tenChuongTrinh),
    ]),
  );

  return {
    // Chua dat REWARD_TIERS_JSON = dang chay ban mac dinh, tuc chua co phan
    // thuong that. Trang cong tac vien an han khoi do di, thay vi hua mot thu
    // chua ai chot noi dung.
    tiersConfigured: !!env.REWARD_TIERS_JSON,
    TIERS, CONTEST, SHARE_MESSAGES, MAX_TARGET,
    tierStatus, levelFor, nextTier, progress, shareMessages,
    contestInfo: () => ({ ...CONTEST, prize_pool_text: money(CONTEST.prize_pool) }),
  };
}
