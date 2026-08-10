# Guapd Marketing Website — Design System Reference

**Site:** staging.guapd.com
**Pages:** Home (`/`), Brands (`/brands`), Creators (`/creators`)
**Design language:** "Liquid Glass" — translucent white glass panels on animated pastel mesh gradient backgrounds

---

## 1. Global Design Tokens

### Color Primitives

| Token | Value | Description |
|---|---|---|
| `--_white` | `#FFFFFF` | Pure white |
| `--_ice-50` | `#F8FAFC` | Near-white cool gray |
| `--_ice-100` | `#F1F5F9` | Light ice blue-gray |
| `--_ice-200` | `#E2E8F0` | Medium ice blue-gray (borders) |
| `--_ice-300` | `#CBD5E1` | Cool gray |
| `--_sky` | `#E3F2FD` | Atmospheric sky blue |
| `--_lavender` | `#F3E5F5` | Atmospheric lavender |
| `--_blush` | `#FCE4EC` | Atmospheric blush pink |
| `--_citron` | `#FFFDE7` | Atmospheric citron yellow |
| `--_neon-green` | `#DAFE0C` | Neon accent green (primary CTA color) |
| `--_neon-green-dim` | `#C8E60B` | Darker neon green (hover state) |
| `--_neon-green-glow` | `rgba(218, 254, 12, 0.25)` | Neon green glow for button shadows |
| `--_charcoal-900` | `#181C24` | Darkest charcoal (headings, dark sections) |
| `--_charcoal-700` | `#334155` | Medium-dark charcoal (body text) |
| `--_charcoal-500` | `#64748B` | Medium charcoal (muted text) |
| `--_charcoal-400` | `#94A3B8` | Light charcoal (subtle text) |

### Semantic Tokens

| Token | Maps To | Usage |
|---|---|---|
| `--accent` | `#DAFE0C` | CTA buttons, highlights, stat numbers |
| `--accent-hover` | `#C8E60B` | Button hover backgrounds |
| `--accent-text` | `#181C24` | Dark text ON neon-green buttons |
| `--section-bg` | `#FFFFFF` | White section backgrounds |
| `--section-bg-alt` | `#F8FAFC` | Alternating section backgrounds |
| `--section-bg-dark` | `#181C24` | Dark section backgrounds (CTAs, footer) |
| `--color-heading` | `#181C24` | All heading text |
| `--color-body` | `#334155` | All body text |
| `--color-muted` | `#64748B` | Muted/secondary text |
| `--color-subtle` | `#94A3B8` | Subtle/tertiary text |
| `--color-on-dark` | `#FFFFFF` | White text on dark backgrounds |
| `--color-border` | `#E2E8F0` | Standard border color |

### Liquid Glass Tokens

| Token | Value | Usage |
|---|---|---|
| `--glass-bg` | `rgba(255, 255, 255, 0.55)` | Glass panel backgrounds |
| `--glass-bg-hover` | `rgba(255, 255, 255, 0.72)` | Glass panel hover backgrounds |
| `--glass-border` | `rgba(255, 255, 255, 0.6)` | Glass panel borders |
| `--glass-blur` | `blur(25px)` | Glass backdrop-filter |
| `--glass-shadow` | `0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)` | Glass shadow with inner top highlight |
| `--glass-shadow-sm` | `0 4px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)` | Smaller glass shadow |

### Border Radius Scale

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `8px` | Nav links, small elements |
| `--radius-md` | `16px` | Cards, chat bubbles |
| `--radius-lg` | `24px` | Feature cards, deal cards |
| `--radius-xl` | `32px` | Hero cards, large panels |
| `--radius-pill` | `9999px` | Buttons, badges, pills |

