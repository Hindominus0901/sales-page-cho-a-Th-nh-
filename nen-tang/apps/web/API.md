# Backend nói chuyện với frontend thế nào

Mọi lời gọi đều đi qua `@/api/base44Client` — **không bao giờ `fetch` thẳng trong
trang**. Lớp đó lo cookie phiên, mã chống CSRF và định dạng lỗi.

```js
import { base44 } from '@/api/base44Client';
```

## Dữ liệu (entity)

```js
base44.entities.Level.list('level_number', 20)        // sắp xếp, giới hạn
base44.entities.Post.filter({ is_hidden: false })     // chỉ so sánh bằng
base44.entities.Course.get(id)
base44.entities.Reward.create({ ... })                 // admin
base44.entities.Reward.update(id, { ... })
base44.entities.Reward.delete(id)
base44.entities.Notification.updateMany({ user_id, is_read: false }, { $set: { is_read: true } })
```

Trả về **mảng/đối tượng trần**, không bọc trong `{ data }`. Sắp xếp: tên cột,
thêm `-` ở đầu là giảm dần (`'-created_date'`).

Mọi bản ghi đều có `id`, `created_date`, `updated_date`, `created_by`.
Boolean trả về đúng `true/false` (không phải 0/1).

### Tên entity dùng được

`User` `Team` `Level` `ActivityType` `Badge` `Reward` `AppSetting` `PointRule`
`PortalSection` `Staff` `Activity` `XpTransaction` `CoinTransaction` `UserBadge`
`Challenge` `ChallengeDayTask` `ChallengeMember` `ChallengeSubmission`
`Redemption` `Post` `PostComment` `PostLike` `Course` `Lesson` `LessonProgress`
`Entitlement` `Product` `Notification` `AdminLog` `Recording`

### Những giới hạn PHẢI biết

Backend chặn theo vai trò, nên đừng thiết kế màn hình đòi hỏi thứ không lấy được:

- **`User`**: người thường đọc được danh sách nhưng **không thấy `email`,
  `phone`** của người khác — chỉ thấy `id, full_name, avatar_url, role, status,
  total_xp, total_coin, current_streak, longest_streak, content_count,
  call_count, assignment_count, team_id, bio`. Admin thì thấy đủ.
  Sửa hồ sơ của **chính mình** dùng `base44.auth.updateMe({...})`, không dùng
  `entities.User.update`.
- **Sổ cái** (`XpTransaction`, `CoinTransaction`), **`UserBadge`**,
  **`Redemption`**, **`PostLike`**, **`LessonProgress`**: chỉ đọc. Tạo/sửa qua
  hàm nghiệp vụ bên dưới.
- **`Notification`**: chỉ thấy của chính mình, chỉ sửa được `is_read`.
- **`Level`, `PointRule`, `AppSetting`, `Reward`, `Badge`, `ActivityType`,
  `Challenge`, `Course`, `Lesson`, `Team`, `Staff`, `PortalSection`, `Product`**:
  ai cũng đọc được, **chỉ admin ghi được**.
- **`Activity`, `ChallengeSubmission`**: người nộp chỉ sửa được nội dung bài
  (`title`, `description`, `evidence_link`, `screenshot_url`, `content`, `link`),
  **không** đặt được `status` hay điểm.

Sai quyền trả về **403** kèm `error.message` tiếng Việt — hiện thẳng câu đó cho
người dùng là được.

## Hàm nghiệp vụ

```js
base44.functions.invoke('tenHam', { ...tham_so })
```

Dùng khi việc cần nhiều bước xảy ra cùng nhau (trừ xu rồi mới tạo đơn đổi quà),
hoặc cần quyền hệ thống (cộng XP).

| Hàm | Tham số | Trả về |
|---|---|---|
| `logActivity` | `activity_type_key, title, description, evidence_link, screenshot_url, date` | `{ activity, counted, message }` |
| `approveActivity` | `activity_id, action: 'approve'\|'reject', rejection_reason` | `{ status, awarded }` — **admin** |
| `scoreActivity` | `activity_id` | `{ score, feedback, rubric }` — **admin**, AI chấm |
| `joinChallenge` | `challenge_id` | `{ member, joined }` |
| `submitChallengeDay` | `challenge_id, day, content, link` | `{ submission }` |
| `scoreChallengeDay` | `submission_id` | `{ passed, score, feedback, rubric, awarded }` |
| `createPost` | `body, image_url` | `{ post }` |
| `createComment` | `post_id, body` | `{ comment }` |
| `togglePostLike` | `post_id` | `{ liked }` |
| `completeLesson` | `lesson_id` | `{ awarded, course_completed }` |
| `redeemReward` | `reward_id` | `{ redemption }` |
| `updateRedemption` | `redemption_id, status, note` | `{ status }` — **admin**, huỷ thì hoàn xu |
| `adjustPoints` | `target_user_id, metric: 'xp'\|'coin', amount, reason` | `{ levelUp }` — **admin** |
| `grantEntitlement` | `user_id, kind, ref, note` | `{ entitlement }` — **admin** |
| `getLeaderboard` | `period, metric, limit` | `{ ranking, me }` |
| `reconcilePoints` | — | `{ drift_count, drift }` — **admin** |

### Bảng xếp hạng

`period`: `today` `week` `month` `all_time`
`metric`: `xp` `coin` `streak` `content` `call` `assignment`

Mỗi dòng `ranking`: `position, user_id, name, avatar_url, score, total_xp,
total_coin, current_streak, content_count, call_count, assignment_count,
level_number, level_name, level_icon, is_me`.

> "Bảng vàng" cũ (xếp theo Content/Cuộc gọi/Bài tập) không còn là trang riêng —
> nó thành bộ lọc `metric` ngay trong Bảng xếp hạng.

## Đăng nhập

```js
base44.auth.me()                       // người đang đăng nhập
base44.auth.updateMe({ full_name, avatar_url, phone, bio })   // CHỈ 4 trường này
base44.auth.logout(urlSauKhiThoat)
base44.auth.loginWithProvider('google', duongDanQuayLai)
```

`useAuth()` trong `@/lib/AuthContext` cho `user`, `isAuthenticated`,
`isLoadingAuth`.

## Tải tệp

```js
const { file_url } = await base44.integrations.Core.UploadFile({ file });
```

## Xử lý lỗi

Lỗi ném ra có `.status`, `.message`, `.data`. `message` đã là tiếng Việt dành
cho người dùng cuối — hiện thẳng, đừng tự viết lại.

```js
try { await base44.functions.invoke('redeemReward', { reward_id }); }
catch (err) { toast({ title: 'Không đổi được quà', description: err.message }); }
```

## Cấp bậc

Chỉ có **một thang duy nhất** (bảng `Level`): Đồng 0 → Bạc 500 → Vàng 1.500 →
Bạch Kim 3.500 → Kim Cương 7.000 XP. Không có "rank" tách riêng.
Admin sửa mốc trong trang Cơ chế, nên **đừng viết cứng con số vào giao diện** —
luôn đọc từ `entities.Level.list('level_number')`.
