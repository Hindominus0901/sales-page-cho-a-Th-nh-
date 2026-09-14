/**
 * Lop thay the @base44/sdk.
 *
 * Giu DUNG chu ky ham ma 97 file React dang goi, nen khong file nao khac phai
 * sua. Neu them entity/ham moi thi khai o day, dung goi fetch truc tiep trong
 * trang - de sau nay doi backend van chi phai sua mot cho.
 *
 * Khac biet duy nhat so voi Base44: phien dang nhap nam trong cookie HttpOnly
 * chu khong phai token trong localStorage, nen auth.setToken() la ham rong.
 */
import { createAxiosClient } from '@/lib/http-client';

const api = createAxiosClient({ baseURL: '/api' });

/** Cac entity co that - goi ten sai se bao loi ngay thay vi ra 404 kho hieu. */
export const ENTITY_NAMES = [
  'Activity', 'ActivityType', 'AdminLog', 'AppSetting', 'Badge', 'CalendarEvent', 'Challenge',
  'ChallengeDayTask', 'ChallengeMember', 'ChallengeSubmission', 'CoinTransaction',
  'Course', 'Entitlement', 'EventSignup', 'Lesson', 'LessonProgress', 'Level', 'Notification',
  'PointRule', 'PortalSection', 'Post', 'PostComment', 'PostLike', 'Product',
  'Recording', 'Redemption', 'Reward', 'Staff', 'Team', 'User', 'UserBadge',
  'XpTransaction',
];

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
};

function entityClient(name) {
  const base = `/entities/${name}`;
  return {
    /** list(sort?, limit?) - sort la ten cot, tien to '-' la giam dan. */
    list: (sort, limit) => api.get(base + qs({ sort, limit })),
    /** filter(objBangNhau, sort?, limit?) - chi so sanh bang. */
    filter: (filter, sort, limit) => api.get(base + qs({ filter, sort, limit })),
    get: (id) => api.get(`${base}/${encodeURIComponent(id)}`),
    create: (data) => api.post(base, data),
    update: (id, data) => api.put(`${base}/${encodeURIComponent(id)}`, data),
    delete: (id) => api.delete(`${base}/${encodeURIComponent(id)}`),
    updateMany: (filter, update) => api.post(`${base}/updateMany`, { filter, update }),
  };
}

export const entities = Object.fromEntries(
  ENTITY_NAMES.map((name) => [name, entityClient(name)]),
);

/** Duong dan cung origin, chan mo redirect sang site khac. */
// "/" thuoc ve trang ban hang (Worker phuc vu no o do), nen no KHONG dung lam
// diem tra ve sau khi dang nhap - se nem nguoi dung ra khoi app.
const APP_HOME = '/dashboard';

const safePath = (value, fallback = APP_HOME) => {
  const raw = String(value || '');
  if (!/^\/(?!\/)/.test(raw)) return fallback;
  return raw === '/' ? fallback : raw;
};

export const auth = {
  me: () => api.get('/auth/me'),
  updateMe: (patch) => api.patch('/auth/me', patch),

  register: ({ email, password, full_name } = {}) =>
    api.post('/auth/register', { email, password, full_name }),
  verifyOtp: ({ email, otpCode } = {}) =>
    api.post('/auth/verify-otp', { email, otp_code: otpCode }),
  resendOtp: (email) => api.post('/auth/resend-otp', { email }),

  loginViaEmailPassword: (email, password) =>
    api.post('/auth/login', { email, password }),

  resetPasswordRequest: (email) => api.post('/auth/reset-request', { email }),
  resetPassword: ({ resetToken, newPassword } = {}) =>
    api.post('/auth/reset', { reset_token: resetToken, new_password: newPassword }),

  // Phien nam trong cookie HttpOnly -> khong co token nao de giu o phia trinh duyet.
  setToken: () => {},
  isAuthenticated: async () => {
    try { await api.get('/auth/me'); return true; } catch { return false; }
  },

  logout: async (redirectTo) => {
    try { await api.post('/auth/logout'); } catch { /* van dang xuat o phia trinh duyet */ }
    if (redirectTo) window.location.href = redirectTo;
  },

  redirectToLogin: (returnTo) => {
    const target = safePath(returnTo && new URL(returnTo, window.location.origin).pathname);
    window.location.href = `/login?returnTo=${encodeURIComponent(target)}`;
  },

  loginWithProvider: (provider, returnTo) => {
    const target = safePath(returnTo);
    window.location.href =
      `/api/auth/${encodeURIComponent(provider)}/start?returnTo=${encodeURIComponent(target)}`;
  },
};

export const functions = {
  invoke: (name, payload = {}) => api.post(`/functions/${encodeURIComponent(name)}`, payload),
};