### Transition Tokens

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--duration-fast` | `150ms` |
| `--duration-normal` | `200ms` |
| `--duration-slow` | `350ms` |

---

## 2. Typography

### Font Families

| Role | Token | Font |
|---|---|---|
| Headings | `--font-heading` | **Sora** (Google Fonts), system-ui fallback |
| Body | `--font-body` | **Inter** (Google Fonts), system-ui fallback |

### Type Scale

| Element | Font | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|---|
| Home hero headline | Sora | `clamp(2.75rem, 5.5vw, 4.25rem)` | 700 | -0.025em | 1.05 |
| Brand AI hero headline | Sora | `clamp(2.75rem, 6.5vw, 4.5rem)` | 700 | -0.03em | 1.05 |
| Section headlines | Sora | `clamp(1.5rem, 3-4vw, 2-2.75rem)` | 700 | -0.01 to -0.02em | 1.1-1.2 |
| ContainerScroll title | Sora | `clamp(2rem, 4.5vw, 3.5rem)` | 700 | -0.02em | 1.1 |
| Feature row headline | Sora | `clamp(1.5rem, 3vw, 2.125rem)` | 700 | -0.01em | 1.2 |
| Body text | Inter | `1.0625rem` | 400 | default | 1.7 |
| Hero subheadline | Inter | `clamp(1rem, 1.8vw, 1.125rem)` | 400 | default | 1.7 |
| Microcopy | Inter | `0.8125rem` | 400 | default | default |
| Eyebrow labels | Inter | `0.75rem` | 700 | 0.1em | default |
| Badge pills | Inter | `0.75rem` | 700 | 0.06em | default |
| Stats values | Sora | `clamp(2rem, 4vw, 3rem)` | 700 | -0.02em | 1.1 |
| Stats labels | Inter | `0.9375rem` | 500 | default | default |
| Button text | Inter | `0.9375rem` / `0.8125rem` (sm) | 600 | 0.01em | 1 |

### Special Typographic Treatments

- **Eyebrow text** ("THE PROBLEM", "HOW IT WORKS"): ALL-CAPS, 0.75rem, weight 700, letter-spacing 0.1em, neon-green color
- **Badge pills** ("Brand x Creator" in hero): ALL-CAPS, 0.75rem, weight 700, letter-spacing 0.06em, neon-green text on ice-100 background, pill-shaped
- **Testimonial quote marks**: Georgia serif, 3rem, brand-tint-strong color, decorative oversized opening quote
- **Testimonial quotes**: Inter, italic, 0.9375rem

---

## 3. Components

### 3.1 MeshGradientBackground — Full-page animated gradient canvas

**Visual:** A full-viewport, fixed-position, slowly morphing mesh gradient. Soft pastel blobs of color gently shift and swirl. Subtly tracks the user's mouse cursor.

**Technical:**
- Uses `@paper-design/shaders-react` `MeshGradient` (WebGL shader)
- Fixed position, z-index 0, pointer-events none
- Home + Creator palette: soft teal `#b8dde8`, lavender `#c8b8e8`, rose `#f0c0d0`, peach `#ffd4b0`, mint `#b8e8cc`, lime `#d4f0b0`
- Brands page palette: pale lavender `#c0b8e8`, pink `#e8b8d0`, warm rose `#f0a8c0`, peach-orange `#ffc090`, amber `#f0a060`, lilac `#d0b8e8`
- Settings: distortion 1.0, swirl 0.55, speed 0.5
- Mouse lerp at 0.05 factor per frame via requestAnimationFrame
- White veil overlay: `rgba(255, 255, 255, 0.30)` over gradient for readability

### 3.2 Crystal Logo — Animated gemstone SVG + wordmark

**Visual:** A faceted gemstone/diamond SVG in purple-to-peach gradient fills. Six tiny star sparkles twinkle around it. A white "sweep shine" line moves across. "Guapd" wordmark in Sora bold beside it.

**Animations:**
- **Crystal entrance** (once per session): scales to 1.9x, rotates 720deg (two Y-axis rotations), purple glow intensifies then settles. 1.4s, `cubic-bezier(0.22, 1, 0.36, 1)`
- **Crystal shimmer** (continuous): brightness pulses 1.0-1.06, drop-shadow oscillates. 4s, ease-in-out, infinite
- **Star sparkle twinkle** (continuous): 6 sparkles fade 0.15-1 opacity, scale 0.5-1.4x. 2.5s each, staggered delays
- **Sweep shine** (continuous): SVG animateTransform moves white band across gem. 3.5s, linear, infinite

### 3.3 Nav — Frosted glass navigation bar

**Visual:** Fixed top bar, 64px height, heavy frosted glass effect. Logo left, nav links center, login dropdown + CTA button right.

**Glass effect:** `background: rgba(253, 250, 246, 0.78)`, `backdrop-filter: blur(20px)`, bottom border `rgba(255,255,255,0.70)`, shadow `0 1px 0 rgba(221,211,190,0.40)`

