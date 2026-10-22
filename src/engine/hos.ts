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
  let shiftStartMinutes: number | null = null;
  let drivingSinceLastBreak = 0;
  let consecutiveOffDutyMinutes = 0;
  let consecutiveSleeperMinutes = 0;

  // History buffer of on-duty minutes for rolling 8-day (192-hour) calculation
  const onDutyEvents: { timeMinutes: number; durationMinutes: number }[] = [];

  let totalDriving = 0;
  let totalOnDuty = 0;
  let totalOffDuty = 0;

  for (let i = 0; i < intervals.length; i++) {
    const it = intervals[i];
    const dur = it.durationMinutes;

    if (it.status === 'DRIVING') {
      totalDriving += dur;
      consecutiveOffDutyMinutes = 0;
      consecutiveSleeperMinutes = 0;

      // Start shift window if not currently active
      if (shiftStartMinutes === null) {
        shiftStartMinutes = it.startMinutes;
      }

      drivingMinutesInShift += dur;
      onDutyMinutesInShift += dur;
      drivingSinceLastBreak += dur;
      onDutyEvents.push({ timeMinutes: it.startMinutes + dur, durationMinutes: dur });

      // 1. Audit 11-hour driving rule (§ 395.3(a)(3)(i))
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

      // 2. Audit 14-consecutive-hour shift window (§ 395.3(a)(2))
      // Driving is prohibited beyond the 14th consecutive hour from shift duty start.
      const elapsedShiftMinutes = (it.startMinutes + dur) - shiftStartMinutes;
      if (elapsedShiftMinutes > HOS_LIMITS.MAX_ON_DUTY_HOURS_PER_SHIFT * 60) {
        violations.push({
          rule: '14_HOUR_WINDOW',
          severity: 'CRITICAL_OOS',
          occurredAtMile: 0,
          occurredAtTimeMinutes: it.startMinutes + dur,
          message: `14-Hour Consecutive Shift Window Exceeded: Driving occurred at ${(elapsedShiftMinutes / 60).toFixed(1)} consecutive hours after shift start.`,
          statutoryRemedy: 'Driving after the 14th consecutive hour is prohibited under § 395.3(a)(2). Take 10 hours rest.',
        });
      }

      // 3. Audit 30-minute rest break requirement (§ 395.3(a)(3)(ii))
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
      consecutiveOffDutyMinutes = 0;
      consecutiveSleeperMinutes = 0;

      if (shiftStartMinutes === null) {
        shiftStartMinutes = it.startMinutes;
      }

      onDutyMinutesInShift += dur;
      onDutyEvents.push({ timeMinutes: it.startMinutes + dur, durationMinutes: dur });

      // If on-duty break >= 30m, satisfies 30-minute break rule under 2020 FMCSA rule reform
      if (dur >= HOS_LIMITS.MIN_REST_BREAK_MINUTES) {
        drivingSinceLastBreak = 0;
      }
    } else {
      // OFF_DUTY or SLEEPER_BERTH
      totalOffDuty += dur;
      consecutiveOffDutyMinutes += dur;
      if (it.status === 'SLEEPER_BERTH') {
        consecutiveSleeperMinutes += dur;
      } else {
        consecutiveSleeperMinutes = 0;
      }

      // Rest >= 30m resets 30m break clock
      if (dur >= HOS_LIMITS.MIN_REST_BREAK_MINUTES) {
        drivingSinceLastBreak = 0;
      }

      // 10 consecutive hours off-duty resets the 11-hr drive cap and 14-consecutive-hour shift window (§ 395.3(a))
      // Or qualifying sleeper berth period of >= 7 consecutive hours in sleeper berth (§ 395.1(g) 2020 sleeper split rule for team operations)
      if (
        consecutiveOffDutyMinutes >= HOS_LIMITS.MIN_CONSECUTIVE_OFF_DUTY_HOURS * 60 ||
        consecutiveSleeperMinutes >= 7 * 60
      ) {
        drivingMinutesInShift = 0;
        onDutyMinutesInShift = 0;
        shiftStartMinutes = null;
        drivingSinceLastBreak = 0;
      }

      // 34 consecutive hours off-duty resets the 70-hr 8-day rolling cycle restart (§ 395.3(d))
      if (consecutiveOffDutyMinutes >= HOS_LIMITS.MIN_CYCLE_RESTART_HOURS * 60) {
        onDutyEvents.length = 0; // Clear rolling cycle history
      }
    }

    // 4. Audit 70-hour / 8-day rolling cycle limit (§ 395.3(b))
    // Sum on-duty minutes within the preceding 8-day rolling window (192 hours = 11,520 minutes)
    const currentEndMinute = it.startMinutes + dur;
    const windowStartMinute = Math.max(0, currentEndMinute - (8 * 24 * 60));
    const rollingCycleMinutes = onDutyEvents
      .filter(ev => ev.timeMinutes >= windowStartMinute && ev.timeMinutes <= currentEndMinute)
      .reduce((sum, ev) => sum + ev.durationMinutes, 0);

    if (rollingCycleMinutes > HOS_LIMITS.MAX_CYCLE_HOURS_70_8 * 60 && (it.status === 'DRIVING' || it.status === 'ON_DUTY_NOT_DRIVING')) {
      violations.push({
        rule: '70_HOUR_CYCLE',
        severity: 'CRITICAL_OOS',
        occurredAtMile: 0,
        occurredAtTimeMinutes: currentEndMinute,
        message: `70-Hour / 8-Day Limit Exceeded: ${(rollingCycleMinutes / 60).toFixed(1)} on-duty hours in rolling 8-day window.`,
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
