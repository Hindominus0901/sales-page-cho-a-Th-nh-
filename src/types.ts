export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;

  // vars (công khai)
  APP_ENV: 'development' | 'preview' | 'production';
  PUBLIC_BASE_URL: string;
  SEPAY_BANK_CODE: string;
  SEPAY_BANK_NAME: string;
  SEPAY_ACCOUNT_NO: string;
  SEPAY_ACCOUNT_NAME: string;
  ORDER_CODE_PREFIX: string;
  AFFILIATE_DEFAULT_RATE_BP: string;
  AFFILIATE_COOKIE_DAYS: string;
  COMMISSION_HOLD_DAYS: string;

  // secrets
  SESSION_SECRET: string;
  IP_HASH_SALT: string;
  SEPAY_WEBHOOK_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  /** Chưa đặt thì email vào hàng đợi rồi đánh dấu 'skipped' — hệ vẫn chạy bình thường. */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

/** Ngữ cảnh gắn vào mọi request công khai bởi middleware attribution. */
export interface VisitorContext {
  visitorId: string;
  affiliateId: string | null;   // chạm đầu tiên, đọc từ cookie gc_ref
  ipHash: string | null;
  userAgent: string | null;
  utm: UtmParams;
  referer: string | null;
  country: string | null;
  device: 'mobile' | 'tablet' | 'desktop' | null;
}

export interface UtmParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    visitor: VisitorContext;
    adminId?: string;
    affiliateId?: string;
    sessionId?: string;
  };
};
