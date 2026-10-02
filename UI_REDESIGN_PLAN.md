# UI & UX Redesign Plan - Split Calculator

## 🎯 Vision & Principles
To transform Split Calculator into a modern, world-class expense management and trip splitting app matching the polish of Splitwise, Revolut, and Linear.

---

## 🎨 1. Design System & Theme Architecture
- **Brand Identity**: Indigo to Violet (`#4F46E5` → `#7C3AED`) gradient with clean typography.
- **Color System**:
  - Light mode: Surface `#FFFFFF`, Background `#F8FAFC`, Text `#0F172A`, Sub `#64748B`, Border `#E2E8F0`
  - Dark mode: Surface `#131B2E`, Background `#090D16`, Text `#F8FAFC`, Sub `#94A3B8`, Border `#283654`
  - Semantic Status Tones: Success (emerald), Warning (amber), Danger (rose), Info (blue), Action (purple).
- **Typography & Money**: Tabular numerals for amounts (`MoneyText`), clean display titles, explicit font weights.
- **Theme Manager**: System/Light/Dark persistence in `AsyncStorage`.

---

## 📐 2. Responsive Navigation Shell & Layout
- **Desktop/Tablet (>= 900px)**:
  - Collapsible/Persistent Left Sidebar with Brand Logo Mark, Grouped Navigation Items with Active Indicators, Notification Badges, and a Footer User Card with Avatar & explicit **LOG OUT** button.
- **Mobile (< 900px)**:
  - 5 Primary Bottom Tabs (`Home`, `Trips`, `Expenses`, `Settle`, `Alerts`) + `More` Drawer/Screen containing Profile, Admin tools, and **LOG OUT**.
- **Inner Header App Bar**:
  - Safe **BACK** button (`router.back()` with home fallback), Page Title / Breadcrumbs, and Contextual Actions.

---

## 🧩 3. Component System (`app/src/ui/`)
- `Screen`: Responsive container with safe-area insets & max-width bounds.
- `Avatar`: User avatar image or fallback initials with deterministic background.
- `StatCard`: KPI summary card with icon, title, value, and trend/subtitle.
- `MoneyText`: Formatted INR currency with color coding (+ green, - red, neutral).
- `Btn`: Button with gradient primary, secondary, ghost, danger, icon, loading, and double-tap protection.
- `TextField`: Floating label text input with prefix/suffix support and error hints.
- `SegmentedControl` & `Chips`: Interactive option selectors.
- `ProgressBar`: Animated budget & wizard step progress bars.
- `Skeleton`: Shimmering loading placeholder cards.
- `EmptyState` & `ErrorState`: Illustrated empty/error screens with call to action.
- `ModalDialog` / `BottomSheet`: Cross-platform overlay modal dialogs.
- `SpendingChart`: SVG/View-based bar chart for spending breakdown.

---

## 📱 4. Screen-by-Screen Upgrades
1. **Login**: Split-screen brand hero card on desktop, centered container on mobile, password visibility toggle.
2. **Dashboard (User & Admin)**:
   - User: Gradient net balance card, Quick Action row, Action Required strip, Active Events carousel, Category breakdown chart, Recent activity.
   - Admin: KPI grid, spend charts, open disputes alert, unresolved problem reports, admin quick actions.
3. **Events/Trips**: Card grid with gradient headers, participant avatar stacks, budget progress, search & filters.
4. **Event Detail**: Hero header, 6 tab views (Overview, Timeline, Expenses, Travel, Settle, Activity), vertical itinerary timeline, checklist manager with admin add item.
5. **Expense Creation Wizard**: 5-step wizard (Basics → Payer/People → Split → Evidence/Visibility → Review) with live server preview, custom split inputs, sticky action bar.
6. **Expense Detail**: Header summary, allocation list with avatars & approval state, evidence gallery with lightbox preview, action bar (Approve, Decline, Edit, Dispute, Cancel).
7. **Settlements**: "Who owes whom" list, 1-tap Pay & Confirm, status stepper.
8. **Profile**: Avatar upload, detail editor, theme toggle, change password, report problem, Log Out.
9. **Admin Tools**: Data tables on desktop, cards on mobile, user management, audit logs, system health, disputes, announcement broadcast, admin settlement override.

---

## 🛠️ 5. Feature Gaps & Logic Fixes
- Profile photo upload and avatar display everywhere.
- Attachment uploads for settlements & travel segments.
- Admin checklist item addition.
- Admin settlement override interface (`POST /settlements/:id/admin-override`).
- Native-friendly date pickers (web date input on web).
- Session expiry (401) automatic redirection to login.
- Double-tap protection on form buttons.
