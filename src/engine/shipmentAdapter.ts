import { planCorridorItinerary } from './corridor';
import { auditDutyIntervals } from './hos';
import type { CorridorItineraryPlan, DutyInterval, HOSAuditResult } from './types';
import type { Shipment, ShipmentAdapter, StageResult } from '../suite/types';

export interface DutyDraft {
  origin: string; destination: string; distanceMiles: number; avgSpeedMph: number;
  driverMode: 'solo' | 'team'; priorRestHours: number;
}

export function validateDutyDraft(input: DutyDraft): string {
  if (typeof input.origin !== 'string' || typeof input.destination !== 'string' || !input.origin.trim() || !input.destination.trim()) return 'Declare both route endpoints before calculating an itinerary.';
  if (![input.distanceMiles, input.avgSpeedMph, input.priorRestHours].every(Number.isFinite) || input.distanceMiles <= 0 || input.avgSpeedMph <= 0 || input.priorRestHours < 0) return 'Distance and speed must be finite positive values, and prior rest must be a finite nonnegative value.';
  if (input.driverMode !== 'solo' && input.driverMode !== 'team') return 'Select an explicit solo or team mode.';
  if (input.distanceMiles / input.avgSpeedMph > 1000) return 'This interactive model supports at most 1,000 driving hours per draft. Shorten the scenario or correct its distance and speed.';
  return '';
}

export function intervalsForPlan(plan: CorridorItineraryPlan): DutyInterval[] {
  let startMinutes = 0;
  return plan.waypoints.map(wp => {
    const interval = { status: wp.dutyStatus, startMinutes, durationMinutes: wp.durationMinutes, location: wp.location, remark: wp.title };
    startMinutes += wp.durationMinutes;
    return interval;
  });
}

export function dutyForShipment(shipment: Shipment): DutyDraft {
  const canonical: DutyDraft = { origin: shipment.input.origin, destination: shipment.input.destination, distanceMiles: shipment.input.loadedMiles, avgSpeedMph: 55, driverMode: 'solo', priorRestHours: shipment.input.priorRestHours };
  const saved = shipment.results.hos;
  const value = saved?.details.nativeInputs as DutyDraft | undefined;
  return saved?.inputRevision === shipment.inputRevision && value && !validateDutyDraft(value) && value.driverMode === 'solo' && value.origin === canonical.origin && value.destination === canonical.destination && value.distanceMiles === canonical.distanceMiles && value.priorRestHours === canonical.priorRestHours ? structuredClone(value) : canonical;
}

export function resultForDutyPlan(shipment: Shipment, input: DutyDraft, plan: CorridorItineraryPlan, audit: HOSAuditResult): StageResult {
  const issue = validateDutyDraft(input);
  if (issue) throw new Error(issue);
  if (input.driverMode !== 'solo') throw new Error('Connected publication supports the declared solo full-rest scenario. Team exploration remains available locally.');
  if (input.origin !== shipment.input.origin || input.destination !== shipment.input.destination || input.distanceMiles !== shipment.input.loadedMiles) throw new Error('This local route differs from the shipment. Update the manifest in Command Center and load shared inputs, or continue standalone.');
  if (input.priorRestHours < 10 || input.priorRestHours !== shipment.input.priorRestHours) throw new Error('Connected publication requires the shipment full-rest declaration of at least ten hours. Change that declaration through the manifest, then load shared inputs.');
  const expected = planCorridorItinerary({ ...input, initialDrivingHoursRemaining: 11, initialShiftHoursRemaining: 14 });
  const expectedAudit = auditDutyIntervals(intervalsForPlan(expected));
  if (JSON.stringify(plan) !== JSON.stringify(expected) || JSON.stringify(audit) !== JSON.stringify(expectedAudit)) throw new Error('The reviewed itinerary or audit differs from its native assumptions. Recalculate before publication.');
  return {
    ok: plan.isLegal && audit.isCompliant,
    summary: `${plan.totalTransitHours.toFixed(1)} modeled transit hours for ${shipment.input.driverId} at ${input.avgSpeedMph} mph. Full-rest solo scenario; no live ELD or appointment guarantee.`,
    details: {
      driverId: shipment.input.driverId, priorRestHours: input.priorRestHours, ruleScope: 'full_rest_only',
      isLegal: plan.isLegal && audit.isCompliant, totalTransitHours: plan.totalTransitHours,
      waypoints: structuredClone(plan.waypoints), violations: structuredClone([...plan.violations, ...audit.violations]),
      nativeInputs: structuredClone(input), nativeItinerary: structuredClone(plan), nativeAudit: structuredClone(audit),
      source: 'Native deterministic scenario model; departure time, actual driver history and live ELD records are not supplied.',
      reviewedBaseInputRevision: shipment.inputRevision,
    },
  };
}

export const shipmentAdapter: ShipmentAdapter = {
  stage: 'hos', evaluate(shipment) {
    const input = dutyForShipment(shipment);
    const issue = validateDutyDraft(input); if (issue) throw new Error(issue);
    const plan = planCorridorItinerary(input);
    return resultForDutyPlan(shipment, input, plan, auditDutyIntervals(intervalsForPlan(plan)));
  },
};
