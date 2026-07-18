# GUAPD — Developer Spec

Exact, implementation-ready values for a Next.js + Tailwind CSS build. Every number is pulled from the design-system tokens and shipping components. Where the system left a value undefined, this doc picks one and flags it inline.

**Interface color ratio:** 72% white/frost · 20% translucent pastel · 8% neon. Neon `#E8FF66` is reserved for the single primary action, the mascot, and earned celebration only — never body text, never a large fill.

**Contents**
1. Tailwind theme extension
2. Component specs (all states)
3. Layout conventions
4. Screen: the Deals List

---

## 1 · Tailwind theme extension

Drop this into `tailwind.config.js` under `theme.extend`. Values are the literal token values so you can also ship them as CSS variables (`var(--token)`) if you prefer. Tailwind's default 4px spacing scale already matches the 8pt base, so only additive tokens are shown.

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ---- Brand / primary (neon). Reserved: 1 CTA, mascot, celebration ----
        brand:        { DEFAULT: '#E8FF66', hover: '#EEFF7A', active: '#DDF95A', deep: '#D2F04A' },
        // brand has NO fill-change on hover in the DS (it lifts + glows).
        // `hover`/`active` shades are provided for cases where you DO tint.

        // ---- Secondary = frosted glass (translucent, not a solid) ----
        frost:        { DEFAULT: 'rgba(255,255,255,0.55)', strong: 'rgba(255,255,255,0.72)',
                        soft: 'rgba(255,255,255,0.50)', edge: 'rgba(255,255,255,0.85)' },

        // ---- Backgrounds / page wash ----
        page:         { DEFAULT: '#FAFBFD', 2: '#F4F7FC', 3: '#F7F4FC' },

        // ---- Surface / card (glass fills are gradients, see boxShadow/util) ----
        surface:      { DEFAULT: 'rgba(255,255,255,0.55)', strong: 'rgba(255,255,255,0.72)' },

        // ---- Text ----
        ink:          { DEFAULT: '#181C24', soft: '#4A4F58', faint: '#8B90A0' },

        // ---- Borders ----
        border:       { DEFAULT: 'rgba(255,255,255,0.85)',      // bright specular edge
                        hairline: 'rgba(120,130,150,0.22)' },   // divider on light

        // ---- Semantic (used only in tags/dots/alerts, never as page fills) ----
        success:      { DEFAULT: '#1F9D6B', text: '#1F8A5B', soft: '#ECFBF5' },
        info:         { DEFAULT: '#5AA9E6', text: '#2C7CC4', soft: '#F0FAFF' },
        warning:      { DEFAULT: '#D89A2E', text: '#A9761D', soft: '#FFFEF3' },
        danger:       { DEFAULT: '#D2545A', text: '#9B3030', soft: '#FFEBEB' },

        // ---- Atmospheric pastels (one owns each scene; never 3+ per viewport) ----
        sky: '#EEF6FD', 'sky-mist': '#F0FAFF', lavender: '#F4F0FF', orchid: '#FAEEFF',
        mint: '#ECFBF5', butter: '#FFFEF3', peach: '#FFF3EC', coral: '#FFEBEB', blush: '#FFF7FA',
      },

      fontFamily: {
        // next/font/google: load Sora {300,400,500,600,700,800} + Inter {400,500,600,700}
        display: ['var(--font-sora)', 'system-ui', 'sans-serif'],   // headlines, hero, brand
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],  // body + UI + labels + numbers
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'], // deprecated alias (labels now use Inter)
      },

      fontSize: {
        // [size, { lineHeight, letterSpacing, fontWeight }]  — max 4 sizes per screen
        display: ['96px', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '800' }], // Sora
        h1:      ['72px', { lineHeight: '1.1',  letterSpacing: '-0.03em', fontWeight: '700' }], // Sora
        h2:      ['56px', { lineHeight: '1.2',  letterSpacing: '-0.02em', fontWeight: '700' }], // Sora
        h3:      ['40px', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '600' }], // Sora
        h4:      ['32px', { lineHeight: '1.3',  letterSpacing: '-0.02em', fontWeight: '600' }], // Sora
        h5:      ['21px', { lineHeight: '1.3',  fontWeight: '600' }],                            // Sora
        lg:      ['18px', { lineHeight: '1.55', fontWeight: '400' }],                            // Inter lede
        body:    ['16px', { lineHeight: '1.6',  fontWeight: '400' }],                            // Inter (min)
        small:   ['14px', { lineHeight: '1.55', fontWeight: '400' }],                            // Inter
        caption: ['12px', { lineHeight: '1.4',  fontWeight: '500' }],                            // Inter
        eyebrow: ['11px', { lineHeight: '1.4',  letterSpacing: '0.22em', fontWeight: '600' }],   // Sora UPPER
      },

      // 8pt base. Tailwind's default scale (1=4px … 24=96px) already covers it;
      // these are the named steps the DS references.
      spacing: {
        1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px',
        8: '32px', 12: '48px', 16: '64px', 24: '96px',
      },

      borderRadius: {
        sm: '8px',     // ghost buttons, checkboxes, inline chips
        md: '16px',    // inputs*, soft cards, toasts, banners  (*inputs use pill by default, see note)
        lg: '24px',    // DEFAULT card / panel radius
        xl: '32px',    // modals, large panels
        '2xl': '48px', // hero / feature containers
        pill: '9999px',// buttons, inputs, tags, badges, toggles
        DEFAULT: '24px',
      },

      boxShadow: {
        soft:  '0 24px 60px -28px rgba(40,52,70,0.28)',
        glass: '0 8px 32px -12px rgba(60,70,100,0.22), inset 0 1px 1px rgba(255,255,255,0.6)',
        neon:  '0 12px 28px -8px rgba(180,210,20,0.6), inset 0 1px 2px rgba(255,255,255,0.5)',
        lift:  '0 30px 60px -24px rgba(90,120,180,0.28)',
        none:  'none',
      },

      backdropBlur: { glass: '22px', 'glass-soft': '16px', nav: '20px' },

      transitionTimingFunction: {
        out:   'cubic-bezier(.22,1,.36,1)',      // hover / general
        spring:'cubic-bezier(.34,1.56,.64,1)',   // press / click
        back:  'cubic-bezier(.68,-0.4,.32,1.4)', // modal in/out
      },
      transitionDuration: {
        hover: '200ms', click: '150ms', modal: '350ms', page: '500ms',
      },
    },
  },
  plugins: [],
};
```

**Font loading (Next.js)** — use `next/font/google` so weights are self-hosted:

```ts
// app/fonts.ts
import { Sora, Inter } from 'next/font/google';
export const sora  = Sora({  subsets: ['latin'], weight: ['300','400','500','600','700','800'], variable: '--font-sora' });
export const inter = Inter({ subsets: ['latin'], weight: ['400','500','600','700'],             variable: '--font-inter' });
// <html className={`${sora.variable} ${inter.variable}`}>  →  font-sans on <body>
```

Or plain link: `https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap`

### The one custom utility: frosted glass

Glass surfaces are a gradient fill + backdrop-blur + specular edge — not expressible in a single Tailwind color. Ship as a component class or `@layer` utility. Use it ONLY for the foreground spotlight (nav, key card, modal); never blur immersive scroll backgrounds.

```css
/* globals.css */
@layer components {
  .glass {
    background: linear-gradient(135deg, rgba(255,255,255,.62), rgba(255,255,255,.36));
    backdrop-filter: blur(22px) saturate(140%);
    -webkit-backdrop-filter: blur(22px) saturate(140%);
    border: 1px solid rgba(255,255,255,.85);
    border-radius: 24px;
    box-shadow: 0 8px 32px -12px rgba(60,70,100,.22),
                inset 0 1px 1px rgba(255,255,255,.6),
                0 24px 60px -28px rgba(40,52,70,.28);
  }
  .glass-soft {  /* secondary, non-spotlight cards: no shadow, tighter radius */
    background: linear-gradient(135deg, rgba(255,255,255,.5), rgba(255,255,255,.3));
    backdrop-filter: blur(16px) saturate(130%);
    -webkit-backdrop-filter: blur(16px) saturate(130%);
    border: 1px solid rgba(255,255,255,.85);
    border-radius: 16px;
  }
}
```

---

## 2 · Component specs — every state

Tailwind classes assume the theme extension above. Where a class can't express a value (glass, focus ring), the raw CSS is given. Hover = 200ms ease-out; press = 150ms spring.

### Button

Shared base — all variants/sizes: `inline-flex items-center justify-center gap-2 font-sans font-bold rounded-pill min-h-[44px] leading-none transition-all duration-hover`.
Sizes: **sm** `px-4 py-[9px] text-[13px]` · **md** `px-6 py-[13px] text-[14px]` · **lg** `px-[30px] py-4 text-[16px]`. One primary (neon) action per view.

| Variant | Default | Hover | Active / pressed | Disabled | Loading |
|---|---|---|---|---|---|
| **Primary** | bg `#E8FF66`, text `#181C24`, `shadow-neon` | `-translate-y-0.5`, glow brightens (no fill change) | `scale-[.97]` (spring settle) | `opacity-50 cursor-not-allowed`, no transform | spinner (ink), label→`opacity-0`, width held, `pointer-events-none` |
| **Secondary (glass)** | `.glass-soft` fill, text `#181C24`, border `#fff`/.85, blur 12px | `-translate-y-0.5`, frost brightens to `rgba(255,255,255,.72)` | `scale-[.97]` | `opacity-50 cursor-not-allowed` | spinner (ink-soft) |
| **Ghost / tertiary** | `bg-transparent`, text `#181C24`, underline `#D2F04A` offset 4, `rounded-sm` | bg `rgba(255,255,255,.5)`, `-translate-y-0.5` | `scale-[.97]` | `opacity-50 cursor-not-allowed` | spinner (ink-soft) |
| **Destructive** | bg `#FFEBEB`, text `#9B3030` | bg `#FCE0E0`, `-translate-y-0.5` | `scale-[.97]` | `opacity-50 cursor-not-allowed` | spinner (`#9B3030`) |

