/**
 * Trang "Email" trong cong quan tri.
 *
 * Noi ro ngay tren dau mot dieu de nham lan: he thong co HAI lan email khac
 * nhau. Kit lo phan nuoi duong; ma OTP va dat lai mat khau di duong khac vi
 * phai toi trong vai giay. Chon nham lan la nguoi dung khong dang ky duoc.
 *
 * Chon tag theo TEN lay thang tu tai khoan Kit - khong bat ai phai go ma so.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, ExternalLink, RefreshCw, Send, CheckCircle2, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  PageHeader, Panel, LoadingBlock, ErrorBlock, EmptyBlock, TableScroll,
  StatusPill, CellSelect, errText, timeAgo,
} from './_shared';

/** Cac khoa cau hinh trang nay quan, kem cach hien thi. */
// Ba buoc trong hanh trinh cua mot nguoi. Moi buoc gan mot TAG (de loc, de
// dem) va co the day vao mot CHUOI EMAIL (de tu dong nuoi duong).
const STEPS = [
  {
    title: '1 · Vừa để lại thông tin ở trang bán hàng',
    note: 'Chưa có tài khoản. Đây là nhóm đông nhất và cần nuôi dưỡng nhất.',
    tag: 'kit_tag_lead',
    seq: 'kit_sequence_lead',
  },
  {
    title: '2 · Đã tạo tài khoản (xác thực email xong)',
    note: 'Sau khi nhập đúng mã OTP, hoặc đăng nhập bằng Google.',
    tag: 'kit_tag_member',
    seq: 'kit_sequence_welcome',
  },
  {
    title: '3 · Đã mua vé VIP',
    note: 'Sau khi ngân hàng báo đã nhận được tiền.',
    tag: 'kit_tag_customer',
    seq: 'kit_sequence_customer',
  },
];

// StatusPill chi hieu good/warn/bad/brand/muted (xem _shared.jsx). Truoc day o
// day tra ve 'success'/'warning'/'danger' - khong ten nao khop, nen toneClass
// la undefined va the hien ra KHONG CO MAU. Ca cot tro thanh vo nghia dung o
// cho nguoi ta liec mot cai de biet co gi hong khong.
const TONE = { ok: 'good', partial: 'warn' };
// Va in thang gia tri may ('ok'/'partial'/'error', 'kit_tag_customer') cho mot
// nguoi khong ranh ky thuat doc thi cung bang khong noi gi.
const TRANG_THAI = { ok: 'Xong', partial: 'Xong một phần', error: 'Lỗi' };
const VIEC = {
  kit_tag_lead: 'Gắn nhãn khách tiềm năng',
  kit_tag_customer: 'Gắn nhãn khách đã mua',
  kit_sequence_lead: 'Thêm vào chuỗi email khách tiềm năng',
  kit_sequence_customer: 'Thêm vào chuỗi email khách đã mua',
};

function SyncRow({ row }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4 font-medium">{row.email}</td>
      <td className="py-2 pr-4 text-muted-foreground">{VIEC[row.action] || row.action}</td>
      <td className="py-2 pr-4">
        <StatusPill tone={TONE[row.status] || 'bad'}>
          {TRANG_THAI[row.status] || row.status}
        </StatusPill>
      </td>
      <td className="py-2 pr-4 text-muted-foreground max-w-[280px] truncate" title={row.error || ''}>
        {row.error || '—'}
      </td>
      <td className="py-2 text-muted-foreground whitespace-nowrap">{timeAgo(row.created_at)}</td>
    </tr>
  );
}

