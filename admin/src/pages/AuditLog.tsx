import { api } from '../api';
import { Loading, ErrorBox, Empty, useLoad } from '../ui';

interface Entry {
  id: string; actor_type: string; actor_label: string | null; action: string;
  entity_type: string; entity_id: string | null; createdAtText: string;
  before_json: string | null; after_json: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  'admin.login': 'Đăng nhập quản trị',
  'lead.update': 'Cập nhật lead',
  'lead.rescore': 'Chấm lại điểm lead',
  'order.payment_applied': 'Ghi nhận tiền vào đơn',
  'order.fulfilled': 'Hoàn tất đơn (tạo học viên, ghi danh, hoa hồng)',
  'order.cancel': 'Huỷ đơn',
  'payment.ignore': 'Bỏ qua giao dịch',
  'affiliate.create': 'Tạo cộng tác viên',
  'affiliate.update': 'Cập nhật cộng tác viên',
  'affiliate.bank_update': 'CTV đổi tài khoản ngân hàng',
  'payout.request': 'CTV yêu cầu rút tiền',
  'payout.approve': 'Duyệt đợt chi',
  'payout.paid': 'Đánh dấu đã chuyển tiền',
  'payout.reject': 'Từ chối đợt chi',
  'commission.auto_approve': 'Tự duyệt hoa hồng (chạy hằng đêm)',
  'setting.update': 'Đổi cài đặt',
  'product.update': 'Đổi thông tin khoá học',
  'workshop.create': 'Tạo buổi workshop',
  'workshop.update': 'Sửa buổi workshop',
};

const ACTOR: Record<string, string> = {
  admin: 'Quản trị', affiliate: 'Cộng tác viên', system: 'Hệ thống', webhook: 'SePay',
};

export default function AuditLog() {
  const { data, error, loading } = useLoad<{ entries: Entry[] }>(() => api.get('/api/admin/audit'));

  return (
    <>
      <div className="head">
        <div>
          <h1>Nhật ký thao tác</h1>
          <p>
            Mọi thay đổi liên quan tới tiền đều được ghi lại: ai làm, lúc nào, từ giá trị gì
            sang giá trị gì. Đây là thứ trả lời được khi có tranh chấp.
          </p>
        </div>
      </div>

      {loading && <Loading what="nhật ký" />}
      {error && <ErrorBox message={error} />}
      {data && data.entries.length === 0 && <Empty>Chưa có thao tác nào được ghi lại.</Empty>}

      {data && data.entries.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Thời điểm</th><th>Người thực hiện</th><th>Việc</th><th>Đối tượng</th><th>Chi tiết</th></tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{e.createdAtText}</td>
                  <td>
                    {ACTOR[e.actor_type] ?? e.actor_type}
                    {e.actor_label && <div className="muted" style={{ fontSize: 12 }}>{e.actor_label}</div>}
                  </td>
                  <td>{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="mono muted" style={{ fontSize: 12 }}>
                    {e.entity_type}
                    {e.entity_id && <div>{e.entity_id.slice(0, 12)}…</div>}
                  </td>
                  <td className="mono muted" style={{ fontSize: 12, maxWidth: 320, wordBreak: 'break-all' }}>
                    {e.after_json && e.after_json !== 'null' ? e.after_json.slice(0, 160) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
