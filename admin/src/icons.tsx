/**
 * Icon nét mảnh, dựng thẳng bằng SVG thay vì kéo cả một thư viện icon về —
 * mười mấy cái icon không đáng để thêm một phụ thuộc.
 */
const S = (d: string, extra?: string) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
    {extra ? <path d={extra} /> : null}
  </svg>
);

export const ICONS: Record<string, JSX.Element> = {
  overview:  S('M3 12h6v9H3zM10 3h4v18h-4zM15 8h6v13h-6z'),
  revenue:   S('M3 17l6-6 4 4 8-8', 'M17 7h4v4'),
  leads:     S('M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6', 'M12 11a4 4 0 100-8 4 4 0 000 8z'),
  orders:    S('M5 7h14l-1 13H6L5 7z', 'M9 7V5a3 3 0 016 0v2'),
  payments:  S('M3 7h18v11H3z', 'M3 11h18M7 15h3'),
  students:  S('M12 3l9 5-9 5-9-5 9-5z', 'M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5'),
  approval:  S('M9 12l2 2 4-5', 'M4 5h16v15H4z'),
  workshop:  S('M15 10l6-3v10l-6-3', 'M3 7h12v10H3z'),
  affiliate: S('M8.6 13.4a5 5 0 010-7l1.4-1.4a5 5 0 017 7l-1 1', 'M15.4 10.6a5 5 0 010 7L14 19a5 5 0 01-7-7l1-1'),
  commission:S('M12 2v20', 'M17 6.5c0-2-2.2-3-5-3s-5 1-5 3 2.2 3 5 3.5 5 1.5 5 3.5-2.2 3-5 3-5-1-5-3'),
  payouts:   S('M3 8h18v11H3z', 'M3 8l3-4h12l3 4M12 12v4M9.5 14h5'),
  rewards:   S('M4 11h16v10H4z', 'M2 7h20v4H2zM12 7v14M12 7S9 3 7 4.5 8.5 7 12 7s5-.5 3-2.5S12 7 12 7'),
  rank:      S('M8 21h8', 'M12 17v4M6 4h12v4a6 6 0 01-12 0V4zM6 6H3v2a4 4 0 004 4M18 6h3v2a4 4 0 01-4 4'),
  mechanics: S('M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 007 19.4a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H1a2 2 0 110-4h.1A1.7 1.7 0 002.6 7a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 007 2.6h.1A1.7 1.7 0 008.9 1V1a2 2 0 114 0v.1A1.7 1.7 0 0017 2.6a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V7a1.7 1.7 0 001.5 1h.1a2 2 0 110 4H23a1.7 1.7 0 00-1.6 1z'),
  audit:     S('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2', 'M9 3h6v4H9zM9 12h6M9 16h4'),
  settings:  S('M4 6h16M4 12h16M4 18h16', 'M8 4v4M16 10v4M11 16v4'),
  staff:     S('M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20',
               'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 11l2 2 4-4'),
};

export const Icon = ({ name }: { name: string }) => ICONS[name] ?? ICONS.overview!;
