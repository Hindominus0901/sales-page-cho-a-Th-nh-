/**
 * Lop truy cap du lieu tren Cloudflare D1.
 *
 * Ban cu co ba driver (SQLite / Postgres / none) va phai viet SCHEMA hai lan.
 * D1 la SQLite nen chi con MOT phuong ngu, va dau hoi `?` dung nguyen - khong
 * phai doi sang $1 nhu driver Postgres cu.
 *
 * Khac biet quan trong so voi ban Node: khong con singleton o cap module. Moi
 * request tu tao store tu `env` cua no -> createStore(env).
 */

/** D1 khong nhan undefined; doi het sang null. */
const args = (params) => (params || []).map((p) => (p === undefined ? null : p));

export function createStore(env) {
  const DB = env.DB;
  if (!DB) throw new Error('Thieu binding D1 "DB" - kiem tra wrangler.jsonc');

  /**
   * Thu lai cac loi TAM THOI cua D1.
   *
   * D1 thinh thoang tra "internal error" hoac "database is locked" khi co tranh
   * chap - o may lap trinh vien la luc `wrangler d1 execute --local` dam vao
   * file SQLite ma `wrangler dev` dang giu; tren ban that la luc nhieu request
   * cung vao mot luc.
   *
   * Vi sao dieu nay quan trong hon ve ngoai: `readSession` la mot lenh DOC, va
   * no chay o DAU MOI REQUEST co dang nhap. Mot lan doc hong o day khong bao
   * "he thong ban ron" ma bao "Ban can dang nhap" - nguoi dung dang lam viec
   * binh thuong bong nhien bi da ra man hinh dang nhap, khong hieu vi sao.
   *
   * CHI thu lai lenh DOC. Mot lenh GHI hong co the da kip ghi mot phan; thu lai
   * mu quang la nguy co ghi hai lan (cong diem hai lan, tru xu hai lan). Lenh
   * ghi van nem loi ra nhu cu.
   */
  const LOI_TAM_THOI = /internal error|database is locked|SQLITE_BUSY|Network connection lost/i;

  async function thuLaiKhiDoc(viec) {
    let loiCuoi;
    for (let lan = 0; lan < 3; lan += 1) {
      try {
        return await viec();
      } catch (err) {
        loiCuoi = err;
        if (!LOI_TAM_THOI.test(String(err?.message || err))) throw err;
        // Lui dan: 40ms roi 120ms. Du de qua mot con tranh chap ngan, va khong
        // du lau de nguoi dung kip thay cham.
        await new Promise((r) => { setTimeout(r, 40 * (3 ** lan)); });
      }
    }
    throw loiCuoi;
  }

  const all = async (sql, params) => thuLaiKhiDoc(async () => {
    const { results } = await DB.prepare(sql).bind(...args(params)).all();
    return results || [];
  });
  const get = async (sql, params) => thuLaiKhiDoc(async () => {
    const row = await DB.prepare(sql).bind(...args(params)).first();
    return row === null ? undefined : row;
  });
  const run = async (sql, params) => {
    const { meta } = await DB.prepare(sql).bind(...args(params)).run();
    return { changes: meta?.changes ?? 0, lastId: meta?.last_row_id ?? 0 };
  };
  /** Nhieu lenh chay nguyen tu - thay cho transaction ma ban cu khong he co. */
  const batch = (statements) => DB.batch(statements);
  const prepare = (sql, params) => DB.prepare(sql).bind(...args(params));

  const now = () => new Date().toISOString();

  // --- sessions ------------------------------------------------------------
  const getSession = (id) => get('SELECT * FROM sessions WHERE id = ?', [id]);

  async function upsertSession(id, ctx = {}) {
    const t = now();
    const a = ctx.attribution || {};
    const existing = await getSession(id);

    if (!existing) {
      await run(
        `INSERT INTO sessions (id, created_at, last_seen_at, landing_url, referrer,
           utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, user_agent, ip)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, t, t, a.landing_url || '', a.referrer || '', a.utm_source || '', a.utm_medium || '',
          a.utm_campaign || '', a.utm_content || '', a.utm_term || '', a.fbclid || '', a.gclid || '',
          ctx.userAgent || '', ctx.ip || ''],
      );
      return getSession(id);
    }

    // COALESCE(NULLIF(...)) = giu nguon truy cap DAU TIEN, khong bi ghi de boi
    // lan quay lai sau do.
    await run(
      `UPDATE sessions SET
         landing_url  = COALESCE(NULLIF(landing_url,''),  ?),
         referrer     = COALESCE(NULLIF(referrer,''),     ?),
         utm_source   = COALESCE(NULLIF(utm_source,''),   ?),
         utm_medium   = COALESCE(NULLIF(utm_medium,''),   ?),
         utm_campaign = COALESCE(NULLIF(utm_campaign,''), ?),
         utm_content  = COALESCE(NULLIF(utm_content,''),  ?),
         utm_term     = COALESCE(NULLIF(utm_term,''),     ?),
         fbclid       = COALESCE(NULLIF(fbclid,''),       ?),
         gclid        = COALESCE(NULLIF(gclid,''),        ?),
         last_seen_at = ?
       WHERE id = ?`,
      [a.landing_url || '', a.referrer || '', a.utm_source || '', a.utm_medium || '', a.utm_campaign || '',
        a.utm_content || '', a.utm_term || '', a.fbclid || '', a.gclid || '', t, id],
    );
    return getSession(id);
  }

  const touchSession = (id) =>
    run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [now(), id]);

  // --- leads ---------------------------------------------------------------
  const getLeadById = (id) => get('SELECT * FROM leads WHERE id = ?', [id]);
  const getLeadByPhone = (phone) => get('SELECT * FROM leads WHERE phone_e164 = ?', [phone]);
  const getLeadBySession = (sid) =>
    get('SELECT * FROM leads WHERE session_id = ? ORDER BY id DESC LIMIT 1', [sid]);

  // Lay dong SOM NHAT: mot email co the dien form nhieu lan, va dong dau tien
  // moi la dong mang nguoi gioi thieu that.
  const getLeadByEmail = (email) => (email
    ? get('SELECT * FROM leads WHERE lower(email) = lower(?) ORDER BY id ASC LIMIT 1', [email])
    : null);

  async function upsertLead(lead) {
    const t = now();
    // Nhan dien theo EMAIL truoc, so dien thoai chi la duong du phong.
    //
    // Truoc day chi doi chieu so dien thoai. Nguoi dien lai form bang email
    // khac tren cung mot so bi coi la nguoi cu: email that khong duoc ghi vao,
    // va vi `created = false` nen khong co thu moi nao duoc gui. Ho lam dung
    // viec tu nhien nhat khi mat thu - dien lai - va nhan duoc su im lang.
    //
    // Email la thu ho go, thu ho doi, va thu ho dung de dang nhap. Lay no lam
    // danh tinh la dung voi cach nguoi dung nghi ve tai khoan cua minh.
    //
    // VAN GIU duong so dien thoai: cot `phone_e164` la UNIQUE, nen bo han no
    // thi mot lan dung lai so cu se lam cau INSERT vo rang buoc va form bao
    // loi 500 - te hon han cai dang sua.
    const existing = (await getLeadByEmail(lead.email)) || (await getLeadByPhone(lead.phone_e164));

    if (existing) {
      // Chi ghi de du lieu khi dung la phien da tao lead nay. Neu MOT PHIEN
      // KHAC gui trung so dien thoai - vd ai do biet so nguoi khac roi dang ky
      // ho - thi chi tang dem submissions, KHONG ghi de ten/email that va
      // KHONG gan lai session_id. Neu khong, nguoi la se chiem duoc token
      // affiliate cua chu that qua /api/affiliate/me.
      //
      // Ban ghi CHUA HE co affiliate (chua ai duoc cap link) thi cho nhan lai
      // khi lead chua co phien - can cho du lieu cu di tru sang. Nhung mot khi
      // da co affiliate thi khoa han: do la luc co thu de mat.
      const noSession = !existing.session_id;
      let claimable = existing.session_id === lead.session_id;
      if (!claimable && noSession) {
        const hasAffiliate = await get('SELECT id FROM affiliates WHERE lead_id = ?', [existing.id]);
        claimable = !hasAffiliate;
      }
      const sameSession = claimable;
      if (sameSession) {
        await run(
          `UPDATE leads SET session_id=?, full_name=?, email=?, phone=?, country_code=?,
             answers_json=?, score=?, segment=?, submissions=submissions+1,
             utm_source=COALESCE(NULLIF(utm_source,''),?), utm_campaign=COALESCE(NULLIF(utm_campaign,''),?),
             ip=?, user_agent=?, updated_at=?
           WHERE id=?`,
          [lead.session_id, lead.full_name, lead.email, lead.phone, lead.country_code, lead.answers_json,
            lead.score, lead.segment, lead.utm_source, lead.utm_campaign, lead.ip, lead.user_agent, t,
            existing.id],
        );
      } else {
        await run('UPDATE leads SET submissions=submissions+1, updated_at=? WHERE id=?', [t, existing.id]);
      }
      return { lead: await getLeadById(existing.id), created: false, sessionMatched: sameSession };
    }

    const row = await get(
      `INSERT INTO leads (session_id, full_name, email, phone, phone_e164, country_code,
         answers_json, score, segment, status, submissions, utm_source, utm_campaign, ip, user_agent,
         referred_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?) RETURNING *`,
      [lead.session_id, lead.full_name, lead.email, lead.phone, lead.phone_e164, lead.country_code,
        lead.answers_json, lead.score, lead.segment, 'registered', lead.utm_source, lead.utm_campaign,
        lead.ip, lead.user_agent, lead.referred_by || null, t, t],
    );
    return { lead: row, created: true, sessionMatched: true };
  }

  // --- events --------------------------------------------------------------
  const insertEvent = (e) => run(
    'INSERT INTO events (session_id, lead_id, type, page, meta_json, ip, created_at) VALUES (?,?,?,?,?,?,?)',
    [e.session_id || null, e.lead_id || null, e.type, e.page || null,
      e.meta ? JSON.stringify(e.meta) : null, e.ip || null, now()],
  );

  // --- orders --------------------------------------------------------------
  const getOrderByCode = (code) => get('SELECT * FROM orders WHERE code = ?', [code]);
  const getPendingOrderByLead = (leadId) => get(
    "SELECT * FROM orders WHERE lead_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1", [leadId]);

  const insertOrder = (o) => {
    const t = now();
    return get(
      `INSERT INTO orders (code, lead_id, session_id, product_sku, product_name, amount, currency,
         status, transfer_content, customer_name, customer_phone, customer_email, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?,?) RETURNING *`,
      [o.code, o.lead_id || null, o.session_id || null, o.product_sku, o.product_name, o.amount,
        o.currency, o.transfer_content, o.customer_name || null, o.customer_phone || null,
        o.customer_email || null, t, t],
    );
  };

  /**
   * @param {object} opts
   * @param {boolean} [opts.allowCancelled] cho phep hoi sinh don da huy - CHI
   *   admin bam tay moi duoc dat co nay. Webhook thi khong: neu khong, mot don
   *   da huy vi nghi gian lan se tu song lai chi vi co tien chuyen vao dung ma.
   */
  async function markOrderPaid(code, { amount = null, ref = null, note = null, allowCancelled = false } = {}) {
    const t = now();
    // "AND status <> 'paid'" la chot chong tinh tien hai lan khi webhook ban lai.
    const guard = allowCancelled ? '' : " AND status <> 'cancelled'";
    const info = await run(
      `UPDATE orders SET status='paid', paid_at=?, paid_amount=?, payment_ref=?,
         note=COALESCE(?, note), updated_at=? WHERE code=? AND status <> 'paid'${guard}`,
      [t, amount, ref, note, t, code],
    );
    const order = await getOrderByCode(code);
    if (info.changes > 0 && order && order.lead_id) {
      await run('UPDATE leads SET status=?, updated_at=? WHERE id=?', ['vip_paid', t, order.lead_id]);
    }
    // Hoa hong duoc sinh o route (webhook / admin) qua affiliates.createCommission(order)
    return { changed: info.changes > 0, order };
  }

  async function cancelOrder(code, reason) {
    const info = await run(
      "UPDATE orders SET status='cancelled', cancel_reason=?, updated_at=? WHERE code=? AND status='pending'",
      [reason || null, now(), code],
    );
    return { changed: info.changes > 0, order: await getOrderByCode(code) };
  }

  // --- giao dich ngan hang / nhat ky ---------------------------------------
  async function insertBankTxn(txn) {
    if (txn.external_id) {
      const dup = await get('SELECT id FROM bank_txns WHERE provider=? AND external_id=?',
        [txn.provider, String(txn.external_id)]);
      if (dup) return { duplicate: true, id: dup.id };
    }
    try {
      const row = await get(
        `INSERT INTO bank_txns (provider, external_id, amount, content, account,
           occurred_at, matched_order, status, raw_json, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        [txn.provider, txn.external_id ? String(txn.external_id) : null, txn.amount ?? null,
          txn.content || '', txn.account || '', txn.occurred_at || null, txn.matched_order || null,
          txn.status || 'received', JSON.stringify(txn.raw ?? {}), now()],
      );
      return { duplicate: false, id: row ? row.id : 0 };
    } catch (err) {
      // Hai lan giao cung mot giao dich chay song song: ca hai cung qua duoc
      // buoc SELECT o tren, lenh INSERT thu hai dung phai chi muc unique. Do la
      // trung that, khong phai loi he thong - neu de no nem ra thi ngan hang se
      // ban lai va lan sau bi bo qua nham.
      if (/unique|duplicate/i.test(err?.message || '')) return { duplicate: true, id: 0 };
      throw err;
    }
  }

  const audit = (action, target, meta, ip) => run(
    'INSERT INTO audit_log (action, target, meta_json, ip, created_at) VALUES (?,?,?,?,?)',
    [action, target || null, meta ? JSON.stringify(meta) : null, ip || null, now()],
  );

  return {
    all, get, run, batch, prepare, now,
    upsertSession, getSession, touchSession,
    upsertLead, getLeadById, getLeadByPhone, getLeadBySession,
    insertEvent,
    insertOrder, getOrderByCode, getPendingOrderByLead, markOrderPaid, cancelOrder,
    insertBankTxn, audit,
  };
}