export const integrations = {
  Core: {
    UploadFile: async ({ file }) => {
      const form = new FormData();
      form.append('file', file);
      return api.post('/files', form); // -> { file_url }
    },
  },
};

export const agents = {
  listConversations: ({ agent_name } = {}) =>
    api.get('/agents/conversations' + qs({ agent_name })),
  createConversation: ({ agent_name, metadata } = {}) =>
    api.post('/agents/conversations', { agent_name, metadata }),
  addMessage: (conversation, message) =>
    api.post(`/agents/conversations/${encodeURIComponent(conversation.id)}/messages`, message),

  /**
   * Base44 day tin nhan xuong bang ket noi truc tiep. O day hoi lai moi 1,5
   * giay - SupportChat khong phan biet duoc. Nang len SSE sau neu can.
   */
  subscribeToConversation: (conversationId, onData) => {
    let stopped = false;
    let seen = 0;

    const tick = async () => {
      if (stopped) return;
      try {
        const messages = await api.get(
          `/agents/conversations/${encodeURIComponent(conversationId)}/messages`,
        );
        if (!stopped && Array.isArray(messages) && messages.length !== seen) {
          seen = messages.length;
          onData({ messages });
        }
      } catch { /* mang chap chon - lan sau thu lai */ }
    };

    const timer = setInterval(tick, 1500);
    tick();
    return () => { stopped = true; clearInterval(timer); };
  },
};

/**
 * Trang Affiliate doc so lieu tu phan funnel, khong phai tu bang entity - nen
 * no la ngoai le duy nhat nam ngoai `entities`. 404 nghia la nguoi dung chua
 * dang ky qua funnel, khong phai loi he thong.
 */
export const affiliateApi = {
  me: () => api.get('/affiliate/me'),
};

/**
 * API quan tri cua FUNNEL (/api/admin/*) - doanh thu, don hang, affiliate.
 *
 * Khac han lop entity o tren: khong doc phien dang nhap cua hoc vien ma doc
 * phien quan tri rieng cua funnel (dat bang ADMIN_PASSWORD_HASH). Vi vay mot
 * admin cua nen tang van co the nhan 401 o day neu chua dang nhap khu vuc do -
 * trang goi phai bat truong hop nay chu dung coi la loi he thong.
 */
const adminHttp = createAxiosClient({ baseURL: '/api/admin' });

export const adminApi = {
  me: () => adminHttp.get('/me'),
  stats: () => adminHttp.get('/stats'),

  orders: ({ status, limit, offset } = {}) => adminHttp.get('/orders' + qs({ status, limit, offset })),
  markOrderPaid: (code, body = {}) => adminHttp.post(`/orders/${encodeURIComponent(code)}/paid`, body),
  cancelOrder: (code, reason) => adminHttp.post(`/orders/${encodeURIComponent(code)}/cancel`, { reason }),

  affiliates: ({ q, limit, offset } = {}) => adminHttp.get('/affiliates' + qs({ q, limit, offset })),
  commissions: ({ status, limit } = {}) => adminHttp.get('/commissions' + qs({ status, limit })),
  payCommission: (id, note) => adminHttp.post(`/commissions/${encodeURIComponent(id)}/paid`, { note }),
  voidCommission: (id, reason) => adminHttp.post(`/commissions/${encodeURIComponent(id)}/void`, { reason }),

  // Giao dich ngan hang do webhook SePay bao ve. API co tu lau nhung khong
  // trang nao goi - nen khong co cach nao nhin thay webhook co toi hay khong
  // ma khong mo thang database.
  bankTxns: (limit) => adminHttp.get('/bank-txns' + qs({ limit })),

  pendingReferrals: (limit) => adminHttp.get('/referrals/pending' + qs({ limit })),
  maLa: (limit) => adminHttp.get('/ref-ma-la' + qs({ limit })),
  traoThuongBu: () => adminHttp.post('/trao-thuong-bu', {}),
  ganMaLa: (ma, code) => adminHttp.post(`/ref-ma-la/${encodeURIComponent(ma)}/gan`, { code }),
  setReferral: (id, action, reason) =>
    adminHttp.post(`/referrals/${encodeURIComponent(id)}/${action === 'valid' ? 'valid' : 'void'}`, { reason }),

  // Kit (ConvertKit) - danh sach nguoi nhan va chuoi email nuoi duong
  kitStatus: () => adminHttp.get('/kit/status'),
  kitLists: () => adminHttp.get('/kit/lists'),
  kitTest: (email) => adminHttp.post('/kit/test', { email }),
  kitBackfill: (body) => adminHttp.post('/kit/backfill', body),
};

export const base44 = { entities, auth, functions, integrations, agents, adminApi };
export default base44;