```jsx
// Primary button (md)
<button class="inline-flex items-center justify-center gap-2 font-sans font-bold rounded-pill
  min-h-[44px] px-6 py-[13px] text-[14px] leading-none text-ink bg-brand shadow-neon
  transition-all duration-hover ease-out hover:-translate-y-0.5 active:scale-[.97] active:ease-spring
  disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0">
  Send a brief
</button>

// Focus (keyboard) — all variants:  focus-visible:outline-none focus-visible:ring-4
//   ring style: box-shadow 0 0 0 4px rgba(218,254,12,.28)  →  focus-visible:ring-[rgba(218,254,12,.28)]
```

**Loading pattern:** keep the button at its resting width, set `position:relative`, absolutely-center an 18px spinner (`animate-spin`, 2px border, top-color = text color, rest transparent), and set the label to `opacity-0`. Never collapse width mid-request.

### Input · textarea · select

Frosted pill field. Textarea: same but `rounded-lg` (24px) + `min-h-[112px] py-3`. Select: same shell + chevron icon right, `appearance-none pr-11`.

| State | Spec |
|---|---|
| Base / default | `w-full box-border px-[18px] py-[13px] min-h-[44px] rounded-pill font-sans text-[14px] text-ink`, bg `rgba(255,255,255,.6)`, backdrop-blur 8px, border `1px #fff/.85` |
| Placeholder | text `#8B90A0` → `placeholder:text-ink-faint` |
| Focus | border → `#D2F04A`, ring `0 0 0 4px rgba(218,254,12,.28)`. `outline-none`. |
| Filled | same as base (text becomes `#181C24`); no separate treatment |
| Success | border → `#1F9D6B` |
| Error | border → `#D2545A`; message below: `mt-1.5 text-[13px] text-danger` (`#D2545A`), optional 14px alert-circle icon left |
| Disabled | `opacity-50 cursor-not-allowed`, bg `rgba(245,248,252,.7)`, no blur |