**Elements:**
- **Nav links** ("For brands", "For creators", "How it works"): 0.9375rem, weight 500. Hover: heading color + ice tint bg
- **Login dropdown**: Text button with caret. Dropdown: white, 8px radius, `0 4px 12px rgba(0,0,0,0.08)` shadow
- **CTA button** ("Get access"): Neon-green primary button. On home page shows audience dropdown
- **Mobile hamburger** (below 768px): 3 bars animate to X on open. Bar 1: translates down 7px + rotates 45deg, bar 2: fades out, bar 3: translates up 7px + rotates -45deg. 0.22s
- **Mobile drawer**: Full-screen panel slides from right. 0.25s ease

### 3.4 ExperimentHero — Split hero with Spline 3D scene (Home page)

**Visual:** Full-viewport height. Left: badge, headline, subtitle, two CTA buttons, microcopy. Right: interactive 3D Spline glass robot. Three floating "name chips" at edges.

**Elements:**
- **Background glow**: Layered radial gradients — lavender at 72% right, blue at 25% left, green-citron at bottom center. Very low opacity (0.12-0.22)
- **Hero badge pill**: "Brand x Creator" — neon-green text on ice-100 bg, pill-shaped
- **Headline**: Sora, clamp 2.75-4.25rem, weight 700, -0.025em letter-spacing
- **CTA pair**: Primary neon-green + ghost glass button side by side
- **Spline 3D scene**: Lazy-loaded, 3 pulsing dots while loading. Occupies right half, scaled 0.9x
- **Floating name chips** ("Rohan - Finance - 180K"): Glass pill capsules with avatar initial, positioned absolutely. Hidden below 1000px

### 3.5 Hero — Standard split hero (Creator page)

**Visual:** Two-column: left has badge, headline, subtitle, CTA, microcopy; right has DealDisplayCards. Three large blurred pastel blobs behind.

**Background blobs:**
- Purple: 550x450px, `var(--_lavender)`, blur 90px, 50% opacity
- Citron: 420x380px, `var(--_citron)`, blur 90px, 45% opacity
- Pink: 320x280px, `var(--_blush)`, blur 90px, 35% opacity

### 3.6 BrandAIHero — AI deal builder hero (Brands page)

**Visual:** Centered layout with glass badge, large headline, subtitle, and prominent AI prompt input bar with suggestion chips below. Min height 72vh.

**Elements:**
- **AI badge**: Glass pill with sparkle star that pulses (scales 1x-1.3x, rotates 0-20deg, opacity 0.5-1). Glass: `rgba(255,255,255,0.58)` bg, blur(12px), white border
- **AI input bar**: Glass input field. `rgba(255,255,255,0.65)` bg, blur(24px), 32px radius, shadow `0 8px 40px rgba(22,16,11,0.10)`. Pulsing sparkle icon, rotating placeholder text (cycles every 3s), dark submit button
- **Input focus**: Border changes to warm amber tint `rgba(146,64,14,0.30)`, subtle 3px amber ring glow
- **Submit button**: Dark charcoal bg, white text, 24px radius. Hover: darker + `0 4px 16px rgba(22,16,11,0.25)` shadow
- **Suggestion chips** ("Try: ..."): Glass pills. `rgba(255,255,255,0.48)` bg, blur(10px). Hover: 78% white opacity

### 3.7 DealDisplayCards — Stacked skewed deal cards (Creator hero visual)

**Visual:** Three deal cards stacked in cascading, skewed arrangement (-6deg skewY). Back cards are grayscale/faded.

**Card stacking:**
- Back card (index 0): grayscale, 65% opacity, white overlay
- Middle card (index 1): grayscale, 75% opacity, lighter overlay, offset 2.5rem right + 2rem down
- Front card (index 2): full color, no overlay, offset 5rem right + 4rem down
- All: glass treatment, -6deg skewY, 24px radius

**Hover:** Card lifts up 1.5rem, grayscale removes, full opacity, overlay fades. 0.5s `cubic-bezier(0.22, 1, 0.36, 1)`

### 3.8 StatsRow — Three-column stat highlights

**Visual:** Full-width band with alternating bg, top+bottom borders. Three stat items: large neon-green number above muted label.

