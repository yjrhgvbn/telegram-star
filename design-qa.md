# Design QA — `/filters/new`

**Findings**

- No actionable P0, P1, or P2 differences remain. The implementation keeps the existing product density and component language while making the approved title and default-scope adjustments.
- [P3, accepted] The selected refinement mock places the name action beside the subtitle and uses roomier condition cards. The implementation keeps the existing right-aligned workspace action and compact card rhythm because the requested direction was a small adjustment to the current page, not a layout redesign.
- [P3, accepted] The earlier condition-card reference shows a chevron beside “来自任一会话”. A later user-directed refinement makes this source operator fixed and non-interactive, so the chevron and source-type menu are intentionally absent.

**Comparison Target and Evidence**

- Source visual truth:
  - `/var/folders/__/vxrrrx496k5bwzlgz4chsmgm0000gn/T/codex-clipboard-7f02dcb3-e2fe-4ceb-80bc-e08d9aac05b8.png` (user-provided current condition-card reference, 2058 × 698 px).
  - `/Users/wu/.codex/generated_images/019ffb88-0c1f-7b20-8a47-945d72c59c33/exec-7ec53efd-b3eb-42f4-9096-bd39470b531f.png` (selected full-page refinement target, 1672 × 941 px).
- Browser-rendered implementation: `/Users/wu/.codex/visualizations/2026/08/13/019ffb88-0c1f-7b20-8a47-945d72c59c33/filters-new-implementation.png` (1672 × 941 px).
- Combined comparison input: `/Users/wu/.codex/visualizations/2026/08/13/019ffb88-0c1f-7b20-8a47-945d72c59c33/filters-new-comparison.png`.
- Mobile evidence: `/Users/wu/.codex/visualizations/2026/08/13/019ffb88-0c1f-7b20-8a47-945d72c59c33/filters-new-mobile.png` (390 × 844 px).
- Desktop CSS viewport: 1672 × 941; `devicePixelRatio: 1`. Source mock and implementation were compared at equal pixel dimensions, so no density normalization was required.
- State: light theme, authenticated local data, `/filters/new`, new unsaved rule, default empty chat scope and empty keyword condition.
- Full-view comparison: the combined artifact was opened at original detail and checked for page hierarchy, left/right grid, header, condition cards, notification card, preview panel, and persistent footer.
- Focused-region comparison: a separate crop was unnecessary because the equal-size original-detail comparison kept the changed header and both condition rows legible. The supplied 2058 × 698 condition-card reference was also used to verify the detailed row structure. The title focus treatment was verified interactively and by computed style (`border-radius: 0`, no visible ring shadow, primary bottom border).

**Required Fidelity Surfaces**

- Fonts and typography: existing Geist family, weights, line heights, compact hierarchy, and truncation behavior are preserved. The new helper copy remains secondary and the mobile subtitle truncates without colliding with the action.
- Spacing and layout rhythm: existing workspace density, card gaps, radii, borders, two-column desktop grid, and sticky footer remain stable. At 390 px, document and body widths both equal the viewport; there is no horizontal overflow.
- Colors and visual tokens: all additions use existing foreground, muted, border, primary, card, and focus tokens; no new palette or decorative treatment was introduced.
- Image quality and asset fidelity: no new raster imagery was required. The existing product logo is preserved and interface icons remain from the project's Lucide set; there are no placeholder, CSS-drawn, or inline-SVG substitute assets.
- Copy and content: “全部会话” is explicit, its helper explains the implicit scope, and the name helper clearly states that the first keyword or regex will be used automatically. The source operator is fixed to “来自任一会话”; the content operator offers only keyword and regex choices.
- Icons and affordances: the pencil action, back control, condition selectors, picker disclosure, delete action, preview controls, and footer actions remain visually aligned and use the existing icon family.
- Accessibility and states: inputs and buttons retain accessible names; the fixed source operator is exposed as text rather than a misleading combobox; the primary chat-scope row cannot be deleted; keyboard Enter/Escape closes inline name editing; mobile tap targets remain usable.

**Primary Interactions Tested**

- Clicked the displayed “新建过滤器” title and confirmed it switched directly to the focused name input.
- Opened inline custom-name editing, entered a custom name, and closed it with Escape.
- Confirmed the focused name input uses a lightweight underline rather than the previous rounded focus ring.
- Entered keyword “将夜” and confirmed the header changed to “将自动命名为「将夜」，也可自定义”.
- Confirmed “来自任一会话” has no combobox, chevron, or source-type menu.
- Opened “消息内容匹配方式” and confirmed its only choices are keyword and regex; switched to regex and confirmed the corresponding input appeared while the source operator remained fixed.
- Opened the all-chat picker, selected a specific chat, confirmed “改为全部会话” appeared, and restored the implicit all-chat scope.
- Reloaded the route to confirm the new-rule default state is stable.
- Checked browser console warnings/errors: none.

**Comparison History**

- Pass 1: no actionable P0/P1/P2 visual differences were found. The remaining density and action-placement differences were classified as intentional preservation of the existing product shell, so no visual fix loop was required.
- Pass 2: applied the later user-directed simplification by replacing the source-type selector with a quiet fixed field and limiting the content selector to keyword and regex. Desktop and mobile checks found no layout regression or overflow.

**Implementation Checklist**

- [x] Optional, automatically derived filter name.
- [x] Lightweight custom-name focus state.
- [x] Default all-chat scope plus keyword condition.
- [x] Fixed, non-interactive source operator.
- [x] Content selector limited to keyword and regex.
- [x] Empty chat scope omitted from persisted conditions.
- [x] One-click return from selected chats to all chats.
- [x] Desktop and mobile layout verification.
- [x] Browser interaction and console verification.

final result: passed
