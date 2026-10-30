/**
 * FMCSA Part 395 Split Sleeper Berth & 8-Day Rolling Hours Recap Engine.
 * Product 03 — HOS Compliance & Interstate Corridor Legality Planner
 *
 * Implements the 2020 FMCSA Hours of Service Final Rule for:
 * 1. 8/2 and 7/3 Split Sleeper Berth provisions (49 CFR § 395.1(g))
 * 2. 8-Day Rolling 70-Hour Duty Cycle Recap & 34-hour restart audit (49 CFR § 395.3(b))
 */

export interface SplitSleeperPeriod {
  periodType: 'sleeper_long' | 'rest_short';
  durationHours: number;
  isSleeperBerth: boolean;
}

export interface SplitSleeperEvaluation {
  isQualifyingSplit: boolean;
  splitPattern: '8/2' | '7/3' | 'custom_valid' | 'invalid';
  totalRestHours: number;
  longerPeriodHours: number;
  shorterPeriodHours: number;
  pauseDutyClockHours: number;
  explanation: string;
}

export interface DayRecapItem {
  dayIndex: number;
  dateStr: string;
  drivingHours: number;
  onDutyNotDrivingHours: number;
  totalOnDutyHours: number;
  offDutyHours: number;
  has34HourRestart: boolean;
  hoursWorkedPast7Days: number;
  hoursAvailableToday: number;
  hoursRegainedAtMidnight: number;
  isViolation: boolean;
}

export interface RollingRecapSummary {
  cycleType: '70_hour_8_day';
  days: DayRecapItem[];
  totalCycleHoursUsed: number;
  currentAvailableHours: number;
  projectedHoursTomorrow: number;
  restartDetected: boolean;
  isLegalCycle: boolean;
}

/**
 * Evaluates whether two rest periods constitute a legal FMCSA 8/2 or 7/3 Split Sleeper pair.
 */
export function evaluateSplitSleeper(
  period1: { durationHours: number; isSleeperBerth: boolean },
  period2: { durationHours: number; isSleeperBerth: boolean }
): SplitSleeperEvaluation {
  const periods = [period1, period2].sort((a, b) => b.durationHours - a.durationHours);
  const longer = periods[0];
  const shorter = periods[1];

  const totalRest = longer.durationHours + shorter.durationHours;

  // Requirement 1: Total rest must be at least 10 hours
  if (totalRest < 10.0) {
    return {
      isQualifyingSplit: false,
      splitPattern: 'invalid',
      totalRestHours: totalRest,
      longerPeriodHours: longer.durationHours,
      shorterPeriodHours: shorter.durationHours,
      pauseDutyClockHours: 0,
      explanation: `Total rest (${totalRest.toFixed(1)} hrs) is under the 10.0-hour statutory threshold.`,
    };
  }

  // Requirement 2: Longer period must be at least 7 hours and strictly in Sleeper Berth
  if (longer.durationHours < 7.0 || !longer.isSleeperBerth) {
    return {
      isQualifyingSplit: false,
      splitPattern: 'invalid',
      totalRestHours: totalRest,
      longerPeriodHours: longer.durationHours,
      shorterPeriodHours: shorter.durationHours,
      pauseDutyClockHours: 0,
      explanation: `Longer rest period (${longer.durationHours.toFixed(1)} hrs) must be at least 7.0 consecutive hours inside the sleeper berth.`,
    };
  }

  // Requirement 3: Shorter period must be at least 2 hours (sleeper or off-duty)
  if (shorter.durationHours < 2.0) {
    return {
      isQualifyingSplit: false,
      splitPattern: 'invalid',
      totalRestHours: totalRest,
      longerPeriodHours: longer.durationHours,
      shorterPeriodHours: shorter.durationHours,
      pauseDutyClockHours: 0,
      explanation: `Shorter rest period (${shorter.durationHours.toFixed(1)} hrs) must be at least 2.0 consecutive hours.`,
    };
  }

  // Determine split pattern
  let pattern: '8/2' | '7/3' | 'custom_valid' = 'custom_valid';
  if (longer.durationHours >= 8.0 && shorter.durationHours >= 2.0) {
    pattern = '8/2';
  } else if (longer.durationHours >= 7.0 && shorter.durationHours >= 3.0) {
    pattern = '7/3';
  }

  return {
    isQualifyingSplit: true,
    splitPattern: pattern,
    totalRestHours: totalRest,
    longerPeriodHours: longer.durationHours,
    shorterPeriodHours: shorter.durationHours,
    pauseDutyClockHours: totalRest,
    explanation: `Legal FMCSA Part 395.1(g) ${pattern} split: pauses 14-hr duty clock for ${totalRest.toFixed(1)} qualifying rest hours.`,
  };
}

/**
 * Calculates rolling 8-day 70-hour recap table.
 */
export function calculateRolling70HourRecap(
  dailyDutyLogs: {
    dayIndex: number;
    dateStr?: string;
    drivingHours: number;
    onDutyNotDrivingHours: number;
    offDutyHours: number;
  }[]
): RollingRecapSummary {
  const days: DayRecapItem[] = [];
  let restartActive = false;

  dailyDutyLogs.forEach((log, idx) => {
    const totalOnDuty = log.drivingHours + log.onDutyNotDrivingHours;
    const has34Restart = log.offDutyHours >= 34.0;
    if (has34Restart) {
      restartActive = true;
    }

    // Sum previous 7 days (or back to restart)
    const windowStart = Math.max(0, idx - 6);
    let past7Sum = 0;
    for (let w = windowStart; w <= idx; w++) {
      past7Sum += (dailyDutyLogs[w].drivingHours + dailyDutyLogs[w].onDutyNotDrivingHours);
    }

    const hoursAvailableToday = Math.max(0, Math.round((70 - (past7Sum - totalOnDuty)) * 10) / 10);
    const oldestDayIndex = idx - 7;
    const hoursRegainedAtMidnight = oldestDayIndex >= 0
      ? (dailyDutyLogs[oldestDayIndex].drivingHours + dailyDutyLogs[oldestDayIndex].onDutyNotDrivingHours)
      : 0;

    const isViolation = past7Sum > 70.0;

    days.push({
      dayIndex: log.dayIndex,
      dateStr: log.dateStr ?? `Day ${log.dayIndex}`,
      drivingHours: log.drivingHours,
      onDutyNotDrivingHours: log.onDutyNotDrivingHours,
      totalOnDutyHours: totalOnDuty,
      offDutyHours: log.offDutyHours,
      has34HourRestart: has34Restart,
      hoursWorkedPast7Days: Math.round(past7Sum * 10) / 10,
      hoursAvailableToday,
      hoursRegainedAtMidnight: Math.round(hoursRegainedAtMidnight * 10) / 10,
      isViolation,
    });
  });

  const latestDay = days[days.length - 1];
  const totalCycleHoursUsed = latestDay ? latestDay.hoursWorkedPast7Days : 0;
  const currentAvailableHours = Math.max(0, Math.round((70 - totalCycleHoursUsed) * 10) / 10);
  const projectedHoursTomorrow = latestDay ? Math.min(70, currentAvailableHours + latestDay.hoursRegainedAtMidnight) : 70;

  return {
    cycleType: '70_hour_8_day',
    days,
    totalCycleHoursUsed,
    currentAvailableHours,
    projectedHoursTomorrow: Math.round(projectedHoursTomorrow * 10) / 10,
    restartDetected: restartActive,
    isLegalCycle: !days.some((d) => d.isViolation),
  };
}
