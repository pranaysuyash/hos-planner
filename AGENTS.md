# Product 03 — HOS Compliance & Interstate Corridor Legality Planner

## 1. Instruction Hierarchy & Governance
This directory governs Product 03 (HOS Planner) of the TRUCKING platform.
Precedence:
1. `/Users/pranay/AGENTS.md`
2. `/Users/pranay/Projects/AGENTS.md`
3. `/Users/pranay/Projects/trucking/AGENTS.md`
4. This file (`products/product-03-hos-planner/AGENTS.md`)
5. Local `OPERATING_DOCTRINE.md`

Compatibility symlinks (`CLAUDE.md`, `GEMINI.md`, `QWEN.md`) must point directly to this file.

---

## 2. Product Identity & Domain Boundary
- **Port:** `5175`
- **Focus:** FMCSA statutory Part 395 regulations (11-hr driving cap, 14-hr duty window, 8-hr break, 70-hr rolling cycle), interactive SVG 24-hr ELD logbooks, interstate corridor waypoint simulations, and solo vs. team driver mechanics.
- **Tech Stack:** React 19, TypeScript, Three.js, Vite 7, Vitest 3.

---

## 3. Sovereign Verification Commands
```bash
npm test        # Run 7 Vitest tests
npm run build   # Typecheck and production bundle build
npm run dev     # Start local server on port 5175
```

---

## 4. Cross-Project Bridges
- **Consumes:** Route miles from Product 02 (Freight Pricing · Port 5174); vehicle range from Product 04 (Asset Studio · Port 5176).
- **Produces:** Duty state validation and sleeper schedules to Product 05 (Fleet Telematics · Port 5177).

---

## 5. Git & Mutation Policy
- Read-only inspection is permitted (`git status`, `git diff`, `git log`).
- Staging, commits, pushes, and branch changes require explicit user authorization.
