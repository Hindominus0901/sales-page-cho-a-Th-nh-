/**
 * Tim nguoi co NHIEU HON MOT tai khoan.
 *
 * ============ VI SAO CAN MAN HINH NAY ============
 *
 * `users.phone_e164` co rang buoc UNIQUE, nhung no chi duoc dat khi tai khoan
 * noi duoc vao mot dong lead cung email (bridgeLead). Ai tu dang ky bang email
 * moi thi cot do la NULL - ma SQLite cho phep bao nhieu NULL cung duoc trong
 * mot cot UNIQUE. Nen mot nguoi dung ba email la co ba tai khoan day du: cung
 * tich XP, cung leo bang xep hang, cung doi qua.
 *
 * Voi mot cuoc thi co giai thuong va mot kho qua tru theo so luong, do la
 * duong farm re nhat he thong.
 *
 * ============ DUONG API DA CO TU TRUOC, GIAO DIEN THI KHONG ============
 *
 * `/api/admin/tai-khoan-trung` da chay duoc tu lau. Nhung `grep` toan bo
 * apps/web/src: KHONG mot man hinh nao goi no. Muon xem phai mo terminal va
 * go lenh - tuc la voi nguoi van hanh that thi no khong ton tai.
 *
 * ============ KHONG KET LUAN AI GIAN LAN ============
 *
 * Ba tin hieu, do tin cay GIAM DAN, va man hinh noi ro dieu do. Trang nay chi
 * gom nhom lai de mot con nguoi nhin va quyet dinh - no khong khoa ai, khong
 * danh dau ai la gian lan. Trung IP co the chi la hai vo chong dung chung mot
 * mang; trung 8 so cuoi co the la nguoi that doi email. Mot cong cu tu ket
 * luan se lam anh Thanh khoa nham nguoi that, va do la thiet hai lon hon.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Fingerprint, Phone, Wifi } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { PageHeader, Panel, QueryState, fmtNumber } from './_shared';

const CHAN = 200;

/** Mot the nhom nguoi nghi trung. Luon in ra DU danh sach email de doi chieu. */
function Nhom({ tieuDe, phu, emails, manh }) {
  return (
    <li className={`rounded-xl border p-3 ${manh ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
      <div className="text-[13px] font-semibold">{tieuDe}</div>
      {phu && <div className="mt-0.5 text-[11px] text-muted-foreground">{phu}</div>}
      <ul className="mt-1.5 space-y-0.5">
        {(emails || []).filter(Boolean).map((e) => (
          <li key={e} className="break-all font-mono text-[12px]">{e}</li>
        ))}
      </ul>
    </li>
  );
}

export default function AdminTaiKhoanTrung() {
  const q = useQuery({
    queryKey: ['admin', 'tai-khoan-trung'],
    queryFn: () => base44.adminApi.taiKhoanTrung(CHAN),
  });

  const dauVet = q.data?.dau_vet || [];
  const theoSdt = q.data?.theo_so_dien_thoai || [];
  const theoTenIp = q.data?.theo_ten_va_ip || [];
  const tong = dauVet.length + theoSdt.length + theoTenIp.length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tài khoản trùng"
        description="Những người có dấu hiệu dùng nhiều hơn một tài khoản. Đây là gợi ý để anh xem, không phải kết luận — hệ thống không tự khoá ai."
      />

      <QueryState query={q} empty={tong === 0} emptyText="Chưa thấy dấu hiệu trùng nào.">
        <div className="space-y-5">
          <Panel
            title={`Đã bắt tận tay · ${fmtNumber(dauVet.length)}`}
            description="Chắc chắn nhất: lúc tạo tài khoản, hệ thống thấy dòng đăng ký này ĐÃ thuộc về một tài khoản khác, và ghi lại. Không phải suy đoán."
          >
            {dauVet.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                Chưa ghi nhận trường hợp nào.
              </p>
            ) : (
              <ul className="space-y-2">
                {dauVet.map((r, i) => (
                  <li
                    key={`${r.lead_id}-${i}`}
                    className="rounded-xl border border-destructive/40 bg-destructive/5 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold">
                          Dòng đăng ký #{r.lead_id}
                        </div>
                        <div className="mt-0.5 break-all font-mono text-[12px]">
                          {[r.email, r.email_cu, r.chu_cu].filter(Boolean).join('  ·  ') || '—'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {String(r.luc || '').slice(0, 16).replace('T', ' ')}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={`Trùng số điện thoại · ${fmtNumber(theoSdt.length)}`}
            description="Hai tài khoản trở lên có cùng 8 chữ số cuối. Đáng tin, nhưng vẫn có thể là người thật đổi email."
          >
            {theoSdt.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">Không có nhóm nào.</p>
            ) : (
              <ul className="space-y-2">
                {theoSdt.map((r) => (
                  <Nhom
                    key={r.duoi_so}
                    manh
                    tieuDe={<><Phone className="mr-1 inline h-3.5 w-3.5" />…{r.duoi_so}</>}
                    phu={`${fmtNumber(r.so_tai_khoan)} tài khoản`}
                    emails={r.emails}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={`Trùng tên và IP · ${fmtNumber(theoTenIp.length)}`}
            description="Tín hiệu YẾU NHẤT. Cả nhà hoặc cả văn phòng dùng chung một mạng là trùng IP — chỉ nên dùng để gợi ý, đừng dựa vào đây để khoá ai."
          >
            {theoTenIp.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">Không có nhóm nào.</p>
            ) : (
              <ul className="space-y-2">
                {theoTenIp.map((r, i) => (
                  <Nhom
                    key={`${r.ten}-${r.ip}-${i}`}
                    tieuDe={<><Wifi className="mr-1 inline h-3.5 w-3.5" />{r.ten}</>}
                    phu={`${fmtNumber(r.so_lead)} lần điền form · IP ${r.ip}`}
                    emails={r.emails}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[12.5px] text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Muốn xem kỹ một người thì sang <strong>Học viên</strong> và bấm vào tên họ —
              hồ sơ ở đó có đủ đơn hàng, hoa hồng, bài tập và thư đã gửi.
            </span>
          </p>
        </div>
      </QueryState>
    </div>
  );
}
