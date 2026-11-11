import { describe, expect, it } from 'vitest';
// The canonical Node domain module is intentionally shared with the local service.
// @ts-expect-error JavaScript domain has no TypeScript declaration file.
import { applyCommand, createShipment, dispatchBlockers } from '../../../packages/shipment-flow/src/domain.mjs';
import { stageState } from '../../../packages/shipment-flow/src/shipmentViewModel';
import { planCorridorItinerary } from '../src/engine/corridor';
import { auditDutyIntervals } from '../src/engine/hos';
import { dutyForShipment, intervalsForPlan, resultForDutyPlan } from '../src/engine/shipmentAdapter';
import type { Shipment } from '../src/suite/types';

describe('reviewed duty handoff to shipment domain', () => {
  it('retains exact scenario evidence while blocking dispatch and marks it stale after amendment', () => {
    const now = '2026-11-06T12:00:00.000Z';
    const shipment: Shipment = createShipment('Duty review handoff', now);
    const input = dutyForShipment(shipment);
    const plan = planCorridorItinerary(input);
    const audit = auditDutyIntervals(intervalsForPlan(plan));
    const result = resultForDutyPlan(shipment, input, plan, audit);
    const reviewCommand = { type: 'evaluate', productId: 'product-03-hos-planner', operationId: 'duty-review-1', expectedRevision: shipment.revision, payload: { stage: 'hos', result } };
    const saved: Shipment = applyCommand(shipment, reviewCommand, now);
    expect(saved.results.hos?.details.nativeItinerary).toEqual(plan);
    expect(saved.events.at(-1)?.payload?.result).toEqual(result);
    expect(stageState(saved, 'hos', now)).toBe('indeterminate');
    expect(dispatchBlockers(saved, now)).toContain('hos: duty assessment indeterminate');
    expect(() => applyCommand(saved, { type: 'dispatch', productId: 'command-center-portal', operationId: 'dispatch', expectedRevision: saved.revision }, now)).toThrow(/Dispatch blocked/);
    const amended: Shipment = applyCommand(saved, { type: 'amend', productId: 'command-center-portal', operationId: 'amend', expectedRevision: saved.revision, payload: { input: { ...saved.input, loadedMiles: saved.input.loadedMiles + 1 } } }, now);
    expect(stageState(amended, 'hos', now)).toBe('stale');
    expect(amended.results.hos?.details.nativeInputs).toEqual(input);
  });
});
