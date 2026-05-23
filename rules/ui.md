# UI rules (Tailwind)

## Stack

- Use **[Tailwind CSS](https://tailwindcss.com/)** for all **non-print** app screens: home hub, character generator, playlist top, GM shell (when restyled).
- Load Tailwind via the shared snippet in `src/ui/tailwind.html` (CDN for local dev). Prefer a built CSS bundle before production deploy.
- Do **not** use Tailwind on the US Letter character sheet (`src/sheet/`); keep `sheet.css` for print fidelity.

## Home hub (`src/index.html`)

- **Only** two primary actions, centered on the viewport:
  1. Character generator
  2. Top of playlist
- No extra nav, footer links, or secondary chrome on this screen.
- Use `min-h-screen flex flex-col items-center justify-center gap-8`.

## Dynamic choice buttons (compendium, gate, playlist)

Compendium picks and other generated actions must stay **easy to read** at a glance:

| Rule | Tailwind guidance |
|------|-------------------|
| Minimum tap target | `min-h-11` (44px) |
| Body text | `text-base` (16px) or `text-lg` for primary choices |
| Label | `font-medium` or `font-semibold`; show rules name on its own line |
| Secondary detail | `text-sm text-slate-400` (dark) / `text-slate-600` (light) |
| State | `ring-2 ring-amber-500/80` when selected; `hover:bg-slate-700/50` on dark surfaces |
| Layout | Full-width stack on narrow screens: `flex flex-col gap-2 w-full max-w-xl` |
| Contrast | Dark app shell: `bg-slate-800 text-slate-100 border border-slate-600` |

Avoid tiny pill buttons for compendium entries; use card-like buttons:

```html
<button type="button" class="w-full min-h-11 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-left text-base font-medium text-slate-100 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
  <span class="block">Dragonborn</span>
  <span class="block text-sm font-normal text-slate-400">+2 Str, +2 Cha</span>
</button>
```

## Color and shell

- App shell: dark neutral (`bg-slate-950`, surfaces `bg-slate-900` / `bg-slate-800`).
- Accent: amber/gold (`amber-500`, `amber-400`) for headings and primary CTAs — aligned with existing editor accent.
- Primary CTA: `bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold`.
- Secondary: `border border-slate-600 text-slate-200 hover:bg-slate-800`.

## Accessibility

- English UI strings only (see `PROMPT.md`).
- Visible focus rings on all interactive elements.
- Use semantic headings (`h1` once per view, `h2` for sections).
- `aria-current="step"` on active wizard step where applicable.