**Stat number:** Sora, `clamp(2rem, 4vw, 3rem)`, weight 700, neon-green color, -0.02em letter-spacing

### 3.9 ContainerScroll — 3D perspective scroll-reveal container

**Visual:** Tall scroll-tracking section (70rem desktop). Contains title and glass card panel. As user scrolls, card rotates from tilted 3D angle to flat and scales to normal — cinematic reveal.

**Scroll animation (Framer Motion):**
- Rotate X: 20deg to 0deg (desktop), 8deg to 0deg (mobile)
- Scale: 1.05 to 1.0 (desktop), 0.92 to 1.0 (mobile)
- Title translateY: 0 to -100px (desktop), 0 to -40px (mobile)
- Perspective: 1000px

**Card glass:** `rgba(255,255,255,0.55)` bg, blur(20px), 2px white border, 1.875rem radius, 3-layer shadow

### 3.10 FeatureZigzag — Alternating text+visual feature rows

**Visual:** Full-width sections alternating layout direction. Odd: text left, visual right. Even (`.feature-row--reverse`): visual left, text right, alternate bg color.

**Elements:**
- **Feature label**: Neon-green uppercase eyebrow (0.75rem, weight 700, 0.1em spacing)
- **Feature headline**: Sora, `clamp(1.5rem, 3vw, 2.125rem)`, weight 700
- **Feature body**: Inter, 1.0625rem
- **Feature visual**: Glass-styled mock cards (offer builder, thread, payment tracker)

### 3.11 FeatureGrid — Three-column icon card grid

**Visual:** Section header (eyebrow + headline) above 3-column grid of glass cards. Each card: emoji icon, bold title, body text.

**Card glass:** `rgba(255,255,255,0.55)` bg, blur(16px), white border, 24px radius. Staggered scroll reveal (50ms per card)

### 3.12 Testimonials — Quote cards in three-column grid

**Visual:** Section header above 3-column grid of glass cards. Each: oversized decorative open-quote mark, italic quote, author info with top border.

**Quote mark:** Georgia serif, 3rem, brand-tint-strong color

### 3.13 MidCTA — Dark band call-to-action

**Visual:** Full-width dark charcoal band with centered white headline and neon-green CTA button. Narrow max-width (680px)

### 3.14 FinalCTA — Large dark closing CTA with neon glow

**Visual:** Full-width dark charcoal section with large centered headline, subtitle, CTA button, microcopy. Subtle neon-green radial glow behind content.

**Neon glow:** 600x400px elliptical radial gradient `rgba(218, 254, 12, 0.08)` to transparent

**Home variant:** Two buttons side by side (neon primary + white outline). Glow 700x400px at 0.10 opacity

### 3.15 Footer — Glass footer with video reel

**Visual:** Glass-styled footer with looping video reel strip at top, brand column (logo + tagline + social links), three link columns, bottom bar with copyright + legal links.

**Video reel strip:** Full-width, 16:7 aspect ratio, 24px radius, autoplay/muted/loop. Gradient overlay `rgba(255,255,255,0.88)` to transparent on bottom half, "Watch this space." text

**Glass:** `rgba(255,255,255,0.55)` bg, blur(20px), white border top

**Social links:** 36x36px squares, 8px radius, `rgba(255,255,255,0.12)` border. Hover: border brightens

### 3.16 MobileBottomCTA — Fixed bottom bar (mobile only)

**Visual:** Fixed bottom bar below 768px. Glass: `rgba(253,250,246,0.88)` bg, blur(20px), top border, upward shadow. Full-width neon-green CTA button.

### 3.17 Feature Mock Cards — Glass UI mockups in feature sections

Glass-panel mockups used as visuals in feature zigzag sections:

- **Offer Builder Mock** (Brands): Glass card with form fields — creator name, deliverable, amount (highlighted), timeline, revisions, usage rights, payment terms, "Send offer" button
- **Negotiation Thread Mock** (Brands): Glass card with chat bubbles alternating left (brand, gray bg) and right (creator, dark bg, white text). Green "Terms agreed" bar at bottom
- **Payment Tracker Mock** (Brands + Creators): Vertical stepper with connected lines. Done steps: neon-green filled circles. Active: neon-green border with tint bg. Inactive: gray border on white
- **Deal Inbox Mock** (Creators): List of deal rows with brand name, status, amount. Active deal: brand-tint bg, neon-green amount
- **Deliverable Upload Mock** (Creators): Glass card with dashed-border upload zone, revision progress bar (neon-green fill on gray track)

