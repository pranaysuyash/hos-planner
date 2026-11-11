# Product 03: HOS Compliance and Interstate Corridor Legality Planner

Local port: `5175`
Directory: `products/product-03-hos-planner/`

## Value Proposition and Regulatory Context

Commercial motor vehicle property-carrying drivers in the United States must comply with Federal Motor Carrier Safety Administration (FMCSA) Hours of Service regulations under 49 CFR Part 395. Violations risk CSA safety score penalties, out-of-service orders, and schedule disruptions.

Product 03 provides an interactive simulation planner modeling:

1. The 11-hour driving limit following 10 consecutive hours off duty under 49 CFR 395.3(a)(3)(i).
2. The 14-hour consecutive duty window after coming on duty under 49 CFR 395.3(a)(2).
3. Mandatory 30-minute non-driving rest breaks after 8 cumulative driving hours under 49 CFR 395.3(a)(3)(ii).
4. Rolling 70-hour/8-day cumulative duty tracking with 34-hour restart provisions under 49 CFR 395.3(b)(2).
5. Stepped 24-hour ELD duty-status logbook timelines matching FMCSA Part 395 Appendix A grid layouts.
6. Multi-day interstate corridor scheduling (I-80, I-10, I-95, I-40) with automated rest breaks, sleeper layovers, and solo or team transit calculation.

## Architecture and Modules

- `src/engine/types.ts`: FMCSA domain types, duty statuses (`OFF_DUTY`, `SLEEPER_BERTH`, `DRIVING`, `ON_DUTY_NOT_DRIVING`), violation records, and itinerary waypoints.
- `src/engine/hos.ts`: Statutory FMCSA Part 395 evaluation engine and shift validator.
- `src/engine/corridor.ts`: Interstate corridor transit scheduler with waypoint generation, sleeper layovers, and team driver logic.
- `src/engine/presets.ts`: Standard interstate corridor presets (Chicago-Dallas, LA-Atlanta, Seattle-Denver, NYC-Miami).
- `src/ui/LogbookGrid.tsx`: Scalable SVG 24-hour stepped duty-status logbook canvas.
- `src/ui/App.tsx`: Interactive scenario planner with corridor presets, solo/team toggle, modal compliance inspectors, and waypoint logs.

## Suite Integration

- Cargo Fit (port `5173`): shares delivery stop-sequence constraints.
- Freight Pricing (port `5174`): consumes simulated driver layover hours and transit duration for accessorial calculations.
- Asset Studio (port `5176`): supplies range and fuel capacity specifications for corridor stop planning.
- Fleet Telematics (port `5177`): exchanges road speed, odometer, and duty-clock scenario state.

## Running and Testing

```bash
npm run dev
npm test
npm run build
npm run typecheck
```
