# Skilly Design System v1.0

**Product:** Skilly — AI teaching companion for complex desktop software
**Domain:** tryskilly.app
**Platform:** macOS menu bar app + marketing website
**Date:** April 2026

---

## 1. Brand Essence

Skilly is a warm, energetic teaching companion that points at things and explains them. The brand should feel like a patient friend who's really good at Blender sitting next to you, tapping your screen and saying "click here."

**Personality keywords:** Warm, approachable, confident, clear, slightly playful.
**Not:** Corporate, cold, developer-tooling, enterprise, intimidating.

The name ends in "-y" for a reason. The brand should match that energy.

---

## 2. Color Palette

### 2.1 Primary Accent — Amber

The amber accent is Skilly's signature. It's the cursor color, the CTA color, the brand mark color. It was chosen because it pops on dark creative tool UIs (Blender, After Effects, DaVinci Resolve) and reads as a natural highlighter — "look HERE."

| Token | Hex | Usage |
|-------|-----|-------|
| `amber-50` | `#FEFCE8` | Lightest background tint (website cards, badges) |
| `amber-100` | `#FEF3C7` | Light background fills |
| `amber-200` | `#FDE68A` | Hover states, subtle highlights |
| `amber-300` | `#FCD34D` | Secondary accent, progress bar background |
| `amber-400` | `#FBBF24` | Active states, strong highlights |
| `amber-500` | `#F59E0B` | **Primary accent.** Cursor overlay, CTAs, brand mark, links |
| `amber-600` | `#D97706` | Hover state for primary CTAs |
| `amber-700` | `#B45309` | Pressed state, dark-mode text on amber backgrounds |
| `amber-800` | `#92400E` | Dark accent for text on amber-50/100 fills |
| `amber-900` | `#78350F` | Darkest amber, footer accents |

**Rule:** Amber is the only chromatic accent in the macOS app UI. Everything else is neutral. This constraint keeps the brand instantly recognizable — if it's amber, it's Skilly.

### 2.2 Neutrals — Warm Gray

Standard cool grays feel clinical. Skilly uses a warm-shifted neutral scale that complements the amber accent.

| Token | Hex | Usage |
|-------|-----|-------|
| `gray-50` | `#FAFAF8` | Website body background |
| `gray-100` | `#F5F5F0` | Card backgrounds, alternate sections |
| `gray-200` | `#E5E5E0` | Borders (light mode), dividers |
| `gray-300` | `#D4D4CF` | Disabled states, placeholder text |
| `gray-400` | `#A3A39E` | Secondary text (light mode) |
| `gray-500` | `#737370` | Muted text |
| `gray-600` | `#525250` | Body text (light mode) |
| `gray-700` | `#3F3F3D` | Headings (light mode), secondary text (dark mode) |
| `gray-800` | `#27272A` | Primary text (light mode), card surfaces (dark mode) |
| `gray-900` | `#1C1C1E` | App panel background, website dark sections |
| `gray-950` | `#0F0F10` | Deepest background (app panel, dark hero) |

### 2.3 Semantic Colors

Used sparingly for status indicators, success/error states. Not part of the brand — strictly functional.