### 3.18 DealCardMock — Deal overview card (Brands hero)

**Visual:** 340px glass card with "Deal" eyebrow + "Agreed" status pill (pulsing green dot), party names, niche, divider, term rows with emoji icons, large amount, horizontal step-dot pipeline tracker.

**Pipeline tracker:** Row of dots connected by lines. Done: neon-green filled. Active: neon-green border. Remaining: gray bordered. Lines: 2px, neon-green when done, gray when pending

---

## 4. Animations & Motion

### CSS Keyframe Animations

| Name | What it does | Duration | Easing |
|---|---|---|---|
| `crystal-entrance` | Logo gem scales to 1.9x, rotates 720deg, purple glow intensifies then settles | 1.4s | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `crystal-shimmer` | Logo gem brightness pulses 1.0-1.06, drop-shadow oscillates | 4s | ease-in-out, infinite |
| `sparkle-twinkle` | Logo star sparkles fade 0.15-1 opacity, scale 0.5-1.4x | 2.5s | ease-in-out, infinite (6 staggered) |
| `float-chip` | Hero name chips bob up/down 9px | 5s | ease-in-out, infinite |
| `spline-dot-pulse` | Spline loading dots pulse opacity 0.25-1, scale 0.8-1.0 | 1.2s | ease-in-out, infinite (staggered 0.2s) |
| `ai-star-pulse` | AI badge sparkle scales 1.0-1.3x, rotates 0-20deg, opacity 0.5-1 | 3s | ease-in-out, infinite |
| `fadeUp` | Element fades in from 16px below (`.reveal` class) | 0.6s | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `shimmer` | Skeleton loading gradient slides right to left | 1.2s | ease-in-out, infinite |

### Transitions

| Element | Properties | Duration | Easing |
|---|---|---|---|
| All buttons (`.btn`) | background-color, color, border-color, box-shadow | 0.2s | default |
| Nav links | color, background-color | 0.15s | default |
| Hamburger bars | transform, opacity | 0.22s | default |
| Mobile drawer | transform (slide) | 0.25s | ease |
| Feature cards | box-shadow, border-color, transform | 0.2s | default |
| Side cards | box-shadow, border-color | 0.2s | default |
| Deal display cards (skewed stack) | transform, filter, opacity | 0.5s | `cubic-bezier(0.22, 1, 0.36, 1)` |
| AI input bar | border-color, box-shadow | 0.2s | default |
| AI suggestion chips | background, border-color, color | 0.15s | default |
| Footer links | color | 0.15s | default |
| Step card numbers | background, border-color | 0.2s | default |

---

## 5. Scroll Effects

### IntersectionObserver fade-up reveal (`data-animate`)

Managed by `AnimationProvider.tsx`. Any element with `data-animate` starts invisible (`opacity: 0`, `translateY(28px)`). When IntersectionObserver detects viewport entry (threshold 0), adds `in-view` class. Transitions to `opacity: 1`, `translateY(0)` over 0.6s `var(--ease-out)`.

**Stagger:** `data-delay="150"` delays reveal by that many ms. Used for sequential card reveals (step cards: 100ms apart, side cards: 150ms, feature grid: 50ms each).

**Applied to:** Problem section text/visual, how-it-works header + step cards, both-sides header + side cards, feature-row text + visuals, feature-grid header + cards, testimonials header + cards, mid-cta inner, final-cta inner

### ContainerScroll parallax (Framer Motion)

Uses `useScroll` + `useTransform` tracking scroll progress through container ref:
- Card rotateX: 20deg to 0deg (desktop) / 8deg to 0deg (mobile)
- Card scale: 1.05 to 1.0 (desktop) / 0.92 to 1.0 (mobile)
- Title translateY: 0 to -100px (desktop) / 0 to -40px (mobile)
- Perspective: 1000px

Container height: 70rem (desktop) / 40rem (mobile) for scroll runway

---

## 6. Hover States

### Buttons