export default function Email() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [testEmail, setTestEmail] = React.useState('');

  const status = useQuery({
    queryKey: ['kit', 'status'],
    queryFn: () => base44.adminApi.kitStatus(),
  });

  const configured = !!status.data?.configured;

  // Chi hoi Kit lay danh sach tag khi da co kho API - khong thi cham mot nhip
  // roi bao loi vo ich.
  const lists = useQuery({
    queryKey: ['kit', 'lists'],
    queryFn: () => base44.adminApi.kitLists(),
    enabled: configured,
  });

  // Cau hinh nam trong AppSetting nen sua bang chinh entity do, giong trang "Cơ chế".
  const settingRows = useQuery({
    queryKey: ['appsettings', 'kit'],
    queryFn: () => base44.entities.AppSetting.filter({ category: 'kit' }),
  });

  const save = useMutation({
    mutationFn: ({ id, value }) => base44.entities.AppSetting.update(id, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appsettings', 'kit'] });
      qc.invalidateQueries({ queryKey: ['kit', 'status'] });
      toast({ title: 'Đã lưu' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Không lưu được', description: errText(err) }),
  });

  const test = useMutation({
    mutationFn: (email) => base44.adminApi.kitTest(email),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['kit', 'status'] });
      if (res?.ok) toast({ title: 'Đã đẩy sang Kit', description: 'Mở Kit và tìm email vừa nhập để kiểm tra.' });
      else toast({ variant: 'destructive', title: 'Không đẩy được', description: res?.error || 'Kit từ chối.' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Không đẩy được', description: errText(err) }),
  });

  const backfill = useMutation({
    mutationFn: (source) => base44.adminApi.kitBackfill({ source, limit: 25 }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['kit', 'status'] });
      toast({
        title: `Đã đẩy ${res.done} người`,
        description: res.remaining > 0
          ? `Còn ${res.remaining} người chưa đẩy — bấm lại để chạy tiếp đợt sau.`
          : 'Đã đẩy hết.',
      });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Không chạy được', description: errText(err) }),
  });

  const rowFor = (key) => (settingRows.data || []).find((r) => r.key === key);
  const enabledRow = rowFor('kit_enabled');
  const enabled = enabledRow ? enabledRow.value !== 'false' : true;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email"
        description="Kit (ConvertKit) lo danh sách người nhận và chuỗi email nuôi dưỡng."
      />

      {/* Phan vai hai lan email - de o tren cung vi day la cho de hieu nham nhat */}
      <Panel title="Hai làn email, đừng nhầm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" /> Thư giao dịch</div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Mã OTP đăng ký, link đặt lại mật khẩu, xác nhận đơn hàng. Phải tới
              trong vài giây, gửi riêng cho đúng một người.
            </p>
            <p className="mt-2 text-sm">
              <strong>Không đi qua Kit.</strong> Kit chỉ có gửi hàng loạt qua hàng đợi
              nên chậm vài phút — người đăng ký sẽ bỏ đi trước khi mã tới.
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" /> Thư nuôi dưỡng</div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Chuỗi chào mừng, bản tin, mời mua, chăm sóc sau khoá học.
            </p>
            <p className="mt-2 text-sm">
              <strong>Đi qua Kit.</strong> Hệ thống chỉ đẩy người sang Kit kèm tag —
              còn gửi gì, lúc nào, nội dung ra sao thì chị soạn thẳng trong Kit,
              không cần nhờ lập trình viên.
            </p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Kết nối Kit"
        action={(
          <Button variant="outline" size="sm" onClick={() => status.refetch()} disabled={status.isFetching}>
            {status.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Kiểm tra lại</span>
          </Button>
        )}
      >
        {status.isLoading ? <LoadingBlock /> : status.error ? <ErrorBlock error={status.error} onRetry={status.refetch} /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {configured && !status.data?.error ? (
                <StatusPill tone="good"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Đã kết nối</StatusPill>
              ) : (
                <StatusPill tone="bad"><XCircle className="mr-1 inline h-3.5 w-3.5" />Chưa kết nối</StatusPill>
              )}
              {status.data?.account?.name && (
                <span className="text-sm text-muted-foreground">Tài khoản: {status.data.account.name}</span>
              )}
            </div>

            {status.data?.error && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {status.data.error}
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <div className="font-medium">Bật đồng bộ sang Kit</div>
                <p className="text-sm text-muted-foreground">
                  Tắt đi thì hệ thống ngừng đẩy người sang Kit. Mã OTP và đặt lại
                  mật khẩu không bị ảnh hưởng.
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={!enabledRow || save.isPending}
                onCheckedChange={(v) => enabledRow && save.mutate({ id: enabledRow.id, value: v ? 'true' : 'false' })}
              />
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Ba bước trong hành trình học viên"
        description="Mỗi bước gắn một tag (để lọc, để đếm) và có thể đẩy vào một chuỗi email tự động. Chọn từ danh sách có sẵn trong tài khoản Kit."
      >
        {settingRows.isLoading ? <LoadingBlock /> : (
          <div className="space-y-3">
            {!configured && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Chưa đặt kho API nên chưa lấy được danh sách tag. Chạy lệnh sau rồi
                deploy lại: <code className="font-mono">npx wrangler secret put KIT_API_KEY</code>
              </div>
            )}
            {STEPS.map((step) => {
              const picker = (key, kind, nhan) => {
                const row = rowFor(key);
                const options = lists.data?.[kind] || [];
                return (
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{nhan}</span>
                    <CellSelect
                      value={row?.value || ''}
                      disabled={!row || !configured || lists.isLoading}
                      onChange={(e) => row && save.mutate({ id: row.id, value: e.target.value })}
                    >
                      <option value="">— Không —</option>
                      {options.map((o) => (
                        <option key={o.id} value={String(o.id)}>{o.name}</option>
                      ))}
                      {/* Da chon nhung khong con trong Kit -> van hien, khong am tham mat */}
                      {row?.value && !options.some((o) => String(o.id) === String(row.value)) && (
                        <option value={row.value}>#{row.value} (không còn trong Kit)</option>
                      )}
                    </CellSelect>
                  </label>
                );
              };
              return (
                <div key={step.tag} className="rounded-xl border p-4">
                  <div className="font-medium">{step.title}</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.note}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {picker(step.tag, 'tags', 'Gắn tag')}
                    {picker(step.seq, 'sequences', 'Đưa vào chuỗi email')}
                  </div>
                </div>
              );
            })}
            {lists.data?.error && (
              <p className="text-sm text-destructive">Không lấy được danh sách từ Kit: {lists.data.error}</p>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Thử một email" description="Đẩy một địa chỉ sang Kit ngay để xem kết nối chạy thật chưa.">
        <div className="flex flex-wrap gap-2">
          <Input
            type="email"
            placeholder="email@vidu.com"
            className="max-w-xs"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <Button onClick={() => test.mutate(testEmail)} disabled={!configured || !testEmail || test.isPending}>
            {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="ml-2">Đẩy thử</span>
          </Button>
        </div>
        {!configured && (
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            Chưa nối được với Kit nên nút này đang tắt — xem phần “Kết nối Kit” ở trên.
          </p>
        )}
      </Panel>

      <Panel
        title="Đẩy người cũ sang Kit"
        description="Những người đã có trong hệ thống từ trước. Chạy theo từng đợt 25 người, bấm lại để chạy tiếp."
      >
        {!configured && (
          <p className="mb-2 text-[12.5px] text-muted-foreground">
            Chưa nối được với Kit nên hai nút dưới đang tắt — xem phần “Kết nối Kit” ở trên.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => backfill.mutate('leads')} disabled={!configured || backfill.isPending}>
            {backfill.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Đẩy danh sách người để lại thông tin
          </Button>
          <Button variant="outline" onClick={() => backfill.mutate('users')} disabled={!configured || backfill.isPending}>
            {backfill.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Đẩy danh sách thành viên
          </Button>
          <a
            className="inline-flex items-center gap-1.5 self-center text-sm text-muted-foreground hover:underline"
            href="https://app.kit.com/subscribers" target="_blank" rel="noreferrer"
          >
            Mở Kit <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </Panel>

      <Panel title="Nhật ký đồng bộ" description="30 lần gần nhất. Dùng để trả lời 'người này đã sang Kit chưa?'">
        {status.isLoading ? <LoadingBlock /> : !(status.data?.recent || []).length ? (
          <EmptyBlock>Chưa có lần đồng bộ nào.</EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Việc</th>
                  <th className="pb-2 pr-4 font-medium">Kết quả</th>
                  <th className="pb-2 pr-4 font-medium">Lỗi</th>
                  <th className="pb-2 font-medium">Lúc</th>
                </tr>
              </thead>
              <tbody>
                {status.data.recent.map((r, i) => <SyncRow key={`${r.email}-${i}`} row={r} />)}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}