```jsx
<label class="block">
  <span class="block mb-2 text-small font-medium text-ink-soft">Campaign name</span>
  <input
    class="w-full box-border px-[18px] py-[13px] min-h-[44px] rounded-pill font-sans text-[14px]
      text-ink placeholder:text-ink-faint bg-[rgba(255,255,255,.6)] backdrop-blur-[8px]
      border border-border outline-none transition-[border-color,box-shadow] duration-hover
      focus:border-brand-deep focus:shadow-[0_0_0_4px_rgba(218,254,12,.28)]
      aria-[invalid=true]:border-danger disabled:opacity-50 disabled:cursor-not-allowed"
    placeholder="e.g. Summer skincare launch" />
  <p class="mt-1.5 text-[13px] text-danger">Enter a campaign name.</p>  {/* error only */}
</label>
```

**Label:** `text-small (14px) font-medium text-ink-soft`, 8px above the field. Inputs use **pill** radius by default; switch to `rounded-md` for multi-line / grouped form blocks if pill feels too round.

### Card · panel

A card is a frosted shell, fully rounded, 1px bright edge, soft ambient shadow. One card → one clear next step. Use the `.glass` utility. Secondary cards use `.glass-soft` (16px radius, no shadow). Optional pastel tint = an absolutely-positioned `inset-0` layer at ~10–14% of one pastel behind content.

