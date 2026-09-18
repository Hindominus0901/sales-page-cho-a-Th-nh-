/**
 * Co che hoat dong - noi doi luat choi ma khong can lap trinh vien.
 *
 * Ba bang: luat cong diem (PointRule), cau hinh chung (AppSetting) va moc cap
 * bac (Level).
 *
 * Phan cau hinh chung KHONG viet cung danh sach o day: form duoc dung tu chinh
 * du lieu (cot type/label/description/category/options_json cua tung dong). Nho
 * vay them mot cau hinh moi ve sau chi la them mot dong trong bang, khong phai
 * sua giao dien.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  CellInput, CellSelect, EmptyBlock, LoadingBlock, PageHeader, Panel, QueryState,
  TableScroll, errText, fmtNumber,
} from './_shared';

/** Ten nhom hien cho de doc; nhom la chua biet thi lay nguyen khoa. */
const CATEGORY_LABEL = {
  'loc-nguoi': 'Ai được vào học',
  challenge: 'Challenge',
  diem: 'Điểm & chống cày điểm',
  // Cac nhom duoi day thuoc 23 dong cai dat KHONG AI DOC, da bi migration 0018
  // xoa. Giu lai nhan de neu database that con sot dong cu (migration chua
  // chay) thi no van hien ra co ten tu te thay vi mot khoa tran.
  streak: 'Chuỗi ngày (streak)',
  leaderboard: 'Bảng xếp hạng',
  rewards: 'Quà tặng & xu',
  courses: 'Lớp học',
  affiliate: 'Affiliate',
  reminder: 'Nhắc nhở học viên',
  ai: 'AI chấm bài',
};

/** Nhan tieng Viet cho vai gia tri select hay gap; con lai hien nguyen ban. */
const OPTION_LABEL = {
  daily: 'Hằng ngày', weekly: 'Hằng tuần', monthly: 'Hằng tháng', all_time: 'Toàn thời gian',
  streak: 'Chuỗi ngày dài hơn', earliest: 'Đạt điểm sớm hơn', alphabet: 'Tên A-Z',
  auto: 'Tự động', manual: 'Admin duyệt tay',
  zalo: 'Zalo', email: 'Email', both: 'Cả hai',
};

function readOptions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

export default function Mechanics() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const rules = useQuery({
    queryKey: ['admin', 'pointRules'],
    queryFn: () => base44.entities.PointRule.list('sort_order', 200),
  });
  const settings = useQuery({
    queryKey: ['admin', 'appSettings'],
    queryFn: () => base44.entities.AppSetting.list('sort_order', 200),
  });
  const levels = useQuery({
    queryKey: ['levels'],
    queryFn: () => base44.entities.Level.list('level_number', 50),
  });

  const saveRule = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PointRule.update(id, data),
    onSuccess: () => {
      toast({ title: 'Đã lưu luật tính điểm' });
      qc.invalidateQueries({ queryKey: ['admin', 'pointRules'] });
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const saveSetting = useMutation({
    mutationFn: ({ id, value }) => base44.entities.AppSetting.update(id, { value }),
    onSuccess: () => {
      toast({ title: 'Đã lưu cấu hình' });
      qc.invalidateQueries({ queryKey: ['admin', 'appSettings'] });
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const saveLevel = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Level.update(id, data),
    onSuccess: () => {
      toast({ title: 'Đã lưu cấp bậc' });
      qc.invalidateQueries({ queryKey: ['levels'] });
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const ruleList = rules.data || [];
  const settingList = settings.data || [];
  const levelList = levels.data || [];

  // Gom cau hinh theo nhom, giu dung thu tu sort_order ma backend tra ve.
  const groups = [];
  for (const s of settingList) {
    const key = s.category || 'khac';
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: CATEGORY_LABEL[key] || key, items: [] };
      groups.push(group);
    }
    group.items.push(s);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cơ chế hoạt động"
        description="Tuỳ chỉnh cách hệ thống tính điểm và vận hành — áp dụng cho mọi học viên, không cần lập trình."
      />

      <Panel
        title="Luật cộng điểm"
        description="Mỗi sự kiện trong hệ thống cộng bao nhiêu XP và xu, có trần theo ngày hay trọn đời không."
      >
        <QueryState query={rules} empty={ruleList.length === 0} emptyText="Chưa có luật tính điểm nào.">
          <TableScroll>
            <table className="w-full min-w-[940px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Sự kiện</th>
                  <th className="p-2.5 font-semibold">XP</th>
                  <th className="p-2.5 font-semibold">Xu</th>
                  <th className="p-2.5 font-semibold">Trần / ngày</th>
                  <th className="p-2.5 font-semibold">Trần trọn đời</th>
                  <th className="p-2.5 font-semibold">Đang bật</th>
                  <th className="p-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {ruleList.map((r) => (
                  <RuleRow
                    key={`${r.id}-${r.updated_date}`}
                    rule={r}
                    pending={saveRule.isPending}
                    onSave={(data) => saveRule.mutate({ id: r.id, data })}
                  />
                ))}
              </tbody>
            </table>
          </TableScroll>
        </QueryState>
      </Panel>

      <Panel
        title="Cấp bậc & mốc XP"
        description="Ngưỡng XP để lên mỗi bậc — ảnh hưởng huy hiệu và điều kiện đổi quà theo cấp."
      >
        <QueryState query={levels} empty={levelList.length === 0} emptyText="Chưa có cấp bậc nào.">
          <TableScroll>
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Cấp</th>
                  <th className="p-2.5 font-semibold">Biểu tượng</th>
                  <th className="p-2.5 font-semibold">Tên cấp</th>
                  <th className="p-2.5 font-semibold">XP tối thiểu</th>
                  <th className="p-2.5 font-semibold">Quyền lợi</th>
                  <th className="p-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {levelList.map((l) => (
                  <LevelRow
                    key={`${l.id}-${l.updated_date}`}
                    level={l}
                    pending={saveLevel.isPending}
                    onSave={(data) => saveLevel.mutate({ id: l.id, data })}
                  />
                ))}
              </tbody>
            </table>
          </TableScroll>
        </QueryState>
      </Panel>

      {settings.isLoading ? (
        <LoadingBlock />
      ) : groups.length === 0 ? (
        <Panel title="Cấu hình chung"><EmptyBlock>Chưa có cấu hình nào.</EmptyBlock></Panel>
      ) : (
        groups.map((g) => (
          <Panel key={g.key} title={g.label}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {g.items.map((s) => (
                <SettingField
                  key={`${s.id}-${s.updated_date}`}
                  setting={s}
                  pending={saveSetting.isPending}
                  onSave={(value) => saveSetting.mutate({ id: s.id, value })}
                />
              ))}
            </div>
          </Panel>
        ))
      )}
    </div>
  );
}

