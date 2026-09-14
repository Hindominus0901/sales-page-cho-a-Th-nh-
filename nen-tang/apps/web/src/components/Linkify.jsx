import React from "react";

// Bat ca "https://..." lan "www...." vi nguoi dung hay dan thieu giao thuc.
// Ban co /g dung de tach chuoi, ban khong /g dung de kiem tra - regex co /g giu
// con tro lastIndex nen dung .test() tren no se cho ket qua sai lan thu hai.
const SPLIT_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
const IS_URL_RE = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/;

/**
 * Bien duong dan trong bai viet thanh the <a>.
 *
 * Tao THANG phan tu React thay vi dangerouslySetInnerHTML: noi dung bai viet do
 * nguoi dung go, dua vao innerHTML la mo duong cho chen ma doc.
 */
export default function Linkify({ text, className }) {
  const parts = String(text || "").split(SPLIT_RE);

  return (
    <p className={className} style={{ whiteSpace: "pre-wrap" }}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (!IS_URL_RE.test(part)) return <React.Fragment key={i}>{part}</React.Fragment>;
        const href = part.startsWith("http") ? part : `https://${part}`;
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline break-all"
          >
            {part}
          </a>
        );
      })}
    </p>
  );
}
