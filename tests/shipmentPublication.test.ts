import { describe, expect, it } from 'vitest';
import { planCorridorItinerary } from '../src/engine/corridor';
import { auditDutyIntervals } from '../src/engine/hos';
import { dutyForShipment, intervalsForPlan, resultForDutyPlan, validateDutyDraft, type DutyDraft } from '../src/engine/shipmentAdapter';
import type { Shipment } from '../src/suite/types';

const shipment = (): Shipment => ({ id: 'shipment-duty', inputRevision: 4, input: { origin: 'A', destination: 'B', loadedMiles: 620, priorRestHours: 10, driverId: 'driver-declared' }, results: {} } as Shipment);
const native = (): DutyDraft => ({ origin: 'A', destination: 'B', distanceMiles: 620, avgSpeedMph: 48, driverMode: 'solo', priorRestHours: 10 });
function result(input = native()) { const plan = planCorridorItinerary(input); return resultForDutyPlan(shipment(), input, plan, auditDutyIntervals(intervalsForPlan(plan))); }

describe('Reviewed native duty publication', () => {
  it('retains the reviewed native inputs as a non-authoritative indeterminate result', () => {
    const input = native();
    const plan = planCorridorItinerary(input);
    expect(plan.avgSpeedMph).toBe(48);
    expect(plan.totalTransitHours).not.toBe(planCorridorItinerary({ ...input, avgSpeedMph: 55 }).totalTransitHours);
    const review = result(input);
    expect(review).toMatchObject({ ok: false, details: { assessment: 'indeterminate', isLegal: false, nativeInputs: input } });
    expect(review.summary).toMatch(/cannot authorize dispatch/i);
  });
  it.each([0, -1, NaN, Infinity, 0.00000001])('rejects nonprogressing or unbounded speed %s before planning', avgSpeedMph => {
    expect(validateDutyDraft({ ...native(), avgSpeedMph })).not.toBe('');
    expect(() => planCorridorItinerary({ ...native(), avgSpeedMph })).toThrow(RangeError);
    expect(() => planCorridorItinerary({ ...native(), avgSpeedMph, driverMode: 'team' })).toThrow(RangeError);
  });
  it('rejects team, different route and incomplete prior-rest connected publications', () => {
    expect(() => result({ ...native(), driverMode: 'team' })).toThrow(/solo/);
    expect(() => result({ ...native(), destination: 'C' })).toThrow(/manifest/);
    expect(() => result({ ...native(), priorRestHours: 9 })).toThrow(/ten hours/);
  });
  it('detects a plan or audit changed after the assumptions were reviewed', () => {
    const input = native(); const plan = planCorridorItinerary(input); const audit = auditDutyIntervals(intervalsForPlan(plan));
    expect(() => resultForDutyPlan(shipment(), input, { ...plan, totalTransitHours: 1 }, audit)).toThrow(/Recalculate/);
    expect(() => resultForDutyPlan(shipment(), input, plan, { ...audit, totalDrivingMinutes: 0 })).toThrow(/Recalculate/);
  });
  it('refuses to publish an indeterminate assessment as a negative legal result', () => {
    const input = native(); const plan = planCorridorItinerary(input); const audit = auditDutyIntervals(intervalsForPlan(plan));
    expect(resultForDutyPlan(shipment(), input, plan, audit)).toMatchObject({ ok: false, details: { assessment: 'indeterminate', isLegal: false } });
    expect(() => resultForDutyPlan(shipment(), input, plan, { ...audit, assessmentReasons: ['Missing time'] })).toThrow(/Recalculate/);
    expect(() => resultForDutyPlan(shipment(), input, { ...plan, assessmentReasons: ['Missing time'] }, audit)).toThrow(/Recalculate/);
  });
  it('restores accepted supported speed only when canonical declarations still agree', () => {
    const record = shipment(); record.results.hos = { ok: true, summary: 'Previously saved scenario', details: { nativeInputs: native() }, productId: 'product-03-hos-planner', inputRevision: 4, recordedAt: '2026-10-22T00:00:00Z' };
    expect(dutyForShipment(record).avgSpeedMph).toBe(48);
    record.inputRevision++;
    expect(dutyForShipment(record).avgSpeedMph).toBe(55);
  });
});
