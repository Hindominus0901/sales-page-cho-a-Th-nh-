/**
 * Nhat ky thao tac cua admin.
 *
 * Bang `admin_logs` da duoc ghi tu lau - moi lan cong/tru diem, duyet bai, doi
 * trang thai don doi qua, trao huy hieu deu de lai mot dong kem ly do. Nhung
 * khong trang nao doc no, nen ca so nhat ky do nam im trong database.
 *
 * Vi sao can nhin thay: khi mot hoc vien hoi "sao xu cua em bi tru", cau tra loi
 * phai tra ra duoc - ai lam, luc nao, vi ly do gi. Khong co trang nay thi phai
 * mo database moi biet.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import {
  CellInput, CellSelect, EmptyBlock, InitialAvatar, LoadingBlock,
  PageHeader, Panel, TableScroll, fmtNumber, timeAgo,
} from './_shared';

/** Ten tieng Viet cho tung loai thao tac - `action` trong database la ma tieng Anh. */
const TEN_THAO_TAC = {
  adjust_xp: 'Điều chỉnh XP',
  adjust_coin: 'Điều chỉnh xu',
  approve_activity: 'Duyệt hoạt động',
  reject_activity: 'Từ chối hoạt động',
  score_activity: 'AI chấm hoạt động',
  score_challenge_day: 'AI chấm bài thử thách',
  grant_entitlement: 'Mở quyền truy cập',
  grant_badge: 'Trao huy hiệu',
  revoke_badge: 'Thu hồi huy hiệu',
  redemption_approved: 'Duyệt đổi quà',
  redemption_delivered: 'Đã giao quà',
  redemption_cancelled: 'Huỷ đổi quà (hoàn xu)',
  // Nhung thao tac them sau nay. Thieu o day thi bang hien ra ma tieng Anh
  // tho - nguoi doc nhat ky la quan tri vien, khong phai lap trinh vien.
  send_notification: 'Gửi thông báo',
  approve_challenge_day: 'Duyệt bài thử thách',
  reject_challenge_day: 'Trả bài thử thách',
  resend_invites: 'Gửi lại thư mời vào lớp',
  backfill_badges: 'Rà soát huy hiệu cả lớp',
};

/** Thao tac nao dang de y hon thi to mau - de mat luot qua bang la thay ngay. */
const MAU = {
  adjust_xp: 'text-amber-700 bg-amber-500/10',
  adjust_coin: 'text-amber-700 bg-amber-500/10',
  revoke_badge: 'text-destructive bg-destructive/10',
  redemption_cancelled: 'text-destructive bg-destructive/10',
  reject_activity: 'text-destructive bg-destructive/10',
  grant_badge: 'text-emerald-600 bg-emerald-500/10',
  grant_entitlement: 'text-primary bg-primary/10',
};

export default function AdminLogs() {
  const [tim, setTim] = React.useState('');
  const [loc, setLoc] = React.useState('');

  const logs = useQuery({
    queryKey: ['admin', 'logs'],
    queryFn: () => base44.entities.AdminLog.list('-created_date', 500),
  });

  const ds = (logs.data || []).filter((l) => {
    if (loc && l.action !== loc) return false;
    if (!tim.trim()) return true;
    const q = tim.trim().toLowerCase();
    return [l.admin_name, l.target_user_name, l.reason, l.details]
      .some((x) => (x || '').toLowerCase().includes(q));
  });

  // Danh sach loai thao tac lay tu chinh du lieu, khong viet cung: them mot loai
  // thao tac moi o backend thi o loc nay tu co them muc, khong phai sua o day.
  const cacLoai = [...new Set((logs.data || []).map((l) => l.action).filter(Boolean))].sort();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nhật ký quản trị"
        description="Ai đã làm gì, lúc nào, vì lý do gì. 500 thao tác gần nhất."
      />

      <Panel
        title={`${fmtNumber(ds.length)} thao tác`}
        action={(
          <div className="flex flex-wrap gap-2">
            <CellSelect value={loc} onChange={(e) => setLoc(e.target.value)} className="w-52">
              <option value="">Tất cả thao tác</option>
              {cacLoai.map((a) => (
                <option key={a} value={a}>{TEN_THAO_TAC[a] || a}</option>
              ))}
            </CellSelect>
            <CellInput
              value={tim}
              onChange={(e) => setTim(e.target.value)}
              placeholder="Tìm theo tên, lý do, chi tiết"
              className="w-64"
            />
          </div>
        )}
      >
        {logs.isLoading ? <LoadingBlock /> : ds.length === 0 ? (
          <EmptyBlock>
            {logs.data?.length
              ? 'Không có thao tác nào khớp bộ lọc.'
              : 'Chưa có thao tác quản trị nào được ghi lại.'}
          </EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Lúc</th>
                  <th className="p-2.5 font-semibold">Người làm</th>
                  <th className="p-2.5 font-semibold">Thao tác</th>
                  <th className="p-2.5 font-semibold">Với ai</th>
                  <th className="p-2.5 font-semibold">Chi tiết</th>
                  <th className="p-2.5 font-semibold">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {ds.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-secondary/50 align-top">
                    <td className="p-2.5 whitespace-nowrap text-xs text-muted-foreground">
                      {timeAgo(l.created_date)}
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-2">
                        <InitialAvatar name={l.admin_name} size={26} />
                        <span className="text-xs font-semibold">{l.admin_name || '—'}</span>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <span className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-bold',
                        MAU[l.action] || 'bg-muted text-muted-foreground',
                      )}
                      >
                        {TEN_THAO_TAC[l.action] || l.action}
                      </span>
                    </td>
                    <td className="p-2.5 text-xs">{l.target_user_name || '—'}</td>
                    <td className="p-2.5 text-xs text-muted-foreground">{l.details || '—'}</td>
                    <td className="p-2.5 text-xs">{l.reason || <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}
