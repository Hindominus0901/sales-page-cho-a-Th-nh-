import { useState } from 'react';
import { api, vnd } from '../api';
import { Loading, ErrorBox, useLoad, useToast } from '../ui';

interface Data {
  settings: { key: string; value_json: string }[];
  editableKeys: string[];
  product: { name: string; price: number; compare_at_price: number | null;
             seats_total: number | null; seats_offset: number; start_date: string | null;
             cohort_hien_tai: string | null; cohort_khai_giang: string | null;
             cohort_bat_dau_tu: number | null } | null;
  daBanKhoaNay: number;
  bank: { bankName: string; accountNo: string; accountName: string; note: string };
}

const LABEL: Record<string, string> = {
  'lead_magnet.download_url':   'Link tải tài liệu Bản Đồ 21 Ngày',
  'lead_magnet.zalo_group_url': 'Link nhóm Zalo cho người tải Bản Đồ',
  'affiliate.payout_threshold': 'Ngưỡng tối thiểu để CTV rút tiền (đồng)',
  'commission.hold_days':       'Số ngày giữ hoa hồng trước khi tự duyệt',
  'order.expires_hours':        'Số giờ mã QR còn hiệu lực',
  'contact.zalo':               'Zalo hỗ trợ hiện trên trang',
  'contact.email':              'Email hỗ trợ hiện trên trang',
};

const HINT: Record<string, string> = {
  'lead_magnet.download_url':
    'Chưa điền thì sau khi để lại thông tin, khách chỉ thấy lời cảm ơn — phễu đứt ở đây.',
  'commission.hold_days':
    'Cửa sổ hoàn tiền. Hoa hồng chỉ tự duyệt sau khi qua số ngày này và không bị treo.',
};

