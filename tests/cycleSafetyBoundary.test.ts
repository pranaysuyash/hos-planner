import { describe, expect, it } from 'vitest';
import { auditDutyIntervals, summarizeAuditAssessments } from '../src/engine/hos';
import { planCorridorItinerary } from '../src/engine/corridor';
import { hosScenarioPayload } from '../src/engine/platformBus';
import { intervalsForPlan, resultForDutyPlan, type DutyDraft } from '../src/engine/shipmentAdapter';
import type { DutyInterval } from '../src/engine/types';
import type { Shipment } from '../src/suite/types';

const interval = (status: DutyInterval['status'], startMinutes: number, durationMinutes: number): DutyInterval => ({ status, startMinutes, durationMinutes, location: 'Fixture', remark: 'Scenario only' });

describe('cycle assessment safety boundary', () => {
  it('keeps a valid shift useful but does not certify an unknown cycle', () => {
    const audit = auditDutyIntervals([interval('DRIVING', 0, 60)]);
    expect(audit.shiftChecksPassed).toBe(true);
    expect(audit.cycleAssessment).toBe('indeterminate');
    expect(audit.assessment).toBe('indeterminate');
    expect(audit.isCompliant).toBe(false);
    expect(audit.assessmentReasons.join(' ')).toMatch(/cycle/i);
    expect(audit.violations).toEqual([]);
  });

  it('does not invent a cycle driving violation for on-duty non-driving work', () => {
    const audit = auditDutyIntervals([interval('ON_DUTY_NOT_DRIVING', 0, 71 * 60)]);
    expect(audit.violations.some(v => v.rule === '70_HOUR_CYCLE')).toBe(false);
    expect(audit.cycleAssessment).toBe('indeterminate');
    expect(audit.cycleIllustration).toEqual({ peakOnDutyMinutes: 71 * 60, assumes34HourRestart: true });
  });

  it('preserves the old restart arithmetic only as a labeled illustration', () => {
    const audit = auditDutyIntervals([
      interval('ON_DUTY_NOT_DRIVING', 0, 50 * 60),
      interval('OFF_DUTY', 50 * 60, 34 * 60),
      interval('ON_DUTY_NOT_DRIVING', 84 * 60, 40 * 60),
    ]);
    expect(audit.cycleIllustration).toEqual({ peakOnDutyMinutes: 50 * 60, assumes34HourRestart: true });
    expect(audit.assessment).toBe('indeterminate');
    expect(audit.violations.some(v => v.rule === '70_HOUR_CYCLE')).toBe(false);
  });

  it('does not infer a claimed restart or cycle status from off-duty duration alone', () => {
    const audit = auditDutyIntervals([interval('OFF_DUTY', 0, 34 * 60), interval('DRIVING', 34 * 60, 60)]);
    expect(audit.shiftChecksPassed).toBe(true);
    expect(audit.cycleAssessment).toBe('indeterminate');
    expect(audit.isCompliant).toBe(false);
  });

  it('keeps shift findings while the separate cycle remains unknown', () => {
    const audit = auditDutyIntervals([interval('DRIVING', 0, 12 * 60)]);
    expect(audit.shiftChecksPassed).toBe(false);
    expect(audit.violations.some(v => v.rule === '11_HOUR_DRIVE')).toBe(true);
    expect(audit.assessment).toBe('indeterminate');
  });

  it('deduplicates missing-cycle explanations without discarding findings', () => {
    const audit = auditDutyIntervals([interval('DRIVING', 0, 12 * 60)]);
    const combined = summarizeAuditAssessments([audit, audit]);
    expect(combined.assessmentReasons).toHaveLength(1);
    expect(combined.violations).toHaveLength(audit.violations.length * 2);
  });

  it('fails closed at the broadcast and connected shipment boundary', () => {
    const input: DutyDraft = { origin: 'A', destination: 'B', distanceMiles: 300, avgSpeedMph: 50, driverMode: 'solo', priorRestHours: 10 };
    const plan = planCorridorItinerary(input);
    const audit = auditDutyIntervals(intervalsForPlan(plan));
    const shipment = { id: 'scenario', inputRevision: 1, input: { ...input, loadedMiles: 300, driverId: 'declared' }, results: {} } as unknown as Shipment;
    expect(plan.isLegal).toBe(false);
    expect(hosScenarioPayload('scenario', plan)).toMatchObject({ assessment: 'indeterminate', isLegal: false });
    expect(resultForDutyPlan(shipment, input, plan, audit)).toMatchObject({ ok: false, details: { assessment: 'indeterminate', isLegal: false } });
  });
});