| Token | Hex | Usage |
|-------|-----|-------|
| `green-500` | `#22C55E` | Active/connected indicator (the green dot in menu bar) |
| `red-500` | `#EF4444` | Error states, destructive actions |
| `blue-500` | `#3B82F6` | Links on dark backgrounds (if amber doesn't contrast) |

### 2.4 Cursor Overlay Colors

The teaching cursor must work on any application background. The primary cursor is amber with a subtle glow.

| Element | Value |
|---------|-------|
| Cursor fill | `amber-500` (#F59E0B) at 90% opacity |
| Cursor glow | `amber-300` (#FCD34D) at 30% opacity, 8px blur |
| Element label pill | `gray-900` (#1C1C1E) background, `amber-400` (#FBBF24) text |

---

## 3. Typography

### 3.1 macOS App

The app uses Apple system fonts exclusively. This ensures native feel, zero font loading, and automatic HIG compliance.

| Role | Font | Weight | Size |
|------|------|--------|------|
| Panel title | SF Pro Display | Semibold (600) | 15px |
| Section headers | SF Pro Text | Semibold (600) | 11px, uppercase, 0.8px tracking |
| Body text | SF Pro Text | Regular (400) | 14px |
| Hint text | SF Pro Text | Regular (400) | 13px |
| Skill name | SF Pro Text | Medium (500) | 14px |
| Stage indicator | SF Pro Text | Regular (400) | 12px |
| Bottom bar actions | SF Pro Text | Regular (400) | 12px |

In SwiftUI, all of these map to `.system()` font modifiers with appropriate design and weight parameters. No custom fonts are loaded in the app.

### 3.2 Website (tryskilly.app)

The website uses a custom font pairing that reflects the brand personality: confident but approachable.

**Display + Body font:** DM Sans
- Variable weight, free on Google Fonts
- Geometric, clean, slightly rounded — matches the warm amber energy
- Used for: hero headlines, section titles, body text, navigation
- Weights: Bold (700) for headlines, Medium (500) for subheads, Regular (400) for body

**Mono font:** JetBrains Mono
- Used for: code snippets, technical labels, keyboard shortcuts, SKILL.md examples
- Weight: Regular (400)
- Pairs with the developer-friendly side of the product

| Role | Font | Weight | Size (desktop) | Size (mobile) |
|------|------|--------|---------------|---------------|
| Hero headline | DM Sans | 700 | 56px | 36px |
| Section title | DM Sans | 700 | 36px | 28px |
| Subheadline | DM Sans | 500 | 20px | 18px |
| Body | DM Sans | 400 | 17px | 16px |
| Small / caption | DM Sans | 400 | 14px | 13px |
| Nav links | DM Sans | 500 | 15px | 15px |
| Code / mono | JetBrains Mono | 400 | 14px | 13px |
| CTA button | DM Sans | 600 | 16px | 16px |

### 3.3 Arabic / RTL Support

If Arabic localization is added later:

| Role | Font |
|------|------|
| AR display | Noto Kufi Arabic (700) |
| AR body | IBM Plex Sans Arabic (400) |

---

## 4. Spacing & Layout

### 4.1 Base Grid

8px base unit across all surfaces. All spacing values are multiples of 8.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight gaps (icon-to-label within a button) |
| `space-2` | 8px | Default inner padding, small gaps |
| `space-3` | 12px | Between related elements |
| `space-4` | 16px | Section inner padding, card padding |
| `space-5` | 24px | Between sections within a panel |
| `space-6` | 32px | Between major sections (website) |
| `space-8` | 48px | Website section padding |
| `space-10` | 64px | Hero vertical padding |
| `space-12` | 80px | Website top-level section spacing |
| `space-16` | 128px | Hero padding (desktop) |

### 4.2 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 6px | Buttons, badges, keyboard shortcut pills |
| `radius-md` | 8px | Toggle buttons, dropdowns, input fields |
| `radius-lg` | 12px | Cards, feedback boxes, skill cards |
| `radius-xl` | 14px | App panel, modal dialogs |
| `radius-full` | 9999px | Pills, status dots, avatar circles |

### 4.3 macOS App Panel Dimensions

| Property | Value |
|----------|-------|
| Panel width | 300px |
| Panel corner radius | 14px |
| Panel background | `gray-900` (#1C1C1E) with system vibrancy |
| Section divider | 0.5px solid `rgba(255,255,255,0.08)` |
| Content padding (horizontal) | 16px |
| Content padding (vertical) | 12px per section |

---

## 5. Logo Direction

### 5.1 Concept

The logo should communicate "pointing" and "teaching" in a single mark that works from 16px (menu bar) to hero-size (website).

**Recommended direction: Abstract cursor-arrow mark.**

A stylized arrow/cursor shape — simplified from the classic macOS pointer — rendered in amber. The shape should be geometric and clean enough to read at 16px, with enough personality to feel like a character rather than a system cursor.

The mark works alone (menu bar icon, app icon, favicon) and alongside the wordmark "Skilly" (website header, marketing).

### 5.2 Specifications

| Format | Size | Notes |
|--------|------|-------|
| Menu bar icon | 16×16px, 32×32px @2x | Monochrome (white or amber on dark menu bar). Single color, no gradients. Must read as a cursor/pointer at this size. |
| App icon | 128×128, 256×256, 512×512, 1024×1024px | macOS rounded-rect mask applied automatically. Amber cursor mark on `gray-950` background. Can include subtle depth or secondary elements. |
| Favicon | 32×32px, 16×16px | Amber mark on transparent background. |
| OG image | 1200×630px | Full logo lockup (mark + wordmark) on `gray-950` background with amber accent. |

### 5.3 Wordmark

"Skilly" set in DM Sans Bold (700), lowercase. The dot of the "i" can optionally be replaced with a small amber cursor mark — a subtle brand signature that works at heading sizes but disappears gracefully at small sizes.

### 5.4 Logo Clearspace

Minimum clearspace around the mark equals the height of the cursor arrow tip. Around the full lockup (mark + wordmark), minimum clearspace equals the cap-height of the "S."

### 5.5 What NOT to Do

- No mascot character (the cursor IS the mascot)
- No gradients in the mark (flat fill only, for menu bar legibility)
- No thin strokes that disappear at 16px
- No text in the app icon (the mark must stand alone)
- No generic brain/lightbulb/sparkle AI imagery

---

## 6. Component Patterns

### 6.1 macOS App Components

All components follow Apple HIG with amber accent overrides.

**Status indicator dot:**
- Active: `green-500` (#22C55E), 8px circle
- Inactive: `gray-500` (#737370), 8px circle

**Section headers:**
- Amber-tinted label text using `amber-300` (#FCD34D) on dark panel
- 11px, uppercase, 0.8px letter spacing
- Labels: SKILLS, LANGUAGE, SHORTCUTS, VOICE

**Model selector toggle:**
- Segmented control with `amber-500` at 15% opacity fill for active state
- Active text: `amber-300` (#FCD34D)
- Inactive text: `gray-400` (#A3A39E)

**Skill card (active):**
- Background: `amber-500` at 15% opacity
- Skill name: `amber-300` (#FCD34D), 14px, medium weight
- Stage text: `gray-400` (#A3A39E), 12px
- Progress bar track: `rgba(255,255,255,0.1)`, 3px height
- Progress bar fill: `amber-500` (#F59E0B)

**Dropdown selectors:**
- Background: `rgba(255,255,255,0.08)`
- Text: `gray-300` (#D4D4CF)
- Border: `rgba(255,255,255,0.12)`
- Corner radius: `radius-md` (8px)

**Bottom action bar:**
- Text: `gray-400` (#A3A39E), 12px
- Divider above: 0.5px solid `rgba(255,255,255,0.08)`
- Three actions: Quit Skilly, Replay Intro, Sign Out

### 6.2 Website Components

**Primary CTA button:**
- Background: `amber-500` (#F59E0B)
- Text: `gray-950` (#0F0F10), DM Sans 600, 16px
- Padding: 12px 28px
- Border radius: `radius-sm` (6px)
- Hover: `amber-600` (#D97706)
- Active: `amber-700` (#B45309), scale(0.98)
- No border, no shadow

**Secondary button (ghost):**
- Background: transparent
- Text: `gray-700` (#3F3F3D) in light mode, `gray-300` (#D4D4CF) in dark mode
- Border: 1px solid `gray-200` (#E5E5E0) in light mode, `rgba(255,255,255,0.15)` in dark mode
- Hover: `gray-100` (#F5F5F0) fill in light mode
- Same padding and radius as primary

**Pricing cards:**
- Background: `gray-50` (#FAFAF8) in light mode, `gray-800` (#27272A) in dark mode
- Border: 1px solid `gray-200` (#E5E5E0)
- Border radius: `radius-lg` (12px)
- Padding: 32px
- Featured card: 2px amber-500 border, "Recommended" badge in amber-50 bg with amber-800 text

**Code / SKILL.md preview blocks:**
- Background: `gray-900` (#1C1C1E)
- Text: `gray-300` (#D4D4CF) in JetBrains Mono
- YAML frontmatter keys: `amber-400` (#FBBF24)
- Border radius: `radius-lg` (12px)
- Top bar with macOS traffic light dots (decorative)

**Feature cards:**
- Background: white (`gray-50`)
- Icon: `amber-500` simple line icon (Lucide)
- Title: `gray-800`, DM Sans 600, 18px
- Description: `gray-500`, DM Sans 400, 15px
- No border, subtle `gray-100` background on hover

---

## 7. Website Structure

### 7.1 Color Mode

The website is primarily dark-mode, matching the creative tools aesthetic of the target audience. Dark backgrounds (`gray-950`, `gray-900`) with amber accents. Light sections can be used for social proof or pricing to create visual rhythm.

### 7.2 Page Sections (tryskilly.app)

1. **Nav bar** — Fixed, transparent → `gray-950` on scroll. Logo mark + "Skilly" wordmark left-aligned. "Download" CTA right-aligned in amber.
2. **Hero** — Dark background. Headline: "Your AI companion for learning [Blender / Figma / After Effects]" (rotating). Subheadline. CTA: "Download for Mac — Free." Screenshot or video of the cursor pointing at a Blender UI element.
3. **How it works** — Three-step visual: (1) Open your app, (2) Hold Control+Option and ask, (3) Skilly points and explains.
4. **Demo video** — Embedded video of a real teaching session.
5. **Skills** — Available skills with SKILL.md preview. "More skills coming" waitlist.
6. **Pricing** — Cards for Free / Learner / Pro / BYOK tiers.
7. **Footer** — tryskilly.app, social links, moelabs.dev credit.

### 7.3 Responsive Breakpoints

| Breakpoint | Width | Columns |
|------------|-------|---------|
| Mobile | < 640px | 1 column |
| Tablet | 640–1024px | 2 columns |
| Desktop | > 1024px | 3-4 columns, max-width 1200px |

---

## 8. Motion & Animation

### 8.1 macOS App

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Panel appear/dismiss | Fade + slight scale | 200ms | ease-out |
| Skill card expand | Height expand with opacity | 250ms | ease-in-out |
| Progress bar fill | Width transition | 400ms | ease-in-out |
| Cursor overlay flight | Bezier curve to target | 300–500ms | cubic-bezier(0.25, 0.1, 0.25, 1.0) |
| Cursor overlay pulse | Amber glow pulse at destination | 2 loops, 600ms each | ease-in-out |

### 8.2 Website

| Element | Animation | Trigger |
|---------|-----------|---------|
| Hero headline | Fade-up, staggered per word | Page load |
| Feature cards | Fade-up, staggered 100ms | Scroll into view |
| Code block | Typewriter effect | Scroll into view |
| CTA button | Scale 1.02 hover, 0.98 press | Hover/active |
| Cursor demo | Replay cursor flight | Scroll into view, loop |

---

## 9. Iconography

### 9.1 macOS App — SF Symbols

| Icon | SF Symbol name | Usage |
|------|---------------|-------|
| Settings | `gearshape` | Panel header |
| Close | `xmark` | Panel header |
| Quit | `power` | Bottom bar |
| Replay | `play.fill` | Bottom bar |
| Sign out | `rectangle.portrait.and.arrow.right` | Bottom bar |
| Feedback | `bubble.left.fill` | Feedback card |
| Language | `globe` | Settings section |
| Shortcuts | `keyboard` | Settings section |
| Voice | `waveform` | Settings section |

### 9.2 Website — Lucide Icons

Stroke width: 1.5px. Color: `amber-500` for feature icons, `gray-400` for utility icons. Size: 24px for feature cards, 16px for inline/nav.

---

## 10. File Assets Checklist

| Asset | Format | Sizes | Status |
|-------|--------|-------|--------|
| App icon | PNG, ICNS | 16–1024px | To create |
| Menu bar icon | PDF (vector) | 16×16 @1x, 32×32 @2x | To create |
| Favicon | ICO, PNG | 16, 32, 180 (apple-touch) | To create |
| OG image | PNG | 1200×630 | To create |
| Logo lockup (mark + wordmark) | SVG, PNG | Vector + 2x raster | To create |
| Wordmark only | SVG | Vector | To create |
| Cursor overlay sprite | Programmatic | Rendered in code | Restyle from Clicky with amber |

---

## 11. Brand Palette Summary (Quick Reference)

```
Primary accent:    #F59E0B  (amber-500)
Accent hover:      #D97706  (amber-600)
Accent light:      #FCD34D  (amber-300, text on dark)
Accent tint:       #F59E0B at 15% opacity (cards on dark)
Accent bg:         #FEFCE8  (amber-50, badges on light)

Dark surface:      #1C1C1E  (gray-900, app panel)
Dark background:   #0F0F10  (gray-950, website hero)
Light background:  #FAFAF8  (gray-50, website body)
Light surface:     #F5F5F0  (gray-100, cards)

Primary text (light):  #27272A  (gray-800)
Primary text (dark):   #E5E5E0  (gray-200)
Secondary text:        #737370  (gray-500)
Muted text:            #A3A39E  (gray-400)

Active indicator:  #22C55E  (green-500)
Error:             #EF4444  (red-500)

Fonts (app):       SF Pro (system)
Fonts (web):       DM Sans + JetBrains Mono
```

---

## 12. Changelog

- **v1.0** (April 2026): Initial design system. Amber accent chosen over violet. macOS app + website coverage. Logo direction briefed, assets pending creation.
