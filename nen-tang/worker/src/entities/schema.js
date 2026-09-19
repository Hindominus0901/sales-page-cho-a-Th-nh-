/**
 * Khai bao du lieu VA quyen cho tung entity.
 *
 * Day la mot API tong quat: trinh duyet goi thang /api/entities/<Ten>. Neu
 * khong khai bao chat, mot thanh vien binh thuong se doc duoc email va so dien
 * thoai cua toan bo hoc vien, hoac tu cong XP cho minh. Vi vay:
 *
 *   MAC DINH LA TU CHOI. Entity khong co trong bang nay -> 403 moi thao tac.
 *
 * Y nghia cac muc quyen:
 *   read   'all'          moi nguoi da dang nhap deu doc duoc
 *          'own'          chi dong cua chinh minh
 *          'own_or_staff' cua minh, hoac coach/admin doc tat ca
 *          'admin'        chi admin
 *   create 'self'         tu tao dong cua chinh minh (owner bi ep = minh)
 *          'admin'        chi admin
 *          'never'        khong ai tao qua HTTP duoc (chi ham noi bo)
 *   update/delete: 'own' | 'own_or_admin' | 'admin' | 'never'
 *
 *   fields   ten cot -> kieu, dung de doi qua lai giua JSON va SQLite
 *   writable danh sach TRANG cac cot duoc ghi, theo vai tro nguoi goi
 *   readable.public  cot duoc lo ra khi nguoi doc KHONG phai chu so huu/admin
 *                    (khong khai = lo het, chi dung cho bang khong co gi rieng tu)
 */

const BASE_FIELDS = {
  id: 'string',
  created_date: 'string',
  updated_date: 'string',
  created_by: 'string',
};

const def = (entity) => ({
  ...entity,
  fields: { ...BASE_FIELDS, ...entity.fields },
});