| Property | Value |
|---|---|
| Background | `linear-gradient(135deg, rgba(255,255,255,.62), rgba(255,255,255,.36))` + backdrop-blur 22px saturate 140% |
| Border | `1px solid rgba(255,255,255,.85)` |
| Radius | `rounded-lg` (24px) · soft variant 16px |
| Padding | `p-6` (24px) card · `p-10` (40px) panel |
| Shadow | `shadow-glass, shadow-soft` (combined) · hover lift `-translate-y-0.5` |

### Badge · status pill

Pill shape, tinted background + darker matching text + 1px translucent border of the same hue. Base: `inline-flex items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-[11px] font-semibold font-sans tracking-[.01em]`, optional 8px leading status dot.

| Status | Text | Background | Border | Origin |
|---|---|---|---|---|
| Draft | #4A4F58 | rgba(120,130,150,.10) | rgba(120,130,150,.22) | added |
| Ready | #2C7CC4 | #F0FAFF | rgba(90,169,230,.28) | added |
| Sent | #2C7CC4 | #F0FAFF | rgba(90,169,230,.28) | added · +dot #5AA9E6 |
| Negotiating | #A9761D | #FFFEF3 | rgba(216,154,46,.30) | added |
| Agreed | #2F6FBF | rgba(46,111,191,.10) | rgba(46,111,191,.26) | shipped |
| Delivered | #3B7C9E | rgba(59,124,158,.10) | rgba(59,124,158,.26) | shipped |
| Revision | #D89A2E | #FFFEF3 | rgba(216,154,46,.30) | shipped |
| Approved | #7A5CC4 | rgba(122,92,196,.12) | rgba(122,92,196,.28) | shipped |
| Complete | #1F8A5B | rgba(31,157,107,.10) | rgba(31,157,107,.24) | shipped |
| Paid | #1F9D6B | #ECFBF5 | rgba(31,157,107,.24) | added · +dot #1F9D6B |
| Declined | #9B3030 (dot #D2545A) | rgba(210,84,90,.09) | rgba(210,84,90,.24) | shipped |
| Cancelled | #8B90A0 | rgba(120,130,150,.10) | rgba(120,130,150,.22) | added |