| Variant | Hover Effect |
|---|---|
| **Primary** (neon-green bg) | Darkens to `#C8E60B`, adds neon glow shadow `0 4px 20px rgba(218,254,12,0.25)` |
| **Ghost** (transparent + border) | Background `rgba(255,255,255,0.80)`, border brightens to 95% white |
| **On Dark** (neon on dark bg) | Same as Primary hover |
| **Outline Dark** (transparent + white border) | Border goes full white, adds `rgba(255,255,255,0.08)` bg tint |
| **AI submit** (dark charcoal) | Darkens, adds `0 4px 16px rgba(22,16,11,0.25)` shadow |

### Cards

| Card | Hover Effect |
|---|---|
| **Feature card** (glass icon card) | Bg brightens to 72% white, border to 92% white, stronger shadow, lifts 2px up |
| **Side card** (brand/creator comparison) | Bg brightens to 72% white, border brightens, large glass shadow |
| **Audience card** ("I'm a brand/creator") | Bg to 80% white, border neon-green accent, neon glow ring, lifts 2px |
| **Deal display card** (stacked skewed) | Lifts 1.5rem, grayscale removes, opacity to 1, overlay fades. 0.5s |

### Navigation

| Element | Hover Effect |
|---|---|
| Nav link | Color to heading color, ice tint bg appears |
| Login text | Color muted to heading |
| Hamburger button | Brand-tint bg appears |
| Drawer link | section-bg-alt bg appears |
| Footer link | Color muted to heading |
| Footer social link | Border brightens, color to heading |

### Other

| Element | Hover Effect |
|---|---|
| Step card number circle | Bg to glass-bg-hover, border to 90% white |
| AI suggestion chip | Bg to 78% white, border brightens, text darkens |

---

## 7. Visual Effects

### Glassmorphism Recipe (the defining visual language)

```css
background: rgba(255, 255, 255, 0.55);
backdrop-filter: blur(25px);
-webkit-backdrop-filter: blur(25px);
border: 1px solid rgba(255, 255, 255, 0.6);
border-radius: 24px;
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.8);
```

The `inset 0 1px 0 rgba(255,255,255,0.8)` creates the frosted "top edge highlight" that makes panels appear lit from above.

**Utility classes:**
- `.glass` — Full glass: linear-gradient bg (62%-36% white), blur(22px) saturate(140%), 24px radius
- `.glass-soft` — Lighter glass: 50%-30% white gradient, blur(16px) saturate(130%), 16px radius

### Background Blobs (Creator hero)

Three large circles with `filter: blur(90px)`, positioned absolutely:
- Purple/lavender: 550x450px, 50% opacity
- Citron/yellow: 420x380px, 45% opacity
- Blush/pink: 320x280px, 35% opacity

### Radial Glow Effects

- **Final CTA neon glow**: 600x400px elliptical `radial-gradient(ellipse, rgba(218, 254, 12, 0.08), transparent)`
- **Home final CTA glow**: 700x400px at 0.10 opacity (slightly stronger)
- **Experiment hero ambient glow**: Layered radial gradients — blue 72% right (22% opacity), pink 25% left (16% opacity), green bottom center (12% opacity)

### Shadow System

| Shadow | Value | Used On |
|---|---|---|
| Glass standard | `0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)` | Panels, mock cards |
| Glass small | `0 4px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)` | Feature cards, chips |
| Glass hover | `0 8px 40px rgba(22,16,11,0.10), inset 0 1px 0 rgba(255,255,255,0.95)` | Cards on hover |
| Nav dropdown | `0 4px 12px rgba(0,0,0,0.08)` | Menus |
| ContainerScroll card | `0 4px 20px, 0 20px 40px, 0 40px 60px` (3-layer depth) | Scroll container |
| Mobile CTA bar | `0 -4px 20px rgba(22,16,11,0.07)` | Fixed bottom bar |
| AI input bar | `0 8px 40px rgba(22,16,11,0.10), inset 0 1px 0 rgba(255,255,255,0.95)` | Brand hero input |
| Neon button glow | `0 4px 20px rgba(218,254,12,0.25)` | Primary button hover |

---

## 8. Page-Specific Elements

### Home Page (`/`)

