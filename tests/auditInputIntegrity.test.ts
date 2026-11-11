import { describe, expect, it } from 'vitest';
import { auditDutyIntervals, summarizeAuditAssessments } from '../src/engine/hos';
import { planCorridorItinerary } from '../src/engine/corridor';
import { hosScenarioPayload } from '../src/engine/platformBus';
import { dutyReportMessages, dutyReportStatus } from '../src/ui/EldAuditModal';
import type { DutyInterval } from '../src/engine/types';

const duty = (status: DutyInterval['status'], startMinutes: number, durationMinutes: number): DutyInterval => ({
  status, startMinutes, durationMinutes, location: 'Example', remark: 'Synthetic history',
});

describe('duty history assessment boundary', () => {
  it.each([
    ['empty', []],
    ['negative duration', [duty('DRIVING', 0, -60)]],
    ['zero duration', [duty('DRIVING', 0, 0)]],
    ['non-finite duration', [duty('DRIVING', 0, Number.NaN)]],
    ['negative start', [duty('DRIVING', -1, 60)]],
    ['non-finite start', [duty('DRIVING', Number.POSITIVE_INFINITY, 60)]],
    ['invalid status', [duty('NOT_A_STATUS' as DutyInterval['status'], 0, 60)]],
    ['overlap', [duty('DRIVING', 0, 60), duty('OFF_DUTY', 30, 60)]],
    ['out of order', [duty('DRIVING', 60, 30), duty('OFF_DUTY', 0, 30)]],
    ['missing time', [duty('DRIVING', 0, 60), duty('OFF_DUTY', 90, 60)]],
  ])('does not assess %s as compliant or invent a violation', (_name, intervals) => {
    const audit = auditDutyIntervals(intervals);
    expect(audit.isCompliant).toBe(false);
    expect(audit.assessment).toBe('indeterminate');
    expect(audit.assessmentReasons.length).toBeGreaterThan(0);
    expect(audit.violations).toEqual([]);
    expect(audit.totalDrivingMinutes).toBeNull();
    expect(audit.totalOnDutyMinutes).toBeNull();
    expect(audit.totalOffDutyMinutes).toBeNull();
  });

  it('retains assessment and totals for a continuous supported example', () => {
    const audit = auditDutyIntervals([duty('DRIVING', 0, 120), duty('OFF_DUTY', 120, 30)]);
    expect(audit.assessment).toBe('indeterminate');
    expect(audit.shiftChecksPassed).toBe(true);
    expect(audit.totalDrivingMinutes).toBe(120);
    expect(audit.assessmentReasons.join(' ')).toMatch(/cycle/i);
  });

  it('uses the same continuity tolerance when accumulating a split non-driving break', () => {
    const audit = auditDutyIntervals([duty('DRIVING', 0, 480), duty('OFF_DUTY', 480, 15), duty('OFF_DUTY', 495.00000001, 15), duty('DRIVING', 510.00000001, 60)]);
    expect(audit.assessment).toBe('indeterminate');
    expect(audit.shiftChecksPassed).toBe(true);
    expect(audit.violations.some(v => v.rule === '30_MINUTE_BREAK')).toBe(false);
  });

  it('retains an indeterminate audit without presenting it as a modeled violation', () => {
    const invalid = auditDutyIntervals([]);
    const combined = summarizeAuditAssessments([invalid]);
    expect(combined.assessment).toBe('indeterminate');
    expect(combined.assessmentReasons).toEqual(invalid.assessmentReasons);
    expect(combined.violations).toEqual([]);
    expect(combined.isLegal).toBe(false);
  });

  it('retains modeled violations alongside an indeterminate team audit without labeling the overall assessment legal', () => {
    const unknown = auditDutyIntervals([]);
    const finding = auditDutyIntervals([duty('DRIVING', 0, 700)]);
    const combined = summarizeAuditAssessments([finding, unknown]);
    expect(combined.assessment).toBe('indeterminate');
    expect(combined.violations.length).toBeGreaterThan(0);
    expect(combined.isLegal).toBe(false);
    expect(summarizeAuditAssessments([]).assessment).toBe('indeterminate');
  });

  it('marks local broadcasts as scenarios and preserves indeterminate assessments', () => {
    const plan = planCorridorItinerary({ origin: 'A', destination: 'B', distanceMiles: 300, avgSpeedMph: 50, driverMode: 'solo' });
    const modeled = hosScenarioPayload('test', plan);
    expect(modeled).toMatchObject({ schemaVersion: 1, source: 'scenario_model', assessment: 'indeterminate', isLegal: false });
    const unknown = hosScenarioPayload('test', { ...plan, assessment: 'indeterminate', assessmentReasons: ['Incomplete history'] });
    expect(unknown).toMatchObject({ assessment: 'indeterminate', assessmentReasons: ['Incomplete history'], isLegal: false });
  });

  it('keeps team itinerary uncertainty visible when the selected driver audit is modeled', () => {
    const plan = planCorridorItinerary({ origin: 'A', destination: 'B', distanceMiles: 300, avgSpeedMph: 50, driverMode: 'solo' });
    const audit = auditDutyIntervals([duty('DRIVING', 0, 60)]);
    const status = dutyReportStatus({ ...plan, assessment: 'indeterminate', assessmentReasons: ['Other driver history missing'], isLegal: false }, audit);
    expect(status).toContain('Cannot assess');
    expect(status).toContain('Other driver history missing');
    expect(status).not.toContain('detected violations');
    const messages = dutyReportMessages({ ...plan, assessment: 'indeterminate', assessmentReasons: ['Other driver history missing'], isLegal: false }, audit);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Other driver history missing');
    expect(messages[0]).toContain('Cycle status is unknown');
  });
});