The DS `Badge` component also has tone shorthands for metrics: **neutral** (frost/ink), **neon** (#E8FF66 bg / ink — match-score only), **success**, **info** (#2C7CC4), **warning** (#A9761D), **danger** (#9B3030), each on its `*-soft` background. Set `mono` for figures.

```ts
// Central status map — single source of truth for the pill component
export const STATUS = {
  draft:       { label: 'Draft',       text: '#4A4F58', bg: 'rgba(120,130,150,.10)', border: 'rgba(120,130,150,.22)' },
  ready:       { label: 'Ready',       text: '#2C7CC4', bg: '#F0FAFF',               border: 'rgba(90,169,230,.28)' },
  sent:        { label: 'Sent',        text: '#2C7CC4', bg: '#F0FAFF',               border: 'rgba(90,169,230,.28)', dot: '#5AA9E6' },
  negotiating: { label: 'Negotiating', text: '#A9761D', bg: '#FFFEF3',               border: 'rgba(216,154,46,.30)' },
  agreed:      { label: 'Agreed',      text: '#2F6FBF', bg: 'rgba(46,111,191,.10)',  border: 'rgba(46,111,191,.26)' },
  delivered:   { label: 'Delivered',   text: '#3B7C9E', bg: 'rgba(59,124,158,.10)',  border: 'rgba(59,124,158,.26)' },
  revision:    { label: 'Revision',    text: '#D89A2E', bg: '#FFFEF3',               border: 'rgba(216,154,46,.30)' },
  approved:    { label: 'Approved',    text: '#7A5CC4', bg: 'rgba(122,92,196,.12)',  border: 'rgba(122,92,196,.28)' },
  complete:    { label: 'Complete',    text: '#1F8A5B', bg: 'rgba(31,157,107,.10)',  border: 'rgba(31,157,107,.24)' },
  paid:        { label: 'Paid',        text: '#1F9D6B', bg: '#ECFBF5',               border: 'rgba(31,157,107,.24)', dot: '#1F9D6B' },
  declined:    { label: 'Declined',    text: '#9B3030', bg: 'rgba(210,84,90,.09)',   border: 'rgba(210,84,90,.24)', dot: '#D2545A' },
  cancelled:   { label: 'Cancelled',   text: '#8B90A0', bg: 'rgba(120,130,150,.10)', border: 'rgba(120,130,150,.22)' },
};
```

### Table · list

GUAPD prefers **glass list-rows** over dense tables for primary content (see the Deals List). Use a real table for dense/admin views. Both share these rules:

| Element | Spec |
|---|---|
| Header row | `text-[12px] font-semibold text-ink-faint tracking-[.02em] px-4 py-3`, bg `rgba(255,255,255,.6)`, `border-b border-border-hairline`. Sentence case, not ALL-CAPS. |
| Data row | `text-small text-ink px-4 py-3.5 border-b border-border-hairline` |
| Row hover | `hover:bg-[rgba(255,255,255,.55)]`, cursor-pointer if navigable |
| Selected row | bg `rgba(232,255,102,.10)` (neon @ 10%) — tint only, **no** left-border accent |
| Dividers | `rgba(120,130,150,.22)` hairlines only; no vertical rules; no heavy borders |
| Checkbox | 18px, `rounded-sm` (6px), border `1px #fff/.85` on `rgba(255,255,255,.6)`. Checked: bg `#E8FF66`, ink check glyph, no border. Focus: 4px neon ring. |

**List-row variant:** each row is a `.glass-soft` card, `rounded-lg px-5 py-4`, stacked with `gap-2.5` (10px), hover `-translate-y-0.5` + `shadow-soft`. This is the default for the Deals List.

### Navigation · tabs

Top bar is a sticky glass plate: `.glass` with `rounded-none border-x-0 border-t-0`, or a floating `rounded-pill` pill nav. Blur 20px. Nav items and filter tabs share the pill treatment:

| State | Spec |
|---|---|
| Inactive | `px-3.5 py-2 rounded-pill text-small font-medium text-ink-soft bg-transparent` |
| Hover | `hover:bg-[rgba(255,255,255,.55)] hover:text-ink` |
| Active | bg `rgba(255,255,255,.72)`, `text-ink font-semibold`, `shadow-glass`. Count chip inside: `ml-1.5 text-[11px] text-ink-faint`. |

### Modal · dialog

Not shipped as a component — spec derived from the material rules. Motion 350ms `ease-back` (scale 0.96→1 + fade). Trap focus; `Esc` closes; reduced-motion → fade only.

```jsx
// Overlay
<div class="fixed inset-0 z-50 grid place-items-center p-4
  bg-[rgba(24,28,36,.4)] backdrop-blur-[3px]">
  {/* Container */}
  <div role="dialog" aria-modal="true"
    class="w-full max-w-[560px] p-10 rounded-xl glass shadow-lift
      animate-[modalIn_.35s_cubic-bezier(.68,-0.4,.32,1.4)]">
    {/* Header */}
    <div class="flex items-start justify-between gap-4 mb-4">
      <h2 class="font-display font-semibold text-h4 tracking-[-0.02em]">Send a brief</h2>
      <button aria-label="Close" class="text-ink-faint hover:text-ink">✕</button>
    </div>
    {/* Body */}
    <div class="text-body text-ink-soft"> … </div>
    {/* Footer / actions */}
    <div class="mt-8 flex justify-end gap-3">
      <button class="/* ghost */">Cancel</button>
      <button class="/* primary */">Send brief</button>
    </div>
  </div>
</div>
```

### Empty state

A calm glass panel centered in the content area. Mascot (or single line icon) → heading → one line of subtext → one primary CTA. Never a wall of illustration. Generous padding.

```jsx
<div class="glass rounded-lg px-8 py-16 flex flex-col items-center text-center gap-4">
  <img src="/assets/guap-mascot.svg" alt="" class="w-16 h-16" />         {/* 64px */}
  <h3 class="font-display font-semibold text-h4 tracking-[-0.02em]">No deals yet</h3>
  <p class="text-body text-ink-soft max-w-[42ch]">When a brand agrees to work with you, it shows up here.</p>
  <button class="/* primary md */ mt-2">Discover campaigns</button>
</div>
```

### Loading state

Prefer **skeletons** for lists/cards; use the spinner only inside buttons or for full-page route transitions. Never animate `blur`.

```css
/* Skeleton block */
.skeleton {
  border-radius: 16px;
  background: linear-gradient(100deg,
    rgba(235,240,248,.7) 30%, rgba(255,255,255,.9) 50%, rgba(235,240,248,.7) 70%);
  background-size: 200% 100%;
  animation: shimmer 1.2s ease-in-out infinite;   /* 800–1200ms ambient range */
}
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

/* Deal-row skeleton: one .skeleton bar h-[64px] per row, gap-2.5, 6–8 rows */
/* Spinner: 18px circle, 2px border, border-top = brand-deep #D2F04A, animate-spin */
```

### Error · warning banner

Inline glass plate with a single status dot — calm, never a loud red fill. Same shell as the DS `Toast`.

Dot colors: error `#D2545A` · warning `#D89A2E` · info `#5AA9E6` · success `#1F9D6B`.
Container: `flex items-center gap-3 px-[18px] py-3.5 rounded-md border border-border glass-soft shadow-glass`.
For a page-level destructive banner, tint the plate `bg-danger-soft` (#FFEBEB) and use `text-danger-text` (#9B3030).

### Avatar

Circle (`rounded-pill`), 1px specular edge `#fff/.85`. Fallback = initials in Inter 600 `#181C24` on a soft pastel tint (rotate through sky / lavender / mint / peach by name hash). Sizes: **sm** 32 · **md** 40 · **lg** 48 · **xl** 64px.

```jsx
<span class="grid place-items-center rounded-pill border border-border w-10 h-10 bg-lavender text-ink font-sans font-semibold text-[14px]">SN</span>
```

---

## 3 · Layout conventions

| Property | Value |
|---|---|
| Max content width | `1180px` standard · `1280px` wide. Center with `mx-auto`. |
| Page margin (desktop) | `px-20` (80px) outer gutter |
| Grid | 12 columns, `gap-6` (24px gutter) |
| Section spacing | `py-12` to `py-16` (48–64px) between major blocks |
| Card / panel padding | `p-6` (24) card · `p-10` (40) panel |
| Min tap target | `44px` — every interactive element |

### Breakpoints & mobile behavior

Tailwind defaults: `sm 640 · md 768 · lg 1024 · xl 1280`. Design desktop-first at 1180; the primary breakpoint is `lg` (below it → single column).

- Outer gutter `px-20` → `px-5` (20px) below `md`.
- Multi-column card grids collapse to one column at `md`: `grid-cols-2 lg:grid-cols-3 md:grid-cols-1`.
- Top nav collapses to a hamburger sheet (or a bottom tab bar for the app shell) below `md`; primary CTA persists in the bar.
- Tables → stacked list-row cards below `md` (label:value pairs inside each `.glass-soft` row).
- Two-column hero / detail layouts stack; media (portrait, media kit) goes on top.
- Filter tab strips become horizontally scrollable (`overflow-x-auto`, no wrap).
- Type steps down one rung on mobile: h1 72→40, h2 56→32, h3 40→28.

---

## 4 · Screen — the Deals List

The creator's pipeline: every active and past deal, filterable by status. Composed entirely from the system above.

### Layout structure (top → bottom)

1. **Sticky top nav** — `.glass` bar, blur 20px, wordmark left, nav pills center (Dashboard · Deals[active] · Inbox · Payments), avatar right.
2. **Page header row** — `h3` "Deals" left; a summary right (`$4.2K in flight · 22 deals`, Inter, `text-ink-faint`).
3. **Toolbar** — search input (grows) + sort `select` + optional secondary "Export" glass button, in a `flex gap-3` row.
4. **Filter tab strip** — pill tabs with counts: All · Agreed · Delivered · Revision · Approved · Complete · Declined. Horizontally scrollable on mobile.
5. **Deal list** — stacked `.glass-soft` rows, `gap-2.5`. Each row: brand avatar, title + status pill, meta line (deliverable · date), value (right, Inter 600), chevron. Hover lifts `-translate-y-0.5`.
6. **Footer** — result count / pagination or "that's everything" line in `text-ink-faint`.

### Components used

Top nav (glass) · Nav/filter tabs · Input (search) · Select (sort) · Button (secondary glass "Export", primary "Find campaigns") · list-row Card (`.glass-soft`) · Avatar · status Badge · Empty state · Skeleton · Error banner.

### States

- **Populated** — Filter strip shows counts per status; list renders sorted rows (default sort: pipeline stage, then newest). Value column right-aligned mono. Row → deal detail on click.
- **Empty (no deals yet)** — Toolbar + tabs hidden (or tabs show 0). Centered glass empty panel: mascot 64px, "No deals yet", subtext "When a brand agrees to work with you, it shows up here.", primary CTA "Discover campaigns".
- **Loading** — Nav + header render immediately; toolbar controls disabled; 6–8 `.skeleton` row bars (h-[64px], gap-2.5) replace the list. No spinner overlay.
- **Filtered / searched** — Active tab uses the active pill treatment; header summary updates to the filtered total ("$1.1K · 4 deals"). Search filters by brand/title live. Zero matches → inline no-result row: "No deals match 'xyz'." + ghost "Clear filters" — distinct from the true empty state.

```jsx
// DealsList.tsx — structure (Tailwind, theme above)
<main class="min-h-screen">
  <nav class="sticky top-0 z-40 glass rounded-none border-x-0 border-t-0
    px-20 md:px-5 h-16 flex items-center justify-between"> … </nav>

  <div class="mx-auto max-w-[1180px] px-20 md:px-5 py-12">
    {/* header */}
    <div class="flex items-end justify-between gap-4 mb-6">
      <h1 class="font-display font-semibold text-h3 tracking-[-0.02em]">Deals</h1>
      <span class="font-sans text-small text-ink-faint">$4.2K in flight · 22 deals</span>
    </div>

    {/* toolbar */}
    <div class="flex gap-3 mb-4">
      <input placeholder="Search deals" class="/* input, flex-1 */" />
      <select class="/* select, w-[180px] */"> … </select>
      <button class="/* secondary glass */">Export</button>
    </div>

    {/* filter tabs */}
    <div class="flex gap-2 overflow-x-auto pb-1 mb-5">
      <button class="/* active pill */">All <span class="ml-1.5 text-[11px] text-ink-faint">22</span></button>
      <button class="/* inactive pill */">Agreed <span …>3</span></button> …
    </div>

    {/* list */}
    <ul class="flex flex-col gap-2.5">
      <li class="glass-soft rounded-lg px-5 py-4 flex items-center gap-4
        transition-transform duration-hover hover:-translate-y-0.5 hover:shadow-soft cursor-pointer">
        <Avatar name="Bloom Studio" size="md" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2.5">
            <span class="font-sans font-semibold text-[14.5px] text-ink truncate">Spring haul</span>
            <StatusPill status="agreed" />
          </div>
          <p class="text-caption text-ink-faint truncate mt-1">1 grid post + 1 Story · 2 Jul</p>
        </div>
        <span class="font-sans font-semibold text-ink tabular-nums">$72</span>
        <ChevronRight class="text-ink-faint" />
      </li>
    </ul>
  </div>
</main>
```

### Mobile (< md)

- Gutter → `px-5`; nav collapses to wordmark + hamburger (or bottom tab bar), CTA persists.
- Header summary drops below the title (stacks); type steps down (h3 40→28).
- Toolbar wraps: search full width row 1; sort + export share row 2.
- Filter tabs scroll horizontally, no wrap.
- Rows keep avatar + title + status + value; meta line truncates; chevron hidden, whole row tappable (min-h 64px ≥ 44 target).

---

*Every value here traces to the GUAPD design-system tokens and shipping components. Statuses marked "added" and the modal/loading/skeleton specs are conventions defined in this doc to fill gaps the system left open — flagged inline so you can adjust before build.*
