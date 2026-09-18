/**
 * Kiem duyet Cong dong.
 *
 * ============ VI SAO TRANG NAY MOI DUOC THEM ============
 *
 * Co che AN da co san va DA CHAY THAT:
 *   - `posts.is_hidden` / `post_comments.is_hidden` co trong schema
 *   - entities/schema.js cho admin quyen ghi hai cot do (`writable.admin`)
 *   - trang hoc vien loc san: Community.jsx:84 chi lay `is_hidden: false`
 *   - va may chu chan luon: togglePostLike / createComment tra 404 cho bai
 *     da an (functions/index.js:803,836)
 *
 * Thieu dung MOT thu: khong man hinh nao bam duoc cai nut do. `grep Post
 * apps/web/src/pages/admin/` tra ve rong.
 *
 * Hau qua: co mot bai viet xau - chui boi, so dien thoai nguoi khac, link lua
 * dao - thi khong co cach nao go. Quyen thi co, duong thi khong.
 *
 * ============ AN CHU KHONG XOA ============
 *
 * Nut o day ghi `is_hidden` chu khong goi delete, du schema co cho admin xoa.
 * An thi hoan tac duoc va bai viet van con de doi chieu neu co tranh cai; xoa
 * thi mat han, ke ca khi go nham. Voi noi dung do NGUOI KHAC viet, go nham la
 * chuyen se xay ra.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, MessageSquare, Pin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  EmptyBlock, PageHeader, Panel, QueryState, errText, fmtNumber,
} from './_shared';

const CHAN = 200;

export default function AdminCongDong() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [hienCaDaAn, setHienCaDaAn] = React.useState(true);

  const baiViet = useQuery({
    queryKey: ['admin', 'posts'],
    queryFn: () => base44.entities.Post.list('-created_date', CHAN),
  });
  const binhLuan = useQuery({
    queryKey: ['admin', 'post-comments'],
    queryFn: () => base44.entities.PostComment.list('-created_date', CHAN),
  });

  const lamMoi = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'posts'] });
    qc.invalidateQueries({ queryKey: ['admin', 'post-comments'] });
  };

  const doiBai = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Post.update(id, data),
    onSuccess: (_r, v) => {
      toast({ title: v.data.is_hidden ? 'Đã ẩn bài viết' : 'Đã hiện lại bài viết' });
      lamMoi();
    },
    onError: (err) => toast({ title: 'Không đổi được', description: errText(err), variant: 'destructive' }),
  });

  const doiBinhLuan = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PostComment.update(id, data),
    onSuccess: (_r, v) => {
      toast({ title: v.data.is_hidden ? 'Đã ẩn bình luận' : 'Đã hiện lại bình luận' });
      lamMoi();
    },
    onError: (err) => toast({ title: 'Không đổi được', description: errText(err), variant: 'destructive' }),
  });

  const dsBai = (baiViet.data || []).filter((p) => hienCaDaAn || !p.is_hidden);
  const dsBinhLuan = (binhLuan.data || []).filter((c) => hienCaDaAn || !c.is_hidden);
  const soAn = (baiViet.data || []).filter((p) => p.is_hidden).length
    + (binhLuan.data || []).filter((c) => c.is_hidden).length;

  // Cham tran thi noi ro "200+" thay vi in mot con so tron nhu the do la tong
  // that - mau lay tu AdminVip.jsx.
  const chamTran = (baiViet.data || []).length >= CHAN || (binhLuan.data || []).length >= CHAN;
  const so = (n) => (chamTran ? `${fmtNumber(n)}+` : fmtNumber(n));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cộng đồng"
        description="Ẩn bài viết hoặc bình luận không phù hợp. Ẩn là hoàn tác được — bài vẫn còn trong hệ thống để đối chiếu nếu có tranh cãi."
      >
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => setHienCaDaAn((v) => !v)}
        >
          {hienCaDaAn ? 'Chỉ xem bài đang hiện' : `Xem cả ${fmtNumber(soAn)} mục đã ẩn`}
        </Button>
      </PageHeader>

      <Panel
        title={`Bài viết · ${so(dsBai.length)}`}
        description="Học viên chỉ nhìn thấy những bài đang hiện. Ẩn một bài thì tim và bình luận của bài đó cũng ngừng nhận."
      >
        <QueryState
          query={baiViet}
          empty={dsBai.length === 0}
          emptyText="Chưa có bài viết nào trong cộng đồng."
        >
          <ul className="space-y-2">
            {dsBai.map((p) => (
              <li
                key={p.id}
                className={`rounded-xl border p-3 ${p.is_hidden ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">
                      {p.user_name || p.user_id}
                      {p.is_pinned && <Pin className="ml-1 inline h-3 w-3 text-primary" />}
                      {p.is_hidden && (
                        <span className="ml-2 rounded-full bg-destructive/15 px-2 py-0.5 text-[10.5px] font-bold text-destructive">
                          đang ẩn
                        </span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px]">{p.body}</p>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {String(p.created_date || '').slice(0, 16).replace('T', ' ')}
                      {' · '}{fmtNumber(p.like_count)} tim · {fmtNumber(p.comment_count)} bình luận
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={p.is_hidden ? 'outline' : 'destructive'}
                    className="shrink-0 rounded-full text-xs"
                    disabled={doiBai.isPending}
                    onClick={() => doiBai.mutate({ id: p.id, data: { is_hidden: !p.is_hidden } })}
                  >
                    {p.is_hidden
                      ? <><Eye className="mr-1 h-3.5 w-3.5" /> Hiện lại</>
                      : <><EyeOff className="mr-1 h-3.5 w-3.5" /> Ẩn</>}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </QueryState>
      </Panel>

      <Panel
        title={`Bình luận · ${so(dsBinhLuan.length)}`}
        description="Ẩn riêng một bình luận mà không đụng tới bài viết."
      >
        <QueryState
          query={binhLuan}
          empty={dsBinhLuan.length === 0}
          emptyText="Chưa có bình luận nào."
        >
          {dsBinhLuan.length === 0 ? <EmptyBlock>Chưa có bình luận nào.</EmptyBlock> : (
            <ul className="space-y-2">
              {dsBinhLuan.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${c.is_hidden ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">
                      <MessageSquare className="mr-1 inline h-3 w-3 text-muted-foreground" />
                      {c.user_name || c.user_id}
                      {c.is_hidden && (
                        <span className="ml-2 rounded-full bg-destructive/15 px-2 py-0.5 text-[10.5px] font-bold text-destructive">
                          đang ẩn
                        </span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px]">{c.body}</p>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {String(c.created_date || '').slice(0, 16).replace('T', ' ')}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={c.is_hidden ? 'outline' : 'destructive'}
                    className="shrink-0 rounded-full text-xs"
                    disabled={doiBinhLuan.isPending}
                    onClick={() => doiBinhLuan.mutate({ id: c.id, data: { is_hidden: !c.is_hidden } })}
                  >
                    {c.is_hidden
                      ? <><Eye className="mr-1 h-3.5 w-3.5" /> Hiện lại</>
                      : <><EyeOff className="mr-1 h-3.5 w-3.5" /> Ẩn</>}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Panel>
    </div>
  );
}
