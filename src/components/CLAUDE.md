# src/components/ — design system & shell

Scoped guidance for shared UI. See the root [CLAUDE.md](../../CLAUDE.md) for project-wide rules.

## What lives here

- **`ui.tsx`** — the design-system primitives, ports of the Claude Design
  `FormaFitnessDesignSystem` components: `Button`, `Card`, `Input`, `SegmentedToggle`, `Chip`,
  `StatTile`, `Badge`, `Avatar`, `ProgressBar`, `ChatBubble`, plus `Eyebrow` (uppercase label).
- **`AppShell.tsx`** — the responsive app frame: **sidebar (≥1024) → icon rail (768–1023) →
  bottom tab bar (<768)**, plus the footer user block, theme toggle, and sign-out.
- **`ScreenHeader.tsx`** — title + subtitle + optional right actions.
- **`ChatMarkdown.tsx`** — dependency-free, HTML-escaping markdown renderer for coach messages
  (headings, bold/italic, inline + fenced code, links, lists). Styled via `.md-body` in `index.css`.
- **`TypingDots.tsx`** — the streaming/"thinking" indicator.

## Rules

- **Theme via CSS variables, not props.** Components read semantic tokens (`--accent`,
  `--bg-surface`, `--text-primary`, `--border-base`, …) so light/dark flip automatically with
  no per-component branching. Add new tokens to `src/index.css` (both `:root` and `[data-theme="dark"]`).
- Match the design language: **24px** card radius with a 1px hairline border (cards lean on the
  border, not heavy shadows); pills (`999px`) for chips/avatars/FABs; 12px for buttons/inner tiles.
- Buttons: primary = solid **aqua fill + navy label**; secondary = bordered surface; ghost =
  borderless. Press **scales down** (`active:scale-*`) rather than shifting color. Selected states
  swap to a **mint fill + aqua border**.
- Icons are **lucide-react** at brand stroke weight (`2` default; `2.2–2.5` for active nav).
  Don't hand-draw icons or swap icon sets.
- Keep primitives presentational and stateless where possible; data-fetching belongs in pages.
- `ChatMarkdown` must keep escaping HTML before formatting — it renders backend/LLM text via
  `dangerouslySetInnerHTML`, so never interpolate raw model output without escaping.
