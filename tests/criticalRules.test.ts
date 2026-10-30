import { describe, expect, it } from 'vitest';
import { auditDutyIntervals } from '../src/engine/hos';
import type { DutyInterval } from '../src/engine/types';

function duty(parts: [DutyInterval['status'], number][]): DutyInterval[] {
  let minute = 0;
  return parts.map(([status, durationMinutes]) => {
    const interval = { status, durationMinutes, startMinutes: minute, location: 'Regression fixture', remark: 'Independent rule example' };
    minute += durationMinutes;
    return interval;
  });
}

describe('Critical duty eligibility boundaries', () => {
  it('does not grant a fresh shift after an unpaired seven-hour sleeper', () => {
    const audit = auditDutyIntervals(duty([
      ['DRIVING', 480], ['OFF_DUTY', 30], ['DRIVING', 180],
      ['SLEEPER_BERTH', 420], ['DRIVING', 60],
    ]));
    expect(audit.violations.some(v => v.rule === '11_HOUR_DRIVE')).toBe(true);
  });

  it('counts a consecutive mixed-status thirty-minute interruption as a break', () => {
    const audit = auditDutyIntervals(duty([
      ['DRIVING', 480], ['ON_DUTY_NOT_DRIVING', 15], ['OFF_DUTY', 15], ['DRIVING', 60],
    ]));
    expect(audit.isCompliant).toBe(true);
  });

  it('does not combine nonconsecutive short interruptions', () => {
    const audit = auditDutyIntervals(duty([
      ['DRIVING', 240], ['OFF_DUTY', 15], ['DRIVING', 240], ['OFF_DUTY', 15], ['DRIVING', 30],
    ]));
    expect(audit.violations.some(v => v.rule === '30_MINUTE_BREAK')).toBe(true);
  });
});