function RuleRow({ rule, onSave, pending }) {
  const [draft, setDraft] = React.useState(rule);
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });
  const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-2.5">
        <CellInput value={draft.label || ''} onChange={set('label')} className="min-w-[220px] font-semibold" />
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">{rule.event_key}</div>
      </td>
      <td className="p-2.5"><CellInput type="number" value={draft.xp ?? 0} onChange={set('xp')} className="w-20" /></td>
      <td className="p-2.5"><CellInput type="number" value={draft.coin ?? 0} onChange={set('coin')} className="w-20" /></td>
      <td className="p-2.5">
        <CellInput
          type="number"
          value={draft.daily_cap ?? ''}
          onChange={set('daily_cap')}
          className="w-24"
          placeholder="Không"
        />
      </td>
      <td className="p-2.5">
        <CellInput
          type="number"
          value={draft.lifetime_cap ?? ''}
          onChange={set('lifetime_cap')}
          className="w-24"
          placeholder="Không"
        />
      </td>
      <td className="p-2.5">
        <Switch
          checked={draft.is_active !== false}
          onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
        />
      </td>
      <td className="p-2.5">
        <Button
          size="sm"
          className="rounded-full"
          disabled={pending}
          onClick={() => onSave({
            label: draft.label || '',
            xp: Number(draft.xp) || 0,
            coin: Number(draft.coin) || 0,
            daily_cap: numOrNull(draft.daily_cap),
            lifetime_cap: numOrNull(draft.lifetime_cap),
            is_active: draft.is_active !== false,
          })}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
        </Button>
      </td>
    </tr>
  );
}

function LevelRow({ level, onSave, pending }) {
  const [draft, setDraft] = React.useState(level);
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-2.5 font-bold text-muted-foreground">{level.level_number}</td>
      <td className="p-2.5"><CellInput value={draft.icon || ''} onChange={set('icon')} className="w-16 text-center" /></td>
      <td className="p-2.5"><CellInput value={draft.name || ''} onChange={set('name')} className="w-36 font-semibold" /></td>
      <td className="p-2.5">
        <CellInput type="number" value={draft.threshold_xp ?? 0} onChange={set('threshold_xp')} className="w-28" />
        <div className="mt-1 text-[11px] text-muted-foreground">{fmtNumber(draft.threshold_xp)} XP</div>
      </td>
      <td className="p-2.5"><CellInput value={draft.perk || ''} onChange={set('perk')} className="min-w-[260px]" /></td>
      <td className="p-2.5">
        <Button
          size="sm"
          className="rounded-full"
          disabled={pending}
          onClick={() => onSave({
            name: draft.name || '',
            icon: draft.icon || '',
            threshold_xp: Number(draft.threshold_xp) || 0,
            perk: draft.perk || '',
          })}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
        </Button>
      </td>
    </tr>
  );
}

