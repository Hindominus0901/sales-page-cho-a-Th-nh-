/**
 * Tiện ích đọc kết quả db.batch(). noUncheckedIndexedAccess khiến mỗi phần tử
 * của mảng kết quả là "có thể undefined"; hai hàm này gom chỗ ép kiểu về một
 * nơi thay vì rải `!` khắp các route.
 */
export function rowsOf<T>(results: D1Result<unknown>[], index: number): T[] {
  return (results[index]?.results ?? []) as T[];
}

export function firstOf<T>(results: D1Result<unknown>[], index: number): T | null {
  return ((results[index]?.results ?? [])[0] ?? null) as T | null;
}
