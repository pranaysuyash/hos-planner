/**
 * FMCSA Part 395 Hours of Service (HOS) Compliance Engine.
 * Evaluates driver shift limits, 11-hr driving caps, 14-hr duty windows,
 * mandatory 30-min breaks, and 70-hr rolling cycles.
 */

import type { HosViolation, DutyInterval } from './types';

export const HOS_LIMITS = {
  MAX_DRIVE_HOURS_PER_SHIFT: 11.0,
  MAX_ON_DUTY_HOURS_PER_SHIFT: 14.0,
  MAX_DRIVE_HOURS_BEFORE_BREAK: 8.0,
  MIN_REST_BREAK_MINUTES: 30,
  MIN_CONSECUTIVE_OFF_DUTY_HOURS: 10.0,
  MAX_CYCLE_HOURS_70_8: 70.0,
  MIN_CYCLE_RESTART_HOURS: 34.0,
};

/**
 * Checks a sequence of duty intervals for regulatory violations.
 */
export function auditDutyIntervals(intervals: DutyInterval[]): {
  isCompliant: boolean;
  violations: HosViolation[];
  totalDrivingMinutes: number;
  totalOnDutyMinutes: number;
  totalOffDutyMinutes: number;
} {
  const violations: HosViolation[] = [];
  let drivingMinutesInShift = 0;
  let onDutyMinutesInShift = 0;
  let drivingSinceLastBreak = 0;
  let consecutiveOffDutyMinutes = 0;
  let cumulativeCycleOnDutyMinutes = 0;

  let totalDriving = 0;
  let totalOnDuty = 0;
  let totalOffDuty = 0;

  for (let i = 0; i < intervals.length; i++) {
    const it = intervals[i];
    const dur = it.durationMinutes;

    if (it.status === 'DRIVING') {
      totalDriving += dur;
      consecutiveOffDutyMinutes = 0;
      drivingMinutesInShift += dur;
      onDutyMinutesInShift += dur;
      drivingSinceLastBreak += dur;
      cumulativeCycleOnDutyMinutes += dur;

      // 1. Audit 11-hour driving rule
      if (drivingMinutesInShift > HOS_LIMITS.MAX_DRIVE_HOURS_PER_SHIFT * 60) {
        violations.push({
          rule: '11_HOUR_DRIVE',
          severity: 'CRITICAL_OOS',
          occurredAtMile: 0,
          occurredAtTimeMinutes: it.startMinutes + dur,
          message: `11-Hour Driving Rule Exceeded: ${(drivingMinutesInShift / 60).toFixed(1)} driving hours without 10-hour rest.`,
          statutoryRemedy: 'Driver must immediately take 10 consecutive hours Off Duty or in Sleeper Berth before driving.',
        });
      }

      // 2. Audit 14-hour shift window
      if (onDutyMinutesInShift > HOS_LIMITS.MAX_ON_DUTY_HOURS_PER_SHIFT * 60) {
        violations.push({
          rule: '14_HOUR_WINDOW',
          severity: 'CRITICAL_OOS',
          occurredAtMile: 0,
          occurredAtTimeMinutes: it.startMinutes + dur,
          message: `14-Hour Shift Window Exceeded: Driving occurred at ${(onDutyMinutesInShift / 60).toFixed(1)} hours into shift.`,
          statutoryRemedy: 'Driving after the 14th consecutive hour is prohibited under § 395.3(a)(2). Take 10 hours rest.',
        });
      }

      // 3. Audit 30-minute rest break requirement
      if (drivingSinceLastBreak > HOS_LIMITS.MAX_DRIVE_HOURS_BEFORE_BREAK * 60) {
        violations.push({
          rule: '30_MINUTE_BREAK',
          severity: 'VIOLATION',
          occurredAtMile: 0,
          occurredAtTimeMinutes: it.startMinutes + dur,
          message: `30-Minute Rest Break Required: ${(drivingSinceLastBreak / 60).toFixed(1)} cumulative driving hours without break.`,
          statutoryRemedy: 'Must log at least 30 consecutive minutes Off Duty, Sleeper Berth, or On Duty Not Driving.',
        });
      }
    } else if (it.status === 'ON_DUTY_NOT_DRIVING') {
      totalOnDuty += dur;
      onDutyMinutesInShift += dur;
      cumulativeCycleOnDutyMinutes += dur;
      consecutiveOffDutyMinutes = 0;

      // If on-duty break >= 30m, satisfies 30-minute break rule under 2020 FMCSA rule reform
      if (dur >= HOS_LIMITS.MIN_REST_BREAK_MINUTES) {
        drivingSinceLastBreak = 0;
      }
    } else {
      // OFF_DUTY or SLEEPER_BERTH
      totalOffDuty += dur;
      consecutiveOffDutyMinutes += dur;

      // Rest >= 30m resets 30m break clock
      if (dur >= HOS_LIMITS.MIN_REST_BREAK_MINUTES) {
        drivingSinceLastBreak = 0;
      }

      // 10 consecutive hours off-duty resets the 11-hr and 14-hr shift clocks
      if (consecutiveOffDutyMinutes >= HOS_LIMITS.MIN_CONSECUTIVE_OFF_DUTY_HOURS * 60) {
        drivingMinutesInShift = 0;
        onDutyMinutesInShift = 0;
        drivingSinceLastBreak = 0;
      }

      // 34 consecutive hours off-duty resets the 70-hr 8-day rolling cycle
      if (consecutiveOffDutyMinutes >= HOS_LIMITS.MIN_CYCLE_RESTART_HOURS * 60) {
        cumulativeCycleOnDutyMinutes = 0;
      }
    }

    // 4. Audit 70-hour cycle limit
    if (cumulativeCycleOnDutyMinutes > HOS_LIMITS.MAX_CYCLE_HOURS_70_8 * 60) {
      violations.push({
        rule: '70_HOUR_CYCLE',
        severity: 'CRITICAL_OOS',
        occurredAtMile: 0,
        occurredAtTimeMinutes: it.startMinutes + dur,
        message: `70-Hour / 8-Day Limit Exceeded: ${(cumulativeCycleOnDutyMinutes / 60).toFixed(1)} on-duty hours accumulated.`,
        statutoryRemedy: 'Must take 34-hour restart or wait for rolling cycle hours to roll off.',
      });
    }
  }

  return {
    isCompliant: violations.length === 0,
    violations,
    totalDrivingMinutes: totalDriving,
    totalOnDutyMinutes: totalOnDuty,
    totalOffDutyMinutes: totalOffDuty,
  };
}