/**
 * Mot o cau hinh, hinh dang do cot `type` cua chinh dong du lieu quyet dinh.
 * Nut Luu chi hien khi gia tri thuc su doi, de khong ai bam nham.
 */
/**
 * Danh sach so kieu JSON ('[0,3]') <-> chuoi de go ('0, 3').
 *
 * VI SAO PHAI CO: gia tri that trong database la JSON, con o nhap truoc day roi
 * vao nhanh "text" - tuc la chi Thanh phai tu go dau ngoac vuong. Go "0, 3"
 * thay vi "[0,3]" thi settings.js:22 JSON.parse that bai, tra ve null, va ben
 * doc coi nhu DANH SACH RONG. Khong mot dong loi nao.
 *
 * Voi `st-ngay-chi-diem-danh` thi danh sach rong nghia la buoi Kick-Off quay
 * lai nam trong mau so tinh "hoan thanh thu thach" - tuc la mot dau ngoac
 * thieu lam ca lop khong ai nhan duoc phan thuong hoan thanh, va khong ai
 * doan ra vi sao. Do la dung cai bay ma migration 0018 vua go ra.
 */
function docDanhSachSo(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isFinite);
  } catch { /* chua phai JSON - thu doc kieu nguoi go ben duoi */ }
  return null;
}

function SettingField({ setting, onSave, pending }) {
  const laDanhSachSo = setting.type === 'json';
  const [value, setValue] = React.useState(() => {
    if (!laDanhSachSo) return setting.value ?? '';
    const ds = docDanhSachSo(setting.value ?? '[]');
    return ds ? ds.join(', ') : String(setting.value ?? '');
  });

  // Voi danh sach so, so sanh theo GIA TRI da chuan hoa chu khong theo chuoi:
  // "0, 3" va "[0,3]" la mot, khong duoc hien nut Luu nhu the vua co thay doi.
  const chuanHoa = laDanhSachSo
    ? (() => {
      const so = String(value).split(',').map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n));
      return String(value).trim() === '' ? '[]' : JSON.stringify(so);
    })()
    : String(value);
  const hopLe = !laDanhSachSo
    || String(value).trim() === ''
    || String(value).split(',').every((x) => Number.isFinite(Number(x.trim())) && x.trim() !== '');
  const dirty = laDanhSachSo
    ? chuanHoa !== JSON.stringify(docDanhSachSo(setting.value ?? '[]') || [])
    : String(value) !== String(setting.value ?? '');
  const options = readOptions(setting.options_json);

  let control;
  if (laDanhSachSo) {
    control = (
      <CellInput
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-40"
        placeholder="0, 3"
        aria-invalid={!hopLe}
      />
    );
  } else if (setting.type === 'bool') {
    control = (
      <Switch
        checked={value === 'true' || value === true}
        onCheckedChange={(v) => setValue(v ? 'true' : 'false')}
      />
    );
  } else if (setting.type === 'select') {
    control = (
      <CellSelect value={value} onChange={(e) => setValue(e.target.value)} className="w-52">
        {options.map((o) => (
          <option key={o} value={o}>{OPTION_LABEL[o] || o}</option>
        ))}
      </CellSelect>
    );
  } else {
    control = (
      <CellInput
        type={setting.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-40"
      />
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{setting.label || setting.key}</div>
        {setting.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{setting.description}</p>
        )}
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">{setting.key}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex flex-col items-end gap-1">
          {control}
          {/* Go sai thi NOI RA VA CHAN LUU, khong luu mot gia tri se bi doc
              thanh danh sach rong. */}
          {!hopLe && (
            <span className="text-[11px] leading-tight text-destructive">
              Chỉ điền số, cách nhau bằng dấu phẩy. Ví dụ: 0, 3
            </span>
          )}
        </div>
        {dirty && hopLe && (
          <Button
            size="sm"
            className="rounded-full"
            disabled={pending}
            onClick={() => onSave(laDanhSachSo ? chuanHoa : String(value))}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
          </Button>
        )}
      </div>
    </div>
  );
}
