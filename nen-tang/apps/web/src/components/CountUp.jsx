import React, { useEffect, useRef, useState } from "react";

/**
 * Dem tang dan tu 0 toi `value` trong ~0.9 giay (ease-out cubic, giong ban
 * thiet ke). Chay lai moi khi con so doi de nguoi dung thay diem vua cong.
 */
export default function CountUp({ value = 0, duration = 900, suffix = "", className }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return <span className={className}>{shown.toLocaleString('vi-VN')}{suffix}</span>;
}