1. **MeshGradientBackground** — Teal/lavender/rose/peach/mint/lime palette
2. **ExperimentHero** — Full-viewport split with Spline 3D glass robot + floating name chips
3. **Problem section** — Two-column: text with solution callout (ice bg, 3px neon-green left border) + "A deal right now lives in..." tool pills (WhatsApp, Instagram DMs, etc.) + arrow + dark "One deal on Guapd" card
4. **StatsRow** — "0 Agency cut", "1 Inbox for every deal", "100% Deal transparency"
5. **ContainerScroll + How It Works** — 3D scroll reveal with 4 step cards connected by horizontal line. Step circles: 54px glass circles with neon-green numbers
6. **Both Sides** — Two side-by-side glass cards ("For Brands" / "For Creators") with checkmark bullets + ghost CTAs
7. **Home Final CTA** — Dark section, neon glow, two buttons (neon + white outline), microcopy

### Brands Page (`/brands`)

1. **MeshGradientBackground** — Warm palette (lavender/pink/rose/peach/amber/lilac)
2. **BrandAIHero** — AI deal builder with glass badge, prompt input bar, suggestion chips
3. **StatsRow**
4. **ContainerScroll + FeatureZigzag** — 3D scroll reveal with 3 alternating rows: Offer Builder mock, Negotiation Thread mock, Payment Tracker mock
5. **MidCTA** — Dark band CTA
6. **Testimonials** — 3-column glass quote cards
7. **FeatureGrid** — 3-column glass icon cards
8. **FinalCTA** — Dark section with neon glow
9. **MobileBottomCTA** — Fixed bottom bar (mobile only)

**Unique: DealCardMock** — 340px glass card with complete deal summary + pipeline tracker

### Creators Page (`/creators`)

1. **MeshGradientBackground** — Default palette (teal/lavender/rose/peach/mint/lime)
2. **Hero** — Split layout with pastel blobs + DealDisplayCards (3 stacked skewed glass cards)
3. **StatsRow**
4. **ContainerScroll + FeatureZigzag** — 3D scroll reveal with 3 alternating rows: Deal Inbox mock, Deliverable Upload mock, Payment Status mock
5. **MidCTA**
6. **Testimonials**
7. **FeatureGrid**
8. **FinalCTA**
9. **MobileBottomCTA**

**Unique: DealDisplayCards** — Three glass cards cascading at -6deg skew. Back cards grayscale/faded. Hover: un-gray + lift

---

## 9. Responsive Breakpoints

| Breakpoint | Key Changes |
|---|---|
| <= 1000px | Floating hero name chips hidden |
| <= 900px | Hero grid collapses to 1 column; problem grid collapses |
| <= 860px | Feature zigzag single-column; feature grid 2-column; testimonials single-column; how-it-works steps go vertical with left border |
| <= 820px | Experiment hero single-column (visual above text), visual max 320px |
| <= 768px | Nav links hidden, hamburger + drawer; mobile bottom CTA appears; body gets 72px bottom padding; ContainerScroll shrinks to 40rem |
| <= 700px | Both-sides grid single-column |
| <= 600px | Stats single-column; AI input stacks vertically; deal cards scale to 85% |
| <= 540px | Feature grid single-column |
| <= 520px | Audience cards single-column |
| <= 480px | Footer columns single-column; footer bottom stacks |

---

## 10. Key Source Files

| File | Contains |
|---|---|
| `apps/web/app/globals.css` | Design tokens (all 3 layers), base reset, scroll animations, glass utilities |
| `apps/web/app/marketing.css` | All marketing component styles |
| `apps/web/app/page.tsx` | Home page |
| `apps/web/app/brands/page.tsx` | Brands page |
| `apps/web/app/creators/page.tsx` | Creators page |
| `apps/web/components/MeshGradientBackground.tsx` | Animated shader gradient |
| `apps/web/components/Logo.tsx` | Crystal gemstone SVG with animations |
| `apps/web/components/Nav.tsx` | Frosted glass navigation |
| `apps/web/components/ExperimentHero.tsx` | Home split hero with Spline 3D |
| `apps/web/components/BrandAIHero.tsx` | AI deal builder hero |
| `apps/web/components/ContainerScroll.tsx` | 3D scroll parallax container (Framer Motion) |
| `apps/web/components/DealDisplayCards.tsx` | Stacked skewed deal cards |
| `apps/web/components/AnimationProvider.tsx` | IntersectionObserver scroll reveals |
| `apps/web/components/Footer.tsx` | Glass footer with video reel |
| `apps/web/lib/content.ts` | All marketing copy (BRAND_NAME = "Guapd") |
