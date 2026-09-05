# Handoff: AI Agent Challenge / 21-Day Content Challenge — Sales Page

## Overview
A single long-form sales/landing page for Đỗ Mạnh Thành's "21 ngày xây kênh" challenge — a paid personal-branding/content coaching program. The page covers: hero, problem/agitation, testimonials, curriculum breakdown, proof (video + screenshot walls), program mechanics, pricing, objections, FAQ, and a closing CTA with a scroll-triggered sticky bottom bar.

## About the Design Files
The bundled file is a **design reference built in HTML** — a working prototype showing the intended look, copy, and interaction, not production code to copy verbatim. It also carries a thin custom-runtime wrapper (`<x-dc>`, `support.js`) from the prototyping tool it was built in — **ignore that wrapper**; the actual design is everything inside the `<div class="fc2">…</div>` root. Recreate this page in your target stack (React/Vue/Next/plain HTML — whatever the codebase already uses) using its existing component/styling conventions. Don't ship the raw file as-is.

## Fidelity
**High-fidelity.** Final copy (Vietnamese), colors, spacing, and most interaction states are locked in. Exact values are listed below — match them.

## Screens / Views
One continuous scrolling page, in this order:

1. **Marquee ticker** — dark (#1a1a1a) full-width band, slight -0.4° rotation, infinite horizontal scroll of two alternating stat/hook lines, lime-green text (#a8d98d), 13px, weight 600. `translateX(0)`→`translateX(-50%)`, 26s linear infinite, content duplicated for seamless loop.
2. **Hero** — eyebrow label (green, 13px bold uppercase) → H1 (Oswald, uppercase, 42px/800) → subhead paragraph → primary CTA (filled green pill button, glow-sweep animation) + secondary ghost CTA → 5-star rating + 4 overlapping checkmark badges ("Được tin tưởng bởi hàng trăm học viên") → 16:9 hero video thumbnail with two-layer frosted/gradient play button.
3. **Checklist strip** — 3-item "👉 Không cần…" list under hero.
4. **"Học viên nói gì"** — horizontal-scroll strip of 6 vertical (9:16) video thumbnails, each with a small two-layer play button.
5. **"Nhìn thẳng vào thực tế đi"** — problem narrative: 5-line bullet intro, 3-line pain-point list, a large centered pull-quote with a hand-drawn SVG squiggle underline, 2 closing paragraphs.
6. **Testimonial marquee** — auto-scrolling horizontal track (34s linear infinite, pauses on hover) of 5 testimonial cards (name, role, quote), duplicated for seamless loop.
7. **"Anh chị sẽ học được gì"** — single-column stack of 6 cards: Định vị, Nội dung (10 content angles), Bán hàng, 21 bài thật, Quà tặng kèm (dark card, glow-sweep), Về đích đúng hạn (green card, glow-sweep, 🎖️ icon). Followed by a 4-thumbnail video strip.
8. **"Feedback từ học viên"** — 2-column grid of 6 real screenshot images (no card framing — shown raw), each with a name caption below.
9. **"Feedback thêm từ cộng đồng Skool"** — 3-card grid, plain quotes (no images).
10. **"Thử thách này hoạt động như thế nào"** — 3 numbered steps (green circle badges) + a 3-thumbnail video strip.
11. **Privileges** — 2-column: "Phần 1 — Thử thách" (white card) / "Phần 2 — Phần thưởng" (green card).
12. **Pricing ("Học phí")** — white card, max-width 700px: benefit checklist (👉 bullets) → "Tổng giá trị nhận được" with struck-through anchor price (4.000.000đ) and final price (2.000.000đ, 38px/800) in a glowing highlight box (pulse + sweep animation) → fine print (guarantee, 30-seat cap).
13. **"Tại sao anh chị nên nghe Thành"** — 3 items, plain list with top border dividers (no cards).
14. **"Sợ bận đột xuất làm không kịp"** — 3 numbered items (same green-circle pattern as step 10).
15. **Objections block** — dark-outlined white card, 2×2 grid of ✕-marked reasons Thành won't accept a signup.
16. **5-video proof strip** — plain horizontal scroll.
17. **FAQ** — 4 items, each a rounded bordered box (`<details>/<summary>`, custom +/– marker), open state has a slightly darker fill.
18. **Closing** — headline, outcome-focused paragraph, 4-stat grid (alternating dark/green/white cards), primary CTA, seats/date line.
19. **Sticky bottom bar** — fixed, appears once the hero (`#challenge`) scrolls out of view (IntersectionObserver), frosted cream background, short reminder text + compact green CTA.
20. **Footer** — brand name, policy links, a dashed legal-info placeholder box (business registration fields — **not yet filled in, must be completed before launch**), and a results-disclaimer line.

## Interactions & Behavior
- **Marquees** (top ticker, testimonial cards): pure CSS `@keyframes`, `translateX(0→-50%)`, content duplicated 2× in the DOM for a seamless loop. Testimonial track pauses on `:hover`.
- **CTA buttons** (`class="fc2-cta"`): a skewed white gradient sweeps left→right every 2.6s (`@keyframes fc2-glow`). All `<a href="#dang-ky">` also get `translateY(-3px)` + shadow on hover, `scale(.97)` on active.
- **Glow/pulse cards** (`class="fc2-pricebox"` + `fc2-priceglow` on the price row): same sweep animation as CTA, plus a pulsing outer box-shadow ring (`@keyframes fc2-pulse`, 2.2s).
- **Play buttons**: two nested circles — outer `rgba(255,255,255,.3)` + `backdrop-filter: blur`, inner green gradient (`#3d9962→#2f7a4d`) circle with a white triangle, centered via `position:absolute;inset:0`.
- **Sticky bottom bar**: `position:fixed;bottom:-100px`, transitions to `bottom:0` when an `IntersectionObserver` reports `#challenge` is no longer intersecting the viewport.
- **FAQ**: native `<details>/<summary>`; first item defaults open. `summary::after` shows `+`/`–` via `details[open]`.
- All hover/press effects are CSS-only (no JS) except the sticky-bar visibility toggle.

## State Management
No app state — this is a static marketing page. The only "state" is native `<details open>` per FAQ item. A real implementation needs: a registration/checkout flow behind the CTA (currently all CTAs are `#dang-ky` anchors scrolling to the pricing block — **no real payment page exists yet**, brief calls for QR bank-transfer payment).

## Design Tokens

**Colors**
- Background (page): `#f3ead9` (warm cream)
- Primary/accent green: `#2f7a4d` (buttons, eyebrow labels, numbered badges)
- Secondary/light green: `#a8d98d` (privilege/reward cards, marquee text, chart tint)
- Dark card: `#1a1a1a`
- Destructive/objection red: `#d33`
- Body text: `#333` / `#55555c` (secondary) / `#77777d` (tertiary) / `#9a9aa0` (struck-through)
- Highlight span (`.fc2-hl`, unused sparingly): `rgba(139,195,74,.35)` bg + `#2f7a4d` underline

**Typography**
- Headings (h1/h2/h3): **Oswald**, weight 600, uppercase, letter-spacing 0
- Body: **Inter**, weights 400/500/600/700/800
- Both loaded via Google Fonts `@import`

**Radius**
- Cards: 20–36px (large, soft)
- Buttons: 12–16px
- Small badges/circles: full (9999px)

**Shadows**
- `.fc2-shadow`: 6-layer soft elevation shadow (see CSS `box-shadow` stack in the file) — used on most cards/thumbnails.

**Spacing**
- Section padding: `0 24px 64px` (mobile-safe gutters), max-width containers at 700/760/800/900/1400px depending on section.

## Assets
- `media/thanh-1.jpg` … `thanh-7.jpg` — real photos of Thành, used as hero video thumbnail + 6 "Học viên nói gì" video-wall placeholders (stand-in stills; real short-form video files should replace these).
- `media/fb-hanhchi.png`, `fb-nhung.jpg`, `fb-trang.jpg`, `fb-2.jpg`, `fb-chichi.jpg` — real screenshots of student feedback (Facebook posts / chat), used raw (no card framing) in the "Feedback từ học viên" grid.
- Emoji used as lightweight icons throughout (👉, 🎖️, ⚠️) — no icon font/SVG library.
- Several `<image-slot>` placeholders remain empty (marked 🟡 in their placeholder text) for: more student video clips, more screenshot proof, and a scholarship/award badge graphic — drop real assets into these before launch.

## Known gaps to close before launch
- **No real checkout/payment page** — all CTAs currently just scroll to the pricing section.
- Footer legal block (business name, tax ID, address, hotline, email, Ministry of Trade notice) is a placeholder — required by Vietnamese e-commerce ad regulations before running paid traffic.
- A few `[[X]]` / `[[ngày]]` / `[[tên]]` bracketed placeholders remain in copy (seat counts, start date, scholarship name) — must be filled with real values.
- Late-submission make-up policy (section "Sợ bận đột xuất") is marked `[[cần chốt]]` — not yet decided.

## Files
- `AIAgentChallengeForma.dc.html` — the full page (all sections, inline styles, embedded `<style>`/`<script>` in the head).
- `media/` — the real photo/screenshot assets referenced above.
- `image-slot.js`, `support.js` — runtime helper scripts from the prototyping tool; **not needed** in the target codebase (the `<image-slot>` tags they power should become plain `<img>`/`<video>` elements in the real implementation).
