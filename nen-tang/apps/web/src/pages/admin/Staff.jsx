/**
 * Nhan su: ai dang co quyen duyet bai.
 *
 * ================== VI SAO TRANG NAY BI VIET LAI ==================
 *
 * Ban truoc doc va ghi vao entity `Staff` - mot bang RIENG, khong noi voi bat
 * cu thu gi:
 *
 *   - Khong mot trang hoc vien nao doc bang do (grep `entities.Staff` trong
 *     apps/web chi ra dung trang nay).
 *   - Quyen duyet bai KHONG lay tu do. `isStaff()` trong
 *     worker/src/functions/index.js doc `users.role` ('admin' hoac 'coach').
 *
 * Nghia la: them mot coach vao day, thay toast "Da them nhan su", va nguoi do
 * VAN KHONG duyet duoc bai nao. Khong loi, khong canh bao. Dung cai bay ma muc
 * "Tuy chinh Portal" da bi go khoi menu vi no - chi khac la muc nay con nam lai
 * trong menu.
 *
 * Hai cot con te hon: "Hoc vien phu trach" va "Bai da duyet" la SO GO TAY, nhin
 * y het thong ke that. Mot nguoi van hanh doc bang do se tin rang coach A da
 * duyet 120 bai, trong khi con so do chi la thu ai do go vao o nam ngoai.
 *
 * Gio trang nay doc va ghi THANG vao `users.role` - dung nguon su that ma may
 * chu dung de quyet dinh quyen. Khong con so nao tu bia ra: so bai da duyet dem
 * that tu bang activities.
 *
 * Entity `Staff` va bang `staff` khong bi dung toi nua nhung van con trong
 * database - xoa du lieu cua nguoi khac khong phai viec cua mot lan sua giao
 * dien. Neu ve sau chac chan khong ai can, hay bo bang do bang mot migration
 * rieng.
 */
import React from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  CellSelect, InitialAvatar, PageHeader, Panel, QueryState,
  StatusPill, TableScroll, errText, fmtNumber,
} from './_shared';

const VAI = { admin: 'Admin', coach: 'Coach', member: 'Học viên' };
const CHAN = 500;

export default function Staff() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user: toi } = useAuth();

  // Doc CA danh sach de con thay ai vua duoc cat quyen. Bang users cua mot lop
  // hoc khong lon, va chan 500 dong la du rong.
  const users = useQuery({
    queryKey: ['admin', 'nhan-su'],
    queryFn: () => base44.entities.User.list('-total_xp', CHAN),
  });

  // So bai da duyet: dem THAT tu activities, khong phai so go tay nhu ban cu.
  const daDuyet = useQuery({
    queryKey: ['admin', 'nhan-su', 'da-duyet'],
    queryFn: () => base44.entities.Activity.filter({ status: 'approved' }, '-created_date', 1000),
  });

  const doiVai = useMutation({
    mutationFn: ({ id, role }) => base44.entities.User.update(id, { role }),
    onSuccess: (_r, v) => {
      toast({
        title: `Đã đổi vai trò thành ${VAI[v.role]}`,
        description: v.role === 'member'
          ? 'Người này không còn duyệt được bài nữa.'
          : 'Quyền duyệt bài có hiệu lực ngay.',
      });
      qc.invalidateQueries({ queryKey: ['admin', 'nhan-su'] });
    },
    onError: (err) => toast({ title: 'Không đổi được vai trò', description: errText(err), variant: 'destructive' }),
  });

  const tatCa = users.data || [];
  const doiNgu = tatCa.filter((u) => u.role === 'admin' || u.role === 'coach');

  // Dem theo nguoi duyet. `reviewed_by` luu ID nguoi dung (xem
  // worker/src/functions/index.js:142) - KHONG phai email. Doi chieu nham
  // truong la moi nguoi deu hien 0 bai, mot con so sai trong im lang.
  const soDuyet = React.useMemo(() => {
    const dem = {};
    for (const a of daDuyet.data || []) {
      const ai = a.reviewed_by || '';
      if (ai) dem[ai] = (dem[ai] || 0) + 1;
    }
    return dem;
  }, [daDuyet.data]);
  const chamTran = (daDuyet.data?.length || 0) >= 1000;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nhân sự"
        description="Ai đang có quyền duyệt bài. Đổi vai trò ở đây là có hiệu lực ngay."
      />

      <div className="flex gap-2.5 rounded-2xl border border-border bg-muted/40 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="text-[12.5px] leading-relaxed text-muted-foreground">
          <b className="text-foreground">Coach</b> duyệt được bài của học viên.{' '}
          <b className="text-foreground">Admin</b> làm được mọi việc, kể cả đổi vai trò người khác.
          Muốn cấp quyền cho người chưa có trong bảng này, vào trang{' '}
          <b className="text-foreground">Học viên</b> rồi đổi vai trò của họ.
        </div>
      </div>

      <Panel title={`${fmtNumber(doiNgu.length)} người có quyền`}>
        <QueryState
          query={users}
          empty={doiNgu.length === 0}
          emptyText="Chưa có ai ngoài bạn. Vào trang Học viên để cấp vai trò Coach cho người phụ trách chấm bài."
        >
          <TableScroll>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2.5 font-semibold">Người</th>
                  <th className="p-2.5 font-semibold">Vai trò</th>
                  <th className="p-2.5 font-semibold">Bài đã duyệt</th>
                  <th className="p-2.5 font-semibold">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {doiNgu.map((u) => {
                  const laToi = u.id === toi?.id;
                  return (
                    <tr key={u.id} className="border-b border-border/60 last:border-0">
                      <td className="p-2.5">
                        <div className="flex items-center gap-2.5">
                          <InitialAvatar name={u.full_name || u.email} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold">
                              {u.full_name || '(chưa đặt tên)'}
                              {laToi && <span className="ml-1.5 text-xs font-normal text-muted-foreground">— bạn</span>}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <CellSelect
                          value={u.role}
                          // May chu cung chan viec nay (xem `guard` cua User trong
                          // worker/src/entities/schema.js), nhung chan o day thi
                          // nguoi dung doc duoc LY DO thay vi an mot loi 422.
                          disabled={laToi || doiVai.isPending}
                          title={laToi ? 'Không tự đổi vai trò của chính mình được.' : undefined}
                          onChange={(e) => doiVai.mutate({ id: u.id, role: e.target.value })}
                          className={u.role === 'admin' ? 'border-primary/40 bg-primary/5 text-primary' : ''}
                        >
                          <option value="coach">Coach</option>
                          <option value="admin">Admin</option>
                          <option value="member">Học viên (gỡ quyền)</option>
                        </CellSelect>
                        {laToi && (
                          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                            Không tự đổi vai trò của mình được — nhờ một admin khác.
                          </p>
                        )}
                      </td>
                      <td className="p-2.5 tabular-nums">
                        {fmtNumber(soDuyet[u.id] || 0)}
                        {chamTran && '+'}
                      </td>
                      <td className="p-2.5">
                        <StatusPill tone={u.status === 'active' ? 'good' : 'muted'}>
                          {u.status === 'active' ? 'Đang hoạt động' : (u.status || 'không rõ')}
                        </StatusPill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
          {doiVai.isPending && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu…
            </p>
          )}
          {chamTran && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
              Số bài đã duyệt chỉ đếm trong 1000 bài gần nhất nên hiển thị kèm dấu “+”.
            </p>
          )}
        </QueryState>
      </Panel>
    </div>
  );
}
