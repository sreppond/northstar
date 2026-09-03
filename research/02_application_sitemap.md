# Application Sitemap

**[OBSERVED]** unless flagged.

```
ProjectionLab (app.projectionlab.com)
│
├── LEFT SIDEBAR (hamburger-triggered off-canvas drawer, dark navy)
│   ├── Account                         → profile/subscription settings
│   ├── Theme                            → appearance switcher
│   ├── Dashboard                        → net worth summary + Plans list (home)
│   ├── Current Finances                 → shared balance-sheet source of truth
│   │   ├── Savings
│   │   ├── Investments
│   │   ├── Real Assets
│   │   ├── Unsecured Debts
│   │   └── About You                    → household config (Individual/Couple), person(s), country
│   ├── Progress                         → actual net worth over real calendar time vs. plan, "Progress Points" log
│   ├── Plans
│   │   ├── [Plan name] (one row per plan; this session had 2: "Current Projections" and "Northstar Fixture - Single 30")
│   │   └── + New Plan                   → "Create Plan" modal → onboarding-style setup wizard
│   ├── Help Center                      (external link)
│   ├── Gift a Subscription              (external/marketing)
│   ├── Resources ▾ → Blog, Roadmap, Advisor Directory
│   ├── Support ▾ → Discord, Email, Contact Form, 1-on-1 Session
│   └── More Info ▾ → Changelog, Terms, Privacy
│
├── TOP TOOLBAR (every screen)
│   ├── ☰ hamburger (opens sidebar)
│   ├── 🔔 Notification bell — badge-counted, live plan-health warnings (Out of Money at age X /
│   │                          Early Withdrawal Penalties / Milestone never reached), bottom-sheet drawer
│   ├── ⚙︎ sliders icon — "Display Options" (chart config: Inflation/Time Range/Datasets/Metrics/
│   │                     Appearance/Chart Type/Y-Axis/X-Labels/Grouping) when inside a Plan;
│   │                     opens directly on non-Plan screens (Current Finances, Progress) with fewer options
│   └── 🧑 avatar icon — account/profile quick menu
│
└── INSIDE A PLAN — top nav tab bar (horizontally scrollable, no icons, active tab underlined)
    ├── Plan                             → the core workspace (see below)
    ├── Cash Flow                        → Sankey diagram, year-scrubbable
    ├── Tax Analytics                    → metric cards + composition chart + income-type table
    ├── Chance of Success                → Monte Carlo (config accordion → run → full detail)
    ├── Compare ▾                        → What If (staged edit mode)
    ├── Optimize ▾                       → Tax Strategy / Flexible Spending / Roth Conversions /
    │                                       Drawdown / Gain Harvesting
    ├── Reports                          → Explore (data table) / Summary / Plots, + Export (CSV/JSON/PDF)
    ├── Estate                           → Gross Estate / Estate Drag / Net Legacy, estate-flow Sankey,
    │                                       breakdown table, assumptions, auto-insights
    └── Settings ▾ → Milestones / Rates / Dividends / Bonds / Tax / Metrics / Other Settings / Notes

    Inside "Plan" tab specifically — vertical accordion sections below the chart:
    ├── Net Worth chart (dataset picker "Net Worth ▾", ~25-item Plots library available via Reports)
    ├── Accounts        (+ Add, ↑↓ reorder, ⊹ set defaults, each with owner/goal/mechanics/tax/time-range)
    ├── Income          (+ Add, 10 templates: Salary/Hourly Wage/RSU Grant/Inheritance/Side Hustle/
    │                     Tax Credit/Tax Deduction/Pension Income/Social Security/Custom Income)
    ├── Expenses        (+ Add, 14 templates: Living Expenses/Rent/Debt/Student Loans/Dependent/
    │                     Education/Health Care/Vacation/Wedding/Charity/Travel/Medical Expenses/
    │                     Emergency/Custom Expense)
    ├── Real Assets     (+ Add, 14 types: House/Car/Rental Property/Commercial Property/Land/Building/
    │                     Motorcycle/Boat/Jewelry/Precious Metals/Furniture/Instrument/Machinery/
    │                     Custom Asset — country-localized)
    └── Flows           (+ Add Flow, prioritized top-to-bottom contribution waterfall + fallback
                          "Save anything left over")
```

## Notable navigation mechanics (not obvious from the tree alone)

- **"New Plan" is the onboarding wizard, reused.** Creating a second Plan launches the exact same "Let's make a plan" step wizard (Milestones → Income → Flows → Expenses → Real Assets → Confirm) used for first-time setup, just scoped to the new Plan. There is no separate "quickstart" experience — onboarding and plan-creation are the same flow.
- **Current Finances (people, balances) is account-wide, not per-Plan.** Every Plan draws from the same household/balance-sheet state; a Plan only adds its own Income/Expenses/Milestones/Flows on top, plus optionally new Accounts/Real Assets. A Real Asset or Account "Linked to Current Finances" can be **Deactivated** per-Plan (excluded from that Plan's math) without touching Current Finances or other Plans — the correct non-destructive override mechanism [OBSERVED, see 09].
- **Milestones have no dedicated top-level nav entry.** They're edited by clicking a milestone's icon directly on the Net Worth chart (which deep-links into Settings → Milestones), or via Settings ▾ → Milestones directly. The inline pickers elsewhere (e.g., an Income's "End: Retirement" field) only choose *which* milestone to bind to, not edit the milestone's own definition.
- **"Compare" is a dropdown, not a page** — currently exposes exactly one item, **What If**, which enters a global sticky staged-edit mode (red dot appears on the Compare tab across every other tab) with three exits: Keep Changes / Revert Changes / Save as New Plan.
- **"Optimize" is also a dropdown** exposing 5 sub-tools that are facets of one shared Tax Strategy object (see [05_scenarios_optimization_taxes.md](05_scenarios_optimization_taxes.md)).
- **Reports has its own 3-way sub-nav** (Explore / Summary / Plots) that is easy to miss since it looks like a segmented control, not tabs.

## Sitemap gaps / not verified this session
- **[UNKNOWN]** Account-level pages (Theme switcher options, Gift a Subscription flow, full Support/Resources external destinations) — sidebar items only, not opened; low research value for a product spec.
- **[UNKNOWN]** Whether "Compare" ever surfaces a second option beyond What If (e.g., a direct multi-Plan side-by-side comparator) — only What If was offered in this account state.
