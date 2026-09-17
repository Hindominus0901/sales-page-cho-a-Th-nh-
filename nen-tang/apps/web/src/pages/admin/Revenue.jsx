/**
 * Doanh thu & Metrics - trang duy nhat (cung Affiliate) doc API funnel
 * /api/admin/* chu khong doc entity.
 *
 * API do dung phien dang nhap RIENG cua khu vuc quan tri funnel, khong phai
 * phien hoc vien. Nen 401 o day KHONG phai loi he thong ma la "chua dang nhap
 * ben do" - phai noi ro cho admin thay vi bao "co loi xay ra".
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { adminApi } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import {
  BarChart, ConfirmDialog, EmptyBlock, ErrorBlock, FunnelAuthNotice, Kpi, LoadingBlock,
  PageHeader, Panel, ReasonDialog, StatusPill, TableScroll, errText, fmtMoney, fmtNumber,
  fmtDateTime, isFunnelAuthError, timeAgo,
} from './_shared';

/** Doanh thu 8 tuan gan nhat, gop tu danh sach don da thanh toan. */
function weeklyRevenue(orders) {
  const bars = [];
  const now = Date.now();
  for (let w = 7; w >= 0; w -= 1) {
    const end = now - w * 7 * 86400000;
    const begin = end - 7 * 86400000;
    const value = orders
      .filter((o) => {
        const t = new Date(o.paid_at || o.created_at).getTime();
        return t > begin && t <= end;
      })
      .reduce((sum, o) => sum + Number(o.paid_amount || o.amount || 0), 0);
    bars.push({ label: `T${8 - w}`, value, display: value ? `${Math.round(value / 1e6)}tr` : '0' });
  }
  return bars;
}

const ORDER_TONE = { paid: 'good', pending: 'warn', cancelled: 'bad' };
const ORDER_LABEL = { paid: 'Đã thanh toán', pending: 'Chờ thanh toán', cancelled: 'Đã huỷ' };

