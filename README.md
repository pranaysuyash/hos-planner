# Product 03 — HOS Compliance & Interstate Corridor Legality Planner

**Active Port:** `5175`  
**Sovereign Directory:** `products/product-03-hos-planner/`

---

## 1. Value Proposition & Regulatory Context
Commercial motor vehicle (CMV) property-carrying drivers in the United States must strictly adhere to the Federal Motor Carrier Safety Administration (FMCSA) statutory Hours of Service (HOS) rules under **49 CFR Part 395**. Violations result in severe CSA safety score penalties, out-of-service orders, driver disqualifications, and costly lane delays.

Product 03 is an interactive compliance planner and simulation engine that models:
1. **11-Hour Driving Rule (49 CFR § 395.3(a)(3)(i)):** Max 11 driving hours following 10 consecutive hours off duty.
2. **14-Hour Consecutive Duty Window (49 CFR § 395.3(a)(2)):** Cannot drive after the 14th consecutive hour post coming on duty.
3. **Mandatory 30-Minute Rest Break (49 CFR § 395.3(a)(3)(ii)):** Mandatory 30 consecutive minutes of non-driving status (off-duty or sleeper berth) after 8 cumulative hours of driving.
4. **70-Hour / 8-Day Rolling Limit (49 CFR § 395.3(b)(2)):** Rolling cumulative on-duty cap with mandatory 34-hour restart provisions.
5. **Interactive 24-Hour ELD Grid Chart:** High-fidelity electronic logging device (ELD) stepped timeline visualization conforming to FMCSA Part 395 Appendix A standards.
6. **Corridor Itinerary Simulator:** Plans interstate freight transit schedules (e.g. I-80, I-10, I-95, I-40), automatically scheduling mandatory rest breaks, fuel stops, and 10-hour sleeper berth layovers, with support for team expedited transit.

---

## 2. Architecture & Modules
- `src/engine/types.ts`: FMCSA domain types, duty statuses (`OFF_DUTY`, `SLEEPER_BERTH`, `DRIVING`, `ON_DUTY_NOT_DRIVING`), violation records, and itinerary waypoints.
- `src/engine/hos.ts`: Core statutory FMCSA Part 395 rules engine and shift validator.
- `src/engine/corridor.ts`: Interstate corridor transit scheduler with waypoint generation, sleeper stops, and team driver mechanics.
- `src/engine/presets.ts`: Standard interstate corridor transit presets (Chicago-Dallas, LA-Atlanta, Seattle-Denver, NYC-Miami).
- `src/ui/EldGridChart.tsx`: Scalable SVG FMCSA 24-hour stepped duty status logbook canvas.
- `src/ui/CorridorItineraryView.tsx`: Step-by-step corridor journey timeline with arrival times and rest stop details.
- `src/ui/App.tsx`: Interactive control HUD with corridor presets, solo/team toggle, and live compliance metrics.

---

## 3. Cross-Project Bridges
- **Product 01 (Cargo Fit):** Ingests multi-stop delivery drop-sequence constraints.
- **Product 02 (Freight Pricing HUD):** Feeds calculated driver layover hours and transit days into accessorial fee waterfalls.
- **Product 04 (Asset Studio):** Consumes vehicle range, fuel capacity, and speed-drag curves to model realistic corridor fuel stops.
- **Product 05 (Fleet Telematics):** Bi-directional sync with real-time CAN bus road speed, vehicle odometer, and driver duty clocks.

---

## 4. Development & Verification
```bash
# Start local development server on port 5175
npm run dev

# Run Vitest test suite
npm test

# Build production bundle
npm run build

# Run typecheck
npm run typecheck
```