export const ENTITIES = {
  // --------------------------------------------------------------- nguoi dung
  User: def({
    table: 'users',
    ownerField: 'id',
    read: 'all',
    create: 'never',            // chi qua /api/auth/register
    update: 'admin',            // ho so cua chinh minh sua qua PATCH /api/auth/me
    delete: 'never',
    fields: {
      email: 'string', email_verified: 'bool', full_name: 'string',
      role: 'string', status: 'string', avatar_url: 'string', phone: 'string',
      phone_e164: 'string', bio: 'string', team_id: 'string', mentor_id: 'string',
      total_xp: 'number', total_coin: 'number', content_count: 'number',
      call_count: 'number', assignment_count: 'number',
      current_streak: 'number', longest_streak: 'number', last_activity_date: 'string',
      legacy_lead_id: 'number', source: 'string', org_id: 'string',
    },
    // Ai cung xem duoc bang xep hang, nhung KHONG duoc thay email/dien thoai
    // cua nguoi khac. Day la lo hong lon nhat neu quen khai.
    readable: {
      public: ['id', 'full_name', 'avatar_url', 'role', 'status', 'total_xp', 'total_coin',
        'content_count', 'call_count', 'assignment_count', 'current_streak', 'longest_streak',
        'last_activity_date', 'team_id', 'bio', 'created_date'],
    },
    writable: {
      admin: ['full_name', 'role', 'status', 'avatar_url', 'phone', 'bio', 'team_id',
        'mentor_id', 'total_xp', 'total_coin'],
    },
    // Khong bao gio cho ai (ke ca admin) tu dat minh thanh admin qua duong nay.
    guard: (rc, patch, row) => {
      if (row && row.id === rc.user.id && patch.role && patch.role !== row.role) {
        return 'Không thể tự đổi vai trò của chính mình.';
      }
      return null;
    },
  }),

  Team: def({
    table: 'teams',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      name: 'string', description: 'string', mentor_id: 'string', color: 'string',
      capacity: 'number',   // 0 = khong gioi han
    },
  }),

  // ------------------------------------------------------------ cau hinh chung
  // Doc duoc de hien giao dien; ghi thi chi admin.
  Level: def({
    table: 'levels',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      level_number: 'number', name: 'string', threshold_xp: 'number', icon: 'string',
      perk: 'string', description: 'string', is_active: 'bool',
    },
  }),

  ActivityType: def({
    table: 'activity_types',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      name: 'string', key: 'string', description: 'string', icon: 'string', category: 'string',
      xp_reward: 'number', coin_reward: 'number', daily_cap: 'number',
      is_active: 'bool', sort_order: 'number', ai_criteria: 'string',
    },
  }),

  Badge: def({
    table: 'badges',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      name: 'string', key: 'string', icon: 'string', description: 'string',
      condition: 'string', condition_type: 'string', condition_value: 'number',
      xp_bonus: 'number', coin_bonus: 'number', is_active: 'bool', sort_order: 'number',
    },
  }),

  Reward: def({
    table: 'rewards',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      name: 'string', image_url: 'string', description: 'string', coin_cost: 'number',
      quantity: 'number', min_level: 'number', expiration_date: 'string', category: 'string',
      // Dieu kien "mo khoa bang loi moi, khong phai bang tien" cua ve Premium.
      min_referrals: 'number',
      is_active: 'bool', is_hot: 'bool', sort_order: 'number',
      // Qua co delivery_url duoc giao ngay khi doi, khong qua hang doi duyet.
      delivery_url: 'string', delivery_note: 'string',
    },
    // Chinh cai link do LA mon hang. Cua hang phai hien ten/anh/gia xu cho moi
    // nguoi xem truoc khi doi, nen bang nay doc cong khai - va neu khong che hai
    // cot nay thi mot lenh GET /api/entities/Reward lay het qua ma khong mat mot
    // xu nao, ke ca qua khoa theo min_referrals. Dung lo hong ma
    // `products.delivery_url` ben duoi da duoc va; bang nay bi bo sot.
    gatedFields: ['delivery_url', 'delivery_note'],
    gateBy: 'redemption',
  }),

  AppSetting: def({
    table: 'app_settings',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      key: 'string', value: 'string', type: 'string', options_json: 'json',
      category: 'string', label: 'string', description: 'string', sort_order: 'number',
    },
  }),

  PointRule: def({
    table: 'point_rules',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      event_key: 'string', label: 'string', xp: 'number', coin: 'number',
      daily_cap: 'number', lifetime_cap: 'number', requires_approval: 'bool',
      conditions_json: 'json', is_active: 'bool', sort_order: 'number',
    },
  }),

  PortalSection: def({
    table: 'portal_sections',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      page_key: 'string', section_key: 'string', label: 'string',
      visible: 'bool', sort_order: 'number',
    },
  }),

  Staff: def({
    table: 'staff',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      user_id: 'string', name: 'string', email: 'string', avatar_url: 'string',
      role_label: 'string', assigned_members: 'number', reviewed_count: 'number',
      is_active: 'bool', sort_order: 'number',
    },
  }),

  // ----------------------------------------------------------------- hoat dong
  Activity: def({
    table: 'activities',
    ownerField: 'user_id',
    // Ban Base44 de "read: {}" (ai cung doc duoc TAT CA) - nghia la moi thanh
    // vien doc duoc link bang chung, ghi chu va nhan xet AI cua nguoi khac.
    read: 'own_or_staff',
    create: 'self',
    update: 'own_or_admin',
    delete: 'own_or_admin',
    fields: {
      user_id: 'string', user_name: 'string', activity_type_id: 'string',
      activity_type_key: 'string', activity_type_name: 'string', date: 'string',
      title: 'string', description: 'string', evidence_link: 'string',
      screenshot_url: 'string', notes: 'string', status: 'string',
      xp_awarded: 'number', coin_awarded: 'number', counted_for_cap: 'bool',
      reviewed_by: 'string', reviewed_at: 'string', rejection_reason: 'string',
      ai_score: 'number', ai_feedback: 'string', ai_scored_at: 'string',
      ai_rubric_json: 'json',
    },
    // Nguoi nop chi duoc sua noi dung bai; diem va trang thai la viec cua he
    // thong. Neu khong, ai cung tu dat xp_awarded cho minh.
    writable: {
      self: ['title', 'description', 'evidence_link', 'screenshot_url', 'notes',
        'activity_type_id', 'activity_type_key', 'activity_type_name', 'date'],
      admin: ['status', 'rejection_reason', 'reviewed_by', 'reviewed_at', 'notes',
        'ai_score', 'ai_feedback', 'ai_rubric_json'],
    },
  }),

  XpTransaction: def({
    table: 'xp_transactions',
    ownerField: 'user_id',
    read: 'own_or_staff',
    create: 'never',            // chi awardPoints() duoc ghi so cai
    update: 'never',
    delete: 'never',
    fields: {
      user_id: 'string', user_name: 'string', amount: 'number',
      source: 'string', source_id: 'string', description: 'string',
    },
  }),

  CoinTransaction: def({
    table: 'coin_transactions',
    ownerField: 'user_id',
    read: 'own_or_staff',
    create: 'never',
    update: 'never',
    delete: 'never',
    fields: {
      user_id: 'string', user_name: 'string', amount: 'number', type: 'string',
      source: 'string', source_id: 'string', description: 'string',
    },
  }),

  UserBadge: def({
    table: 'user_badges',
    ownerField: 'user_id',
    read: 'all',                // huy hieu la thanh tich cong khai
    create: 'never',
    update: 'never',
    delete: 'admin',
    fields: {
      user_id: 'string', user_name: 'string', badge_id: 'string',
      badge_name: 'string', badge_icon: 'string',
    },
  }),

  // ----------------------------------------------------------------- thu thach
  Challenge: def({
    table: 'challenges',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      name: 'string', banner_url: 'string', description: 'string',
      start_date: 'string', end_date: 'string', duration_days: 'number',
      target: 'number', target_activity_key: 'string',
      reward_xp: 'number', reward_coin: 'number', reward_badge_id: 'string',
      rules: 'string', hero_video_url: 'string', requires_unlock: 'bool', is_active: 'bool',
    },
  }),

  ChallengeDayTask: def({
    table: 'challenge_day_tasks',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      challenge_id: 'string', day: 'number', title: 'string', guide: 'string',
      video_title: 'string', video_url: 'string',
      assignment_url: 'string', doc_url: 'string', xp: 'number', coin: 'number',
      // Buoi live ung voi ngay nay. Co no thi the ngay trong thu thach hien nut
      // diem danh; de trong thi khong. Xem migration 0010.
      event_id: 'string',
    },
    // Ten nhiem vu va lich thi cho xem (de con biet ma tham gia), nhung video va
    // bai tap thi chi nguoi DA THAM GIA moi thay. Khong che thi mot lenh GET la
    // lay duoc noi dung cua moi ngay trong moi thu thach - ke ca thu thach doi
    // mo khoa, vi `requires_unlock` chi chan joinChallenge chu khong chan doc
    // bang nay. `Lesson` ben duoi da che dung kieu nay.
    gatedFields: ['video_url', 'assignment_url', 'doc_url'],
    gateBy: 'challenge',
  }),

  ChallengeMember: def({
    table: 'challenge_members',
    ownerField: 'user_id',
    read: 'all',                // de hien so nguoi tham gia va bang xep hang
    // THAM GIA PHAI QUA joinChallenge, khong tu tao duoc o day.
    //
    // Truoc day la `create: 'self'` ma KHONG khai `writable`, nen repo.js cho
    // ghi moi cot. Mot lenh POST /api/entities/ChallengeMember voi
    // {challenge_id, progress: 999, completed: true} vua bo qua toan bo kiem tra
    // cua joinChallenge (`requires_unlock` + entitlement), vua ghi thang tien do
    // gia len bang xep hang. Giao dien khong he goi duong nay - no luon di qua
    // joinChallenge - nen dong lai khong mat gi.
    create: 'never',
    update: 'admin',            // tien do do he thong tinh, khong tu khai
    delete: 'own_or_admin',
    fields: {
      challenge_id: 'string', challenge_name: 'string', user_id: 'string',
      user_name: 'string', progress: 'number', completed: 'bool', joined_at: 'string',
    },
    writable: { admin: ['progress', 'completed'] },
    readable: { public: ['id', 'challenge_id', 'user_id', 'user_name', 'progress', 'completed', 'created_date'] },
  }),

  ChallengeSubmission: def({
    table: 'challenge_submissions',
    ownerField: 'user_id',
    read: 'own_or_staff',
    create: 'self',
    update: 'own_or_admin',
    delete: 'admin',
    fields: {
      challenge_id: 'string', user_id: 'string', user_name: 'string', day: 'number',
      content: 'string', link: 'string', file_url: 'string', status: 'string',
      score: 'number', feedback: 'string', ai_rubric_json: 'json',
      xp_awarded: 'number', coin_awarded: 'number', reviewed_by: 'string', reviewed_at: 'string',
    },
    writable: {
      self: ['content', 'link', 'file_url'],
      admin: ['status', 'score', 'feedback', 'ai_rubric_json', 'reviewed_by', 'reviewed_at'],
    },
  }),

  // ------------------------------------------------------------------ qua tang
  Redemption: def({
    table: 'redemptions',
    ownerField: 'user_id',
    read: 'own_or_staff',
    create: 'never',            // phai qua ham redeemReward (co tru xu)
    update: 'admin',
    delete: 'admin',
    fields: {
      user_id: 'string', user_name: 'string', reward_id: 'string', reward_name: 'string',
      reward_image_url: 'string', coin_spent: 'number', status: 'string', note: 'string',
      // Chep tu reward luc doi, khong doc nguoc: doi link mon qua sau nay
      // khong duoc lam thay doi thu nguoi ta da nhan.
      delivery_url: 'string',
    },
  }),

  // ------------------------------------------------------------------ cong dong
  Post: def({
    table: 'posts',
    ownerField: 'user_id',
    read: 'all',
    create: 'self',
    update: 'own_or_admin',
    delete: 'own_or_admin',
    fields: {
      user_id: 'string', user_name: 'string', body: 'string', image_url: 'string',
      like_count: 'number', comment_count: 'number', is_pinned: 'bool', is_hidden: 'bool',
    },
    // So tim/binh luan do he thong dem, khong cho tu khai.
    writable: {
      self: ['body', 'image_url'],
      admin: ['body', 'image_url', 'is_pinned', 'is_hidden'],
    },
  }),

  PostComment: def({
    table: 'post_comments',
    ownerField: 'user_id',
    read: 'all',
    create: 'self',
    update: 'own_or_admin',
    delete: 'own_or_admin',
    fields: {
      post_id: 'string', user_id: 'string', user_name: 'string',
      body: 'string', is_hidden: 'bool',
    },
    writable: { self: ['body'], admin: ['body', 'is_hidden'] },
  }),

  PostLike: def({
    table: 'post_likes',
    ownerField: 'user_id',
    read: 'all',
    create: 'never',            // qua ham togglePostLike de dem cho dung
    update: 'never',
    delete: 'never',
    fields: { post_id: 'string', user_id: 'string' },
  }),

  // -------------------------------------------------------------------- lop hoc
  Course: def({
    table: 'courses',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      name: 'string', description: 'string', thumbnail_url: 'string',
      min_level: 'number', requires_unlock: 'bool', is_active: 'bool', sort_order: 'number',
      // Link ban ghi buoi hoc va tai lieu cua ca khoa (migration 0016). Ban ghi
      // Zoom khong vua khuon `video_provider` + `video_id` cua bai giang: no la
      // mot duong dan dai co token, khong co "ma video".
      recording_url: 'string', doc_url: 'string',
    },
    // Danh sach khoa phai hien ten va anh cho MOI NGUOI - nhung ban ghi va tai
    // lieu thi chi nguoi da mo khoa moi thay. Khong che thi mot lenh GET
    // /api/entities/Course la lay duoc ban ghi cua khoa VIP ma khong tra dong
    // nao, y het lo hong cua `products.delivery_url`.
    gatedFields: ['recording_url', 'doc_url'],
    gateBy: 'course_self',
  }),

  Lesson: def({
    table: 'lessons',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      course_id: 'string', title: 'string', guide: 'string',
      video_provider: 'string', video_id: 'string', duration: 'string',
      assignment_url: 'string', doc_url: 'string',
      xp: 'number', coin: 'number', sort_order: 'number',
    },
    // Tieu de bai van cho xem (lam muc luc mo dau), nhung ma video va tai lieu
    // thi chi nguoi da mo khoa moi thay. Neu khong, mot lenh GET la lay duoc
    // link video cua ca khoa phai tra tien.
    gatedFields: ['video_id', 'assignment_url', 'doc_url'],
  }),

  LessonProgress: def({
    table: 'lesson_progress',
    ownerField: 'user_id',
    read: 'own_or_staff',
    create: 'never',            // qua ham completeLesson (co cong diem)
    update: 'never',
    delete: 'admin',
    fields: {
      user_id: 'string', course_id: 'string', lesson_id: 'string',
      completed: 'bool', completed_at: 'string',
    },
  }),

  Entitlement: def({
    table: 'entitlements',
    ownerField: 'user_id',
    read: 'own_or_staff',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      user_id: 'string', kind: 'string', ref: 'string', source: 'string',
      order_id: 'number', product_sku: 'string', granted_by: 'string',
      granted_at: 'string', expires_at: 'string', revoked_at: 'string', note: 'string',
    },
  }),

  // ------------------------------------------------------------ lich & su kien
  CalendarEvent: def({
    table: 'calendar_events',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      title: 'string', description: 'string', kind: 'string',
      starts_at: 'string', ends_at: 'string', location: 'string',
      join_url: 'string', cover_url: 'string', capacity: 'number',
      min_level: 'number', requires_unlock: 'bool',
      recording_url: 'string', status: 'string', is_active: 'bool',
      // Khung gio diem danh, tinh bang phut so voi starts_at.
      checkin_open_min: 'number', checkin_close_min: 'number',
    },
    // Ai cung xem duoc lich, nhung duong vao phong hop va ban ghi lai thi chi
    // nguoi DA DANG KY moi thay - de lo la ca thien ha vao duoc buoi live.
    gatedFields: ['join_url', 'recording_url'],
    gateBy: 'event',
  }),

  EventSignup: def({
    table: 'event_signups',
    ownerField: 'user_id',
    read: 'all',                // de hien "12 nguoi da dang ky"
    create: 'never',            // phai qua ham joinEvent (co kiem so cho)
    update: 'admin',            // diem danh la viec cua admin, khong tu khai
    // XOA la viec cua admin. Tu bo cho thi dung leaveEvent - no set
    // status='cancelled' chu khong xoa dong. Cho chu so huu XOA HAN dong dang
    // ky la mo duong farm diem: xoa xong dang ky lai la co mot dong moi, va moi
    // thu chong trung nao gan vao id cua dong do deu bi lam moi theo.
    delete: 'admin',
    fields: {
      event_id: 'string', event_title: 'string', user_id: 'string', user_name: 'string',
      status: 'string', registered_at: 'string', attended_at: 'string',
    },
    readable: {
      public: ['id', 'event_id', 'user_id', 'user_name', 'status', 'created_date'],
    },
  }),

  Product: def({
    table: 'products',
    read: 'all',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
    fields: {
      sku: 'string', name: 'string', kind: 'string', price: 'number', currency: 'string',
      grants_json: 'json', is_active: 'bool',
      // Ba truong cho gian hang trong khu vuc thanh vien (migration 0011).
      description: 'string', image_url: 'string', sort_order: 'number',
      // Giao hang khi san pham KHONG phai khoa hoc tren nen tang (migration
      // 0012): mot trang Notion, mot thu muc Drive, mot nhom Zalo rieng.
      delivery_url: 'string', delivery_note: 'string', zalo_group_url: 'string',
      // Ty le hoa hong rieng cua san pham nay (migration 0017). NULL = chua dat.
      commission_rate: 'number',
      // Suc chua theo khoa (migration 0019). seats_total NULL = khong gioi han.
      // `cohort_start_at` la moc "mo khoa moi": doi no la bo dem ve 0.
      seats_total: 'number', seats_offset: 'number', cohort_start_at: 'string',
    },
    // Gian hang phai hien ten, gia, anh cho MOI NGUOI - nhung link tai lieu va
    // loi nhan sau khi mua thi chi nguoi da mua goi do moi thay. Khong che thi
    // mot lenh GET la lay duoc link cua ca gian hang ma khong tra dong nao.
    //
    // `zalo_group_url` co y de ngoai danh sach: nguoi mua can no TRUOC khi tien
    // ve, de gui bill nho xac nhan khi tu dong khong nhan ra.
    // `commission_rate` che cung cho: chi nguoi DA MUA san pham moi duoc ban
    // lai no, nen cung chi ho moi can biet minh an bao nhieu. Nguoi chua mua
    // nhin vao gian hang khong thay bien loi cua chi Thanh tren tung mon.
    gatedFields: ['delivery_url', 'delivery_note', 'commission_rate'],
    gateBy: 'package',
  }),

  // ------------------------------------------------------------------ van hanh
  Notification: def({
    table: 'notifications',
    ownerField: 'user_id',
    read: 'own',
    create: 'never',
    update: 'own',
    delete: 'own_or_admin',
    fields: {
      user_id: 'string', title: 'string', body: 'string', type: 'string',
      link: 'string', is_read: 'bool',
    },
    // Chi duoc danh dau da doc; khong sua duoc noi dung thong bao.
    writable: { self: ['is_read'], admin: ['is_read'] },
  }),

  AdminLog: def({
    table: 'admin_logs',
    read: 'admin',
    create: 'never',
    update: 'never',
    delete: 'never',
    fields: {
      admin_id: 'string', admin_name: 'string', target_user_id: 'string',
      target_user_name: 'string', action: 'string', reason: 'string', details: 'string',
    },
  }),

  Recording: def({
    table: 'recordings',
    ownerField: 'user_id',
    read: 'own_or_staff',
    create: 'self',
    update: 'own_or_admin',
    delete: 'own_or_admin',
    fields: {
      user_id: 'string', title: 'string', duration: 'string', file_url: 'string',
      challenge_id: 'string', day: 'number',
    },
    // Khong khai `writable` thi repo.js cho ghi MOI cot - ke ca `user_id`, tuc
    // la tao ban ghi mang ten nguoi khac. Bang nay hien chua co trang nao dung
    // (khong noi nao trong worker lan SPA cham toi), nen day la chan truoc cho
    // luc no duoc dung toi, chu khong sua hanh vi nao dang chay.
    writable: {
      self: ['title', 'duration', 'file_url', 'challenge_id', 'day'],
      admin: ['title', 'duration', 'file_url', 'challenge_id', 'day'],
    },
  }),
};

/** Tran so dong tra ve mot lan, theo tung entity. */
export const LIMITS = {
  default: 200,
  // Mot lop 5 ngay co the vuot 200 nguoi de dang - lop dau tien da 363. Voi
  // tran 200 thi trang Hoc vien chi thay 200/363: quan tri vien khong tim
  // duoc nguoi thu 250, va dai bao "200 hoc vien chua co nhom" dem thieu 140
  // nguoi. Doc them nguoi khong lo them gi: `readable.public` da che email va
  // so dien thoai cua nguoi khac (co bai test giu cho).
  User: 2000,
  XpTransaction: 5000,     // trang tong quan cua admin can nhieu
  CoinTransaction: 5000,
  Activity: 1000,
  Post: 200,
};

export const entityDef = (name) => Object.prototype.hasOwnProperty.call(ENTITIES, name)
  ? ENTITIES[name]
  : null;