export default function Revenue() {
  const qc = useQueryClient();
  const { toast } = useToast();
  // Ma don dang cho xac nhan - giu rieng hai cai vi hai hop thoai khac nhau.
  const [dangXacNhanTra, setDangXacNhanTra] = useState(null);
  const [dangHuy, setDangHuy] = useState(null);

  const lamMoi = () => qc.invalidateQueries({ queryKey: ['funnel'] });

  // Duong CHINH de mot don thanh 'da thanh toan' la webhook SePay tu ban ve.
  // Nut nay chi de vet nhung truong hop webhook truot: khach chuyen thieu vai
  // nghin, ghi sai noi dung, hoac ngan hang bao cham. Backend van chay dung
  // luong xu ly nhu webhook (mo quyen truy cap, sinh hoa hong), nen bam o day
  // khong tao ra don "nua voi".
  const danhDauDaTra = useMutation({
    mutationFn: (code) => adminApi.markOrderPaid(code, { note: 'xác nhận tay trong trang Doanh thu' }),
    onSuccess: () => { toast({ title: 'Đã đánh dấu đơn đã thanh toán' }); setDangXacNhanTra(null); lamMoi(); },
    onError: (err) => toast({ title: 'Không cập nhật được', description: errText(err), variant: 'destructive' }),
  });

  const huyDon = useMutation({
    mutationFn: ({ code, reason }) => adminApi.cancelOrder(code, reason),
    onSuccess: () => { toast({ title: 'Đã huỷ đơn' }); setDangHuy(null); lamMoi(); },
    onError: (err) => toast({ title: 'Không huỷ được', description: errText(err), variant: 'destructive' }),
  });

  const stats = useQuery({ queryKey: ['funnel', 'stats'], queryFn: () => adminApi.stats(), retry: false });
  const paidOrders = useQuery({
    queryKey: ['funnel', 'orders', 'paid'],
    queryFn: () => adminApi.orders({ status: 'paid', limit: 500 }),
    retry: false,
  });
  // Giao dich ngan hang: bang nay TRONG nghia la SePay chua he goi toi. Truoc
  // day khong co man hinh nao cho biet dieu do - don cu nam mai o "cho thanh
  // toan" ma khong ai doan duoc loi nam o dau.
  const txns = useQuery({
    queryKey: ['funnel', 'bank-txns'],
    queryFn: () => adminApi.bankTxns(50),
    retry: false,
  });

  const recent = useQuery({
    queryKey: ['funnel', 'orders', 'recent'],
    queryFn: () => adminApi.orders({ limit: 20 }),
    retry: false,
  });

  if (stats.isLoading) return <LoadingBlock />;
  if (stats.isError) {
    return (
      <div className="space-y-5">
        <PageHeader title="Doanh thu & chỉ số" />
        {isFunnelAuthError(stats.error)
          ? <FunnelAuthNotice error={stats.error} />
          : <ErrorBlock error={stats.error} onRetry={stats.refetch} />}
      </div>
    );
  }

  const d = stats.data || {};
  const funnel = d.funnel || {};
  const revenue = d.revenue || {};
  const affiliate = d.affiliate || {};

  const steps = [
    { label: 'Xem trang bán hàng', value: fmtNumber(funnel.sessions), sub: '100%', tone: 'muted' },
    { label: 'Điền form đăng ký', value: fmtNumber(funnel.leads), sub: `${funnel.cr_session_to_lead ?? 0}% chuyển đổi`, tone: 'warn' },
    { label: 'Vào trang thanh toán', value: fmtNumber(funnel.orders), sub: `${funnel.cr_lead_to_order ?? 0}% từ form`, tone: 'warn' },
    { label: 'Thanh toán thành công', value: fmtNumber(funnel.paid), sub: `${funnel.cr_order_to_paid ?? 0}% chốt đơn`, tone: 'good' },
  ];

  const orderRows = recent.data?.items || [];
  const sources = d.top_sources || [];
  const maxSource = Math.max(1, ...sources.map((s) => s.n));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Doanh thu & chỉ số"
        description="Số liệu bán hàng lấy trực tiếp từ hệ thống funnel: phiên truy cập, đơn hàng, hoa hồng."
      >
        <ExportMenu />
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Doanh thu đã thu"
          value={revenue.total_text || fmtMoney(revenue.total)}
          delta={`${fmtNumber(funnel.paid)} đơn đã thanh toán`}
          tone="good"
        />
        <Kpi
          label="Đơn chờ thanh toán"
          value={fmtNumber(funnel.pending)}
          delta={`${fmtNumber(funnel.orders)} đơn đã tạo`}
          tone={funnel.pending > 0 ? 'warn' : 'muted'}
        />
        <Kpi label="Giá trị đơn trung bình" value={fmtMoney(revenue.aov)} delta="Trên đơn đã thanh toán" />
        <Kpi
          label="Hoa hồng affiliate"
          value={affiliate.commission_total_text || fmtMoney(affiliate.commission_total)}
          delta={`Còn ${affiliate.commission_pending_text || fmtMoney(affiliate.commission_pending)} chưa trả`}
          tone="warn"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Doanh thu theo tuần" description="8 tuần gần nhất, tính theo ngày ghi nhận thanh toán." className="lg:col-span-2">
          {paidOrders.isLoading ? (
            <LoadingBlock />
          ) : paidOrders.isError ? (
            <ErrorBlock error={paidOrders.error} onRetry={paidOrders.refetch} />
          ) : (
            <BarChart bars={weeklyRevenue(paidOrders.data?.items || [])} />
          )}
        </Panel>

        <Panel title="Nguồn khách hàng" description="Theo utm_source của lượt đăng ký.">
          {sources.length === 0 ? (
            <EmptyBlock>Chưa có lượt đăng ký nào.</EmptyBlock>
          ) : (
            <div className="space-y-3">
              {sources.slice(0, 6).map((s) => (
                <div key={s.source}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{s.source}</span>
                    <span className="text-muted-foreground">{fmtNumber(s.n)} lượt</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(s.n / maxSource) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs font-semibold text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-2xl font-extrabold tracking-tight">{s.value}</div>
            <div className="mt-1"><StatusPill tone={s.tone}>{s.sub}</StatusPill></div>
          </div>
        ))}
      </div>

      <Panel
        title="Giao dịch ngân hàng"
        description="Do SePay báo về. Trống nghĩa là chưa có đồng nào chạy qua webhook."
      >
        {/* Bang trong co hai nghia rat khac nhau - chua ai goi toi, hay co goi
            ma sai khoa - va hai chuyen do phai sua o hai cho khac han. */}
        {!txns.isLoading && !txns.isError && (() => {
          // `da_tung_nhan` doc tu bang bank_txns, `webhook` doc tu bo nho tam.
          // Bo nho tam het han thi KHONG duoc quay ra ket luan "chua ai goi lan
          // nao" - chuyen do tung xay ra va no bao chi Thanh di sua SePay trong
          // khi SePay dang chay tot.
          const daNhan = txns.data?.da_tung_nhan;
          const dauChan = txns.data?.webhook;
          const saiKhoa = dauChan?.ket === 'sai_khoa';
          const mau = saiKhoa ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : (daNhan || dauChan) ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-900';
          return (
            <div className={cn('mb-3 rounded-xl border px-3.5 py-2.5 text-[12.5px]', mau)}>
              {saiKhoa ? (
                <><b>Có cuộc gọi tới nhưng bị từ chối vì sai khoá</b> — {fmtDateTime(dauChan.luc)}.
                Khoá trong SePay không khớp với khoá của hệ thống.</>
              ) : dauChan ? (
                <>Cuộc gọi gần nhất vào webhook: <b>{fmtDateTime(dauChan.luc)}</b> — nhận được bình thường.</>
              ) : daNhan ? (
                <><b>SePay đã từng gửi giao dịch về thành công.</b> Chưa ghi nhận cuộc gọi nào
                gần đây — bình thường khi chưa có ai chuyển khoản.</>
              ) : (
                <><b>Chưa ai gọi vào webhook lần nào.</b> SePay chưa nối được tới hệ thống —
                kiểm tra mục Giao dịch của tài khoản ngân hàng bên SePay.</>
              )}
            </div>
          );
        })()}
        {txns.isLoading ? (
          <LoadingBlock />
        ) : txns.isError ? (
          <ErrorBlock error={txns.error} onRetry={txns.refetch} />
        ) : (txns.data?.items || []).length === 0 ? (
          <EmptyBlock>
            Chưa nhận được giao dịch nào từ ngân hàng. Nếu tiền đã vào tài khoản mà ở đây vẫn trống
            thì webhook SePay chưa gọi tới được — kiểm tra lịch sử gửi webhook bên SePay.
          </EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Thời gian</th>
                  <th className="p-2.5 text-right font-semibold">Số tiền</th>
                  <th className="p-2.5 font-semibold">Nội dung</th>
                  <th className="p-2.5 font-semibold">Khớp đơn</th>
                </tr>
              </thead>
              <tbody>
                {(txns.data?.items || []).map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="p-2.5 text-xs text-muted-foreground">{fmtDateTime(t.created_at)}</td>
                    <td className="p-2.5 text-right font-mono font-bold">{fmtMoney(t.amount)}</td>
                    <td className="p-2.5 text-xs">{t.content || '—'}</td>
                    <td className="p-2.5">
                      {t.matched_order
                        ? <span className="font-mono text-xs font-bold">{t.matched_order}</span>
                        : <StatusPill tone="warn">{t.status === 'underpaid' ? 'thiếu tiền' : 'chưa khớp đơn'}</StatusPill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <Panel title="Đơn hàng gần đây" description={`${fmtNumber(recent.data?.total)} đơn trong hệ thống`}>
        {recent.isLoading ? (
          <LoadingBlock />
        ) : recent.isError ? (
          <ErrorBlock error={recent.error} onRetry={recent.refetch} />
        ) : orderRows.length === 0 ? (
          <EmptyBlock>Chưa có đơn hàng nào.</EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Mã đơn</th>
                  <th className="p-2.5 font-semibold">Khách hàng</th>
                  <th className="p-2.5 font-semibold">Sản phẩm</th>
                  <th className="p-2.5 text-right font-semibold">Số tiền</th>
                  <th className="p-2.5 font-semibold">Thời gian</th>
                  <th className="p-2.5 font-semibold">Trạng thái</th>
                  <th className="p-2.5 text-right font-semibold">Xử lý</th>
                </tr>
              </thead>
              <tbody>
                {orderRows.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="p-2.5 font-mono text-xs font-bold">{o.code}</td>
                    <td className="p-2.5">
                      <div className="font-semibold">{o.customer_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{o.customer_phone || o.customer_email || ''}</div>
                    </td>
                    <td className="p-2.5 text-muted-foreground">{o.product_name}</td>
                    <td className="p-2.5 text-right font-bold">{fmtMoney(o.paid_amount || o.amount)}</td>
                    <td className="p-2.5 text-xs text-muted-foreground">{timeAgo(o.paid_at || o.created_at)}</td>
                    <td className="p-2.5">
                      <StatusPill tone={ORDER_TONE[o.status] || 'muted'}>
                        {ORDER_LABEL[o.status] || o.status}
                      </StatusPill>
                    </td>
                    <td className="p-2.5 text-right whitespace-nowrap">
                      {o.status === 'pending' ? (
                        <>
                          <Button
                            size="sm" variant="outline" className="rounded-full text-xs"
                            onClick={() => setDangXacNhanTra(o)}
                          >
                            Đã nhận tiền
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="ml-1 rounded-full text-xs text-muted-foreground"
                            onClick={() => setDangHuy(o)}
                          >
                            Huỷ
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
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
        open={!!dangXacNhanTra}
        onOpenChange={(v) => !v && setDangXacNhanTra(null)}
        title="Xác nhận đã nhận được tiền?"
        description={dangXacNhanTra
          ? `Đơn ${dangXacNhanTra.code} — ${fmtMoney(dangXacNhanTra.amount)} của ${dangXacNhanTra.customer_name || 'khách'}. `
            + 'Hãy kiểm tra app ngân hàng trước: thao tác này mở quyền truy cập và sinh hoa hồng cho người giới thiệu, '
            + 'giống hệt như khi tiền về thật.'
          : ''}
        confirmLabel="Đã nhận tiền, mở quyền"
        pending={danhDauDaTra.isPending}
        onConfirm={() => danhDauDaTra.mutate(dangXacNhanTra.code)}
      />

      <ReasonDialog
        open={!!dangHuy}
        onOpenChange={(v) => !v && setDangHuy(null)}
        title="Huỷ đơn hàng"
        description={dangHuy ? `Đơn ${dangHuy.code} — ${fmtMoney(dangHuy.amount)}.` : ''}
        confirmLabel="Huỷ đơn"
        placeholder="Ví dụ: khách đổi ý, đơn trùng, khách chuyển nhầm..."
        pending={huyDon.isPending}
        onConfirm={(reason) => huyDon.mutate({ code: dangHuy.code, reason })}
      />
    </div>
  );
}


/**
 * Nut tai du lieu ve may.
 *
 * Bon duong dan nay da co o backend tu lau nhung chi trang quan tri CU
 * (/quan-tri-funnel) goi toi, nen trong cong quan tri moi khong co cach nao
 * lay du lieu ra. Dung the <a download> chu khong fetch: trinh duyet tu gui
 * cookie phien va tu mo hop luu file, khong phai dung qua bo nho.
 */
function ExportMenu() {
  const FILES = [
    { href: '/api/admin/export/leads.csv', label: 'leads.csv' },
    { href: '/api/admin/export/orders.csv', label: 'orders.csv' },
    { href: '/api/admin/export/affiliates.csv', label: 'affiliates.csv' },
    { href: '/api/admin/export/backup.json', label: 'backup.json' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">Tải về:</span>
      {FILES.map((f) => (
        <a
          key={f.href}
          href={f.href}
          download
          className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-secondary"
        >
          {f.label}
        </a>
      ))}
    </div>
  );
}