export default function Settings() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad<Data>(() => api.get('/api/admin/settings'));
  const [product, setProduct] = useState<Record<string, string>>({});

  if (loading) return <Loading what="cài đặt" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const value = (key: string) => {
    const row = data.settings.find((s) => s.key === key);
    if (!row) return '';
    try { const v = JSON.parse(row.value_json); return v === null ? '' : String(v); }
    catch { return ''; }
  };

  async function save(key: string, v: string) {
    try {
      const numeric = /threshold|days|hours/.test(key);
      await api.put(`/api/admin/settings/${key}`, { value: numeric ? Number(v) : v });
      toast.show('Đã lưu.');
      reload();
    } catch (e) { toast.fail((e as Error).message); }
  }

  async function moKhoaMoi() {
    if (!confirm(
      'Đặt lại mốc đếm chỗ về hôm nay?\n\n'
      + 'Từ giờ trang bán chỉ đếm những đơn thanh toán TỪ BÂY GIỜ. '
      + 'Đơn của các khoá trước không còn trừ vào số chỗ nữa.')) return;
    try {
      await api.patch('/api/admin/product', { moKhoaMoi: 1 });
      toast.show('Đã đặt lại mốc. Số chỗ còn lại tính từ hôm nay.');
      reload();
    } catch (e) { toast.fail(e instanceof Error ? e.message : 'Không đặt lại được.'); }
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      /* Trường nào là CHỮ phải liệt kê ra. Trước đây mọi thứ ngoài startDate đều
         bị ép sang Number, nên thêm một ô chữ nào vào form là nó lặng lẽ gửi
         NaN lên máy chủ. */
      const laChu = new Set(['startDate', 'name', 'cohortHienTai', 'cohortKhaiGiang']);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(product)) {
        if (v === '') continue;
        patch[k] = laChu.has(k) ? v : Number(v);
      }
      await api.patch('/api/admin/product', patch);
      setProduct({});
      toast.show('Đã lưu thông tin khoá học.');
      reload();
    } catch (err) { toast.fail((err as Error).message); }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Cài đặt</h1>
          <p>
            Khoá bí mật (khoá webhook SePay, khoá ký phiên đăng nhập) <b>không</b> nằm ở đây —
            chúng đặt bằng lệnh <span className="mono">wrangler secret</span>, nên kể cả lộ quyền
            quản trị cũng không đọc ngược ra được.
          </p>
        </div>
      </div>

      <div className="stack">
        <div className="card card-pad">
          <h2 style={{ marginBottom: 4 }}>Khoá học</h2>
          <p className="note" style={{ margin: '0 0 14px' }}>
            Số chỗ còn lại trên trang = tổng số chỗ − đơn đã thanh toán − số chỗ đã bán ngoài web.
          </p>
          <form onSubmit={saveProduct}>
            <div className="grid grid-3">
              <NumField label="Học phí (đồng)" placeholder={String(data.product?.price ?? '')}
                        onChange={(v) => setProduct({ ...product, price: v })} />
              <NumField label="Giá gạch ngang (đồng)" placeholder={String(data.product?.compare_at_price ?? '')}
                        onChange={(v) => setProduct({ ...product, compareAtPrice: v })} />
              <NumField label="Tổng số chỗ" placeholder={String(data.product?.seats_total ?? '')}
                        onChange={(v) => setProduct({ ...product, seatsTotal: v })} />
              <NumField label="Chỗ đã bán ngoài web" placeholder={String(data.product?.seats_offset ?? 0)}
                        onChange={(v) => setProduct({ ...product, seatsOffset: v })} />
              <div className="field">
                <label>Tên khoá học</label>
                <input className="input" defaultValue={data.product?.name ?? ''}
                       onChange={(e) => setProduct({ ...product, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Ngày khai giảng</label>
                <input className="input" type="date" defaultValue={data.product?.start_date ?? ''}
                       onChange={(e) => setProduct({ ...product, startDate: e.target.value })} />
              </div>
            </div>
            <button className="btn primary" disabled={Object.keys(product).length === 0}>Lưu khoá học</button>
          </form>
          <p className="note" style={{ marginTop: 12 }}>
            Hiện tại: học phí <b>{vnd(data.product?.price ?? 0)}</b>, tổng{' '}
            <b>{data.product?.seats_total ?? '—'}</b> chỗ.
          </p>
        </div>

        {/* Quản lý khoá — thao tác quan trọng nhất khi bán khoá 2, và trước đây
            không có cách nào làm ngoài việc sửa thẳng D1. */}
        <div className="card card-pad">
          <h2 style={{ marginBottom: 4 }}>Khoá đang chạy</h2>
          <p className="note" style={{ margin: '0 0 14px' }}>
            Mã khoá gắn vào mọi học viên mua từ giờ trở đi, và là thứ tách khoá 2
            khỏi khoá 1 ở màn Duyệt bài, Học viên, Nội dung 21 ngày.
          </p>
          <form onSubmit={saveProduct}>
            <div className="grid grid-3">
              <div className="field">
                <label>Mã khoá hiện tại</label>
                <input className="input" placeholder="K1-2026-09"
                       defaultValue={data.product?.cohort_hien_tai ?? ''}
                       onChange={(e) => setProduct({ ...product, cohortHienTai: e.target.value })} />
              </div>
              <div className="field">
                <label>Ngày khai giảng của khoá này</label>
                <input className="input" type="date"
                       defaultValue={data.product?.cohort_khai_giang ?? ''}
                       onChange={(e) => setProduct({ ...product, cohortKhaiGiang: e.target.value })} />
              </div>
              <div className="field">
                <label>Đã bán cho khoá này</label>
                <input className="input" readOnly value={`${data.daBanKhoaNay} chỗ`} />
              </div>
            </div>
            <button className="btn primary" disabled={Object.keys(product).length === 0}>
              Lưu thông tin khoá
            </button>
          </form>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--vien)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Mở bán khoá mới</div>
            <p className="note" style={{ margin: '0 0 10px' }}>
              Đặt lại mốc đếm chỗ về <b>bây giờ</b>. Không làm bước này thì bộ đếm
              vẫn trừ toàn bộ đơn từ đầu lịch sử — {data.daBanKhoaNay} đơn cũ sẽ ăn
              hết số chỗ của khoá mới và trang bán báo &ldquo;hết chỗ&rdquo; ngay ngày đầu.
            </p>
            <button className="btn" onClick={moKhoaMoi}>
              Đặt lại mốc đếm chỗ về hôm nay
            </button>
          </div>

          <p className="note" style={{ marginTop: 12 }}>
            {data.product?.cohort_bat_dau_tu
              ? `Mốc hiện tại: ${new Date(data.product.cohort_bat_dau_tu * 1000).toLocaleDateString('vi-VN')}`
              : 'Chưa đặt mốc — đang đếm toàn bộ đơn từ đầu, đúng cho khoá đầu tiên.'}
          </p>
        </div>

        <div className="card card-pad">
          <h2 style={{ marginBottom: 14 }}>Đường dẫn và tham số vận hành</h2>
          <div className="grid grid-2">
            {data.editableKeys.map((k) => (
              <TextSetting key={k} label={LABEL[k] ?? k} hint={HINT[k]}
                           initial={value(k)} onSave={(v) => save(k, v)} />
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <h2 style={{ marginBottom: 10 }}>Tài khoản nhận tiền</h2>
          <table>
            <tbody>
              <tr><td className="note">Ngân hàng</td><td className="right">{data.bank.bankName}</td></tr>
              <tr><td className="note">Số tài khoản</td>
                  <td className="right mono">{data.bank.accountNo || '(chưa điền)'}</td></tr>
              <tr><td className="note">Chủ tài khoản</td><td className="right">{data.bank.accountName}</td></tr>
            </tbody>
          </table>
          <p className="note" style={{ marginTop: 10 }}>{data.bank.note}</p>
          {!data.bank.accountNo && (
            <div className="alert err" style={{ marginTop: 12 }}>
              Chưa có số tài khoản — trang thanh toán sẽ báo lỗi và <b>không bán được</b>.
              Điền <span className="mono">SEPAY_ACCOUNT_NO</span> trong wrangler.jsonc rồi deploy lại.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function NumField(
  { label, placeholder, onChange }: { label: string; placeholder: string; onChange: (v: string) => void },
) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" type="number" placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TextSetting(
  { label, hint, initial, onSave }:
  { label: string; hint?: string; initial: string; onSave: (v: string) => void },
) {
  const [v, setV] = useState(initial);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn sm" disabled={v === initial} onClick={() => onSave(v)}>Lưu</button>
      </div>
      {hint && <div className="note">{hint}</div>}
      {!initial && !hint && <div className="note" style={{ color: 'var(--canh)' }}>Chưa điền</div>}
    </div>
  );
}
