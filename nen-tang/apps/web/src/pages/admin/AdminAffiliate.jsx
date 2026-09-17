/**
 * Quan ly Affiliate - doc API funnel (/api/admin/*), khong phai entity.
 *
 * Ba viec chinh: xem ai gioi thieu tot, tra hoa hong, va soat lai nhung luot
 * gioi thieu bi he thong danh dau nghi ngo truoc khi cong tien cho ai.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { adminApi } from '@/api/base44Client';
import ChonNguoiGioiThieu from '@/components/ChonNguoiGioiThieu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  ConfirmDialog, EmptyBlock, ErrorBlock, FunnelAuthNotice, InitialAvatar, Kpi,
  LoadingBlock, PageHeader, Panel, ReasonDialog, StatusPill, TableScroll,
  errText, fmtDate, fmtMoney, fmtNumber, isFunnelAuthError,
} from './_shared';

const COMMISSION_TABS = [
  { key: 'pending', label: 'Chờ thanh toán' },
  { key: 'paid', label: 'Đã thanh toán' },
  { key: 'void', label: 'Đã huỷ' },
];

export default function AdminAffiliate() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [commissionTab, setCommissionTab] = React.useState('pending');
  const [paying, setPaying] = React.useState(null);
  const [voiding, setVoiding] = React.useState(null);
  const [referralAction, setReferralAction] = React.useState(null); // { lead, action }
  const [ganMa, setGanMa] = React.useState(null);   // dong ma la dang duoc gan
  const [ganCode, setGanCode] = React.useState(''); // ma cong tac vien duoc chon

  const stats = useQuery({ queryKey: ['funnel', 'stats'], queryFn: () => adminApi.stats(), retry: false });
  // Tim o PHIA MAY CHU chu khong loc mang da tai ve: bang chi lay 100 dong dau,
  // ma da co 492 cong tac vien - loc tai trang thi go ten nguoi thu 300 se
  // khong ra gi, va khong ai hieu vi sao.
  const [tim, setTim] = React.useState('');
  const [timHoi, setTimHoi] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setTimHoi(tim.trim()), 300);
    return () => clearTimeout(t);
  }, [tim]);

  const affiliates = useQuery({
    queryKey: ['funnel', 'affiliates', timHoi],
    queryFn: () => adminApi.affiliates({ limit: 100, q: timHoi || undefined }),
    retry: false,
  });
  const commissions = useQuery({
    queryKey: ['funnel', 'commissions', commissionTab],
    queryFn: () => adminApi.commissions({ status: commissionTab, limit: 200 }),
    retry: false,
  });
  const referrals = useQuery({
    queryKey: ['funnel', 'referrals', 'pending'],
    queryFn: () => adminApi.pendingReferrals(100),
    retry: false,
  });
  const maLa = useQuery({
    queryKey: ['funnel', 'ma-la'],
    queryFn: () => adminApi.maLa(50),
    retry: false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['funnel'] });
  };

  const pay = useMutation({
    mutationFn: (id) => adminApi.payCommission(id, 'đã chuyển hoa hồng'),
    onSuccess: () => { toast({ title: 'Đã đánh dấu đã trả hoa hồng' }); setPaying(null); refresh(); },
    onError: (err) => toast({ title: 'Không cập nhật được', description: errText(err), variant: 'destructive' }),
  });

  const voidComm = useMutation({
    mutationFn: ({ id, reason }) => adminApi.voidCommission(id, reason),
    onSuccess: () => { toast({ title: 'Đã huỷ khoản hoa hồng' }); setVoiding(null); refresh(); },
    onError: (err) => toast({ title: 'Không huỷ được', description: errText(err), variant: 'destructive' }),
  });

  const setReferral = useMutation({
    mutationFn: ({ id, action, reason }) => adminApi.setReferral(id, action, reason),
    onSuccess: (_res, vars) => {
      toast({ title: vars.action === 'valid' ? 'Đã công nhận lượt giới thiệu' : 'Đã loại lượt giới thiệu' });
      setReferralAction(null);
      refresh();
    },
    onError: (err) => toast({ title: 'Không xử lý được', description: errText(err), variant: 'destructive' }),
  });

  const gan = useMutation({
    mutationFn: ({ ma, code }) => adminApi.ganMaLa(ma, code),
    onSuccess: (res) => {
      const d = res?.data || res;
      const buText = d?.hoa_hong_bu
        ? `Sinh bù ${d.hoa_hong_bu} khoản hoa hồng cho đơn đã thanh toán.`
        : undefined;
      toast({
        title: `Đã gán ${d?.da_gan ?? 0} lượt giới thiệu`,
        // canh_bao = người vừa chọn cũng đến từ chính mã này, rất dễ là chọn nhầm.
        description: d?.canh_bao ? [d.canh_bao, buText].filter(Boolean).join(' ') : buText,
        variant: d?.canh_bao ? 'destructive' : undefined,
      });
      setGanMa(null);
      setGanCode('');
      refresh();
    },
    onError: (err) => toast({ title: 'Không gán được', description: errText(err), variant: 'destructive' }),
  });

  if (stats.isLoading) return <LoadingBlock />;
  if (stats.isError) {
    return (
      <div className="space-y-5">
        <PageHeader title="Quản lý Affiliate" />
        {isFunnelAuthError(stats.error)
          ? <FunnelAuthNotice error={stats.error} />
          : <ErrorBlock error={stats.error} onRetry={stats.refetch} />}
      </div>
    );
  }

  const aff = stats.data?.affiliate || {};
  const affRows = affiliates.data?.items || [];
  const commRows = commissions.data?.items || [];
  const referralRows = referrals.data?.items || [];
  const maLaRows = maLa.data?.items || [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quản lý Affiliate"
        description="Theo dõi người giới thiệu, trả hoa hồng và soát lại các lượt giới thiệu đáng ngờ."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Cộng tác viên đang hoạt động" value={fmtNumber(aff.active)} delta={`${fmtNumber(aff.sharers)} người đã có lượt mời`} />
        <Kpi label="Tỷ lệ chia sẻ" value={`${aff.share_rate ?? 0}%`} delta="Trên tổng số người đăng ký" />
        <Kpi
          label="Tổng hoa hồng"
          value={aff.commission_total_text || fmtMoney(aff.commission_total)}
          delta={`${fmtNumber(aff.commission_count)} khoản`}
          tone="good"
        />
        <Kpi
          label="Còn phải trả"
          value={aff.commission_pending_text || fmtMoney(aff.commission_pending)}
          delta={`Mức hoa hồng mặc định ${aff.default_rate_text || '—'}`}
          tone="warn"
        />
      </div>

      <Panel
        title="Top người giới thiệu"
        action={(
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={tim}
              onChange={(e) => setTim(e.target.value)}
              placeholder="Tìm theo tên, mã, số điện thoại, email..."
              className="rounded-full pl-9"
            />
          </div>
        )}
      >
        {affiliates.isLoading ? (
          <LoadingBlock />
        ) : affiliates.isError ? (
          <ErrorBlock error={affiliates.error} onRetry={affiliates.refetch} />
        ) : affRows.length === 0 ? (
          <EmptyBlock>
            {timHoi
              ? `Không tìm thấy ai khớp “${timHoi}”. Thử gõ ít chữ hơn, hoặc tìm bằng mã.`
              : 'Chưa có cộng tác viên nào.'}
          </EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Người giới thiệu</th>
                  <th className="p-2.5 font-semibold">Mã</th>
                  <th className="p-2.5 text-right font-semibold">Lượt bấm</th>
                  <th className="p-2.5 text-right font-semibold">Đã mời</th>
                  <th className="p-2.5 text-right font-semibold">Đơn đã trả tiền</th>
                  <th className="p-2.5 text-right font-semibold">Hoa hồng</th>
                  <th className="p-2.5 font-semibold">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {affRows.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="p-2.5">
                      <div className="flex items-center gap-2.5">
                        <InitialAvatar name={a.full_name} size={32} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{a.full_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{a.phone || a.email || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5 font-mono text-xs font-bold">{a.code}</td>
                    <td className="p-2.5 text-right">{fmtNumber(a.clicks)}</td>
                    <td className="p-2.5 text-right">
                      {fmtNumber(a.referrals)}
                      {a.pending_referrals > 0 && (
                        <span className="ml-1 text-[11px] font-semibold text-amber-600">
                          (+{a.pending_referrals} chờ soát)
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-right">{fmtNumber(a.paid_orders)}</td>
                    <td className="p-2.5 text-right font-bold">{a.commission_total_text}</td>
                    <td className="p-2.5">
                      <StatusPill tone={a.status === 'active' ? 'good' : 'bad'}>
                        {a.status === 'active' ? 'Đang hoạt động' : 'Đã chặn'}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <Panel
        title="Hàng đợi hoa hồng"
        description="Chỉ đánh dấu “đã trả” sau khi tiền thực sự đã chuyển đi."
        action={(
          <div className="flex gap-1.5">
            {COMMISSION_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setCommissionTab(t.key)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                  commissionTab === t.key
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-secondary',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      >
        {commissions.isLoading ? (
          <LoadingBlock />
        ) : commissions.isError ? (
          <ErrorBlock error={commissions.error} onRetry={commissions.refetch} />
        ) : commRows.length === 0 ? (
          <EmptyBlock>Không có khoản hoa hồng nào trong mục này.</EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[880px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Đơn hàng</th>
                  <th className="p-2.5 font-semibold">Người nhận</th>
                  <th className="p-2.5 text-right font-semibold">Giá trị đơn</th>
                  <th className="p-2.5 text-right font-semibold">Tỷ lệ</th>
                  <th className="p-2.5 text-right font-semibold">Hoa hồng</th>
                  <th className="p-2.5 font-semibold">Ngày tạo</th>
                  <th className="p-2.5 font-semibold">Xử lý</th>
                </tr>
              </thead>
              <tbody>
                {commRows.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="p-2.5 font-mono text-xs font-bold">{c.order_code}</td>
                    <td className="p-2.5">
                      <div className="font-semibold">{c.affiliate_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.affiliate_code}{c.affiliate_phone ? ` · ${c.affiliate_phone}` : ''}
                      </div>
                    </td>
                    <td className="p-2.5 text-right">{fmtMoney(c.order_amount)}</td>
                    <td className="p-2.5 text-right">{c.rate_text}</td>
                    <td className="p-2.5 text-right font-bold">{c.amount_text}</td>
                    <td className="p-2.5 text-xs text-muted-foreground">{fmtDate(c.created_at)}</td>
                    <td className="p-2.5">
                      {c.status === 'paid' ? (
                        <StatusPill tone="good">Đã trả {fmtDate(c.paid_at)}</StatusPill>
                      ) : c.status === 'void' ? (
                        <StatusPill tone="bad">Đã huỷ</StatusPill>
                      ) : (
                        <div className="flex gap-1.5">
                          <Button size="sm" className="rounded-full" onClick={() => setPaying(c)}>
                            Đã trả
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full text-destructive"
                            onClick={() => setVoiding(c)}
                          >
                            Huỷ
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <Panel
        title="Lượt giới thiệu chờ soát"
        description="Hệ thống tạm không tính các lượt này (nghi trùng người hoặc gian lận). Bạn quyết định công nhận hay loại bỏ."
      >
        {referrals.isLoading ? (
          <LoadingBlock />
        ) : referrals.isError ? (
          <ErrorBlock error={referrals.error} onRetry={referrals.refetch} />
        ) : referralRows.length === 0 ? (
          <EmptyBlock>Không có lượt giới thiệu nào cần soát.</EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Người được mời</th>
                  <th className="p-2.5 font-semibold">Người giới thiệu</th>
                  <th className="p-2.5 font-semibold">Lý do tạm loại</th>
                  <th className="p-2.5 font-semibold">Ngày đăng ký</th>
                  <th className="p-2.5 font-semibold">Xử lý</th>
                </tr>
              </thead>
              <tbody>
                {referralRows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="p-2.5">
                      <div className="font-semibold">{r.full_name}</div>
                      <div className="text-xs text-muted-foreground">{r.phone || r.email || ''}</div>
                    </td>
                    <td className="p-2.5">
                      <div className="font-semibold">{r.affiliate_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.affiliate_code}</div>
                    </td>
                    <td className="p-2.5 text-xs text-muted-foreground">{r.referral_void_reason || '—'}</td>
                    <td className="p-2.5 text-xs text-muted-foreground">{fmtDate(r.created_at)}</td>
                    <td className="p-2.5">
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                          disabled={setReferral.isPending}
                          onClick={() => setReferral.mutate({ id: r.id, action: 'valid', reason: 'admin công nhận sau khi soát' })}
                        >
                          {setReferral.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Công nhận'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full text-destructive"
                          onClick={() => setReferralAction({ lead: r, action: 'void' })}
                        >
                          Loại bỏ
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <Panel
        title="Mã giới thiệu lạ"
        description="Có người bấm vào link mang mã không tồn tại — thường là link của hệ thống cũ ai đó còn giữ. Người bấm vào vẫn đăng ký bình thường, nhưng lượt đó không được tính cho ai. Chọn đúng cộng tác viên rồi bấm gán để trả lại lượt cho họ."
      >
        {maLa.isLoading ? (
          <LoadingBlock />
        ) : maLa.isError ? (
          <ErrorBlock error={maLa.error} onRetry={maLa.refetch} />
        ) : maLaRows.length === 0 ? (
          <EmptyBlock>Chưa ghi nhận mã lạ nào. Tốt.</EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Mã lạ</th>
                  <th className="p-2.5 font-semibold">Lượt bấm</th>
                  <th className="p-2.5 font-semibold">Người đăng ký chưa được tính</th>
                  <th className="p-2.5 font-semibold">Lần gần nhất</th>
                  <th className="p-2.5 font-semibold">Xử lý</th>
                </tr>
              </thead>
              <tbody>
                {maLaRows.map((r) => (
                  <tr key={r.ma} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="p-2.5 font-mono font-semibold">{r.ma}</td>
                    <td className="p-2.5">{fmtNumber(r.so_lan)}</td>
                    <td className="p-2.5">
                      <span className={cn('font-semibold', r.so_nguoi_mat > 0 && 'text-destructive')}>
                        {fmtNumber(r.so_nguoi_mat)}
                      </span>
                    </td>
                    <td className="p-2.5 text-xs text-muted-foreground">{fmtDate(r.lan_cuoi)}</td>
                    <td className="p-2.5">
                      {r.gan_cho ? (
                        <span className="text-xs text-muted-foreground">
                          Đã gán về <span className="font-mono font-semibold">{r.gan_cho}</span>
                        </span>
                      ) : r.so_nguoi_mat === 0 ? (
                        <span className="text-xs text-muted-foreground">Không có lượt nào để gán</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => { setGanMa(r); setGanCode(''); }}
                        >
                          Gán cho cộng tác viên…
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <ConfirmDialog
        open={!!ganMa}
        onOpenChange={(v) => !v && setGanMa(null)}
        title={`Gán ${ganMa?.so_nguoi_mat || 0} lượt của mã ${ganMa?.ma || ''} cho ai?`}
        description="Chỉ những người chưa có người giới thiệu mới được gán; ai đã có rồi thì giữ nguyên, không ghi đè. Nếu họ đã mua rồi thì hoa hồng sẽ được sinh bù ngay."
        confirmLabel="Gán lượt"
        pending={gan.isPending}
        disabled={!ganCode}
        disabledReason={!ganCode ? 'Chọn người nhận những lượt này trước đã.' : undefined}
        onConfirm={() => gan.mutate({ ma: ganMa.ma, code: ganCode })}
      >
        <ChonNguoiGioiThieu
          ma={ganCode}
          onChon={setGanCode}
          nhan="Những lượt này thuộc về ai?"
          ghiChuDaChon="Các lượt của mã lạ sẽ được ghi nhận cho người này."
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!paying}
        onOpenChange={(v) => !v && setPaying(null)}
        title={`Xác nhận đã trả ${paying?.amount_text || ''}?`}
        description={`Khoản hoa hồng của ${paying?.affiliate_name || ''} sẽ chuyển sang “đã thanh toán” và biến mất khỏi hàng đợi. Chỉ bấm khi tiền đã chuyển thật.`}
        confirmLabel="Đã chuyển tiền"
        pending={pay.isPending}
        onConfirm={() => pay.mutate(paying.id)}
      />

      <ReasonDialog
        open={!!voiding}
        onOpenChange={(v) => !v && setVoiding(null)}
        title="Huỷ khoản hoa hồng"
        description={`Khoản ${voiding?.amount_text || ''} của ${voiding?.affiliate_name || ''} sẽ bị huỷ và không bao giờ được chi trả. Không hoàn tác được.`}
        confirmLabel="Huỷ khoản này"
        reasonLabel="Lý do huỷ (bắt buộc)"
        placeholder="VD: đơn hàng đã hoàn tiền, nghi tự mua qua link của mình"
        pending={voidComm.isPending}
        onConfirm={(reason) => voidComm.mutate({ id: voiding.id, reason })}
      />

      <ReasonDialog
        open={!!referralAction}
        onOpenChange={(v) => !v && setReferralAction(null)}
        title="Loại bỏ lượt giới thiệu"
        description={`Lượt giới thiệu ${referralAction?.lead?.full_name || ''} sẽ không được tính cho ${referralAction?.lead?.affiliate_name || ''}, và không sinh hoa hồng.`}
        confirmLabel="Loại bỏ"
        reasonLabel="Lý do loại bỏ (bắt buộc)"
        placeholder="VD: trùng số điện thoại với chính người giới thiệu"
        pending={setReferral.isPending}
        onConfirm={(reason) => setReferral.mutate({ id: referralAction.lead.id, action: 'void', reason })}
      />
    </div>
  );
}
