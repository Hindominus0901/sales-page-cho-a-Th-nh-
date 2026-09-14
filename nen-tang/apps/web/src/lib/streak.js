/**
 * Chuoi ngay THUC TE cua mot nguoi, khong phai con so dang nam trong database.
 *
 * Vi sao can ham nay: `users.current_streak` chi duoc cap nhat khi co hoat dong
 * moi (worker/src/points/award.js touchStreak). Ai giu 7 ngay roi nghi mot thang
 * thi trong database van la 7 - va giao dien in thang ra se khoe "7 ngay" voi
 * mot nguoi da bo cuoc tu lau. Streak la thu tao ap luc quay lai; hien sai la
 * mat sach tac dung.
 *
 * Quy tac: hoat dong gan nhat phai la HOM NAY hoac HOM QUA thi chuoi moi con
 * song. Tinh hom qua la con song vi hom nay nguoi ta chua kip lam gi - dung luc
 * qua nua dem ma bao dut la sai.
 *
 * Khong sua database o day: viec do de touchStreak lam khi ho hoat dong lai.
 * Day thuan tuy la lop hien thi.
 */
export function streakDangSong(user) {
  const so = Number(user?.current_streak || 0);
  if (!so) return 0;
  const ngayCuoi = user?.last_activity_date;
  if (!ngayCuoi) return 0;

  const homNay = new Date();
  const hn = homNay.toISOString().slice(0, 10);
  homNay.setDate(homNay.getDate() - 1);
  const hq = homNay.toISOString().slice(0, 10);

  return ngayCuoi === hn || ngayCuoi === hq ? so : 0;
}
