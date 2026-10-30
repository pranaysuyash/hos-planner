import { describe, it, expect } from 'vitest';
import { evaluateSplitSleeper, calculateRolling70HourRecap } from '../src/engine/splitSleeper';

describe('FMCSA Split Sleeper Berth Engine (49 CFR § 395.1(g))', () => {
  it('approves a legal 8/2 split (8 hrs sleeper + 2 hrs off-duty)', () => {
    const result = evaluateSplitSleeper(
      { durationHours: 8.0, isSleeperBerth: true },
      { durationHours: 2.0, isSleeperBerth: false }
    );
    expect(result.isQualifyingSplit).toBe(true);
    expect(result.splitPattern).toBe('8/2');
    expect(result.totalRestHours).toBe(10.0);
    expect(result.pauseDutyClockHours).toBe(10.0);
  });

  it('approves a legal 7/3 split (7 hrs sleeper + 3 hrs off-duty)', () => {
    const result = evaluateSplitSleeper(
      { durationHours: 7.0, isSleeperBerth: true },
      { durationHours: 3.0, isSleeperBerth: false }
    );
    expect(result.isQualifyingSplit).toBe(true);
    expect(result.splitPattern).toBe('7/3');
  });

  it('rejects a split under 10 hours total (e.g. 7 hrs sleeper + 2 hrs off-duty)', () => {
    const result = evaluateSplitSleeper(
      { durationHours: 7.0, isSleeperBerth: true },
      { durationHours: 2.0, isSleeperBerth: false }
    );
    expect(result.isQualifyingSplit).toBe(false);
    expect(result.explanation).toContain('under the 10.0-hour statutory threshold');
  });

  it('rejects a split where the longer period is not in the sleeper berth', () => {
    const result = evaluateSplitSleeper(
      { durationHours: 8.0, isSleeperBerth: false }, // off duty, not sleeper berth!
      { durationHours: 2.0, isSleeperBerth: true }
    );
    expect(result.isQualifyingSplit).toBe(false);
    expect(result.explanation).toContain('must be at least 7.0 consecutive hours inside the sleeper berth');
  });
});

describe('8-Day Rolling 70-Hour Recap Engine (49 CFR § 395.3(b))', () => {
  it('correctly tracks daily accumulated hours and calculates hours regained at midnight', () => {
    const sampleLogs = [
      { dayIndex: 1, drivingHours: 9.0, onDutyNotDrivingHours: 1.5, offDutyHours: 13.5 }, // 10.5 on duty
      { dayIndex: 2, drivingHours: 8.0, onDutyNotDrivingHours: 2.0, offDutyHours: 14.0 }, // 10.0
      { dayIndex: 3, drivingHours: 9.0, onDutyNotDrivingHours: 1.0, offDutyHours: 14.0 }, // 10.0
      { dayIndex: 4, drivingHours: 7.5, onDutyNotDrivingHours: 1.5, offDutyHours: 15.0 }, // 9.0
      { dayIndex: 5, drivingHours: 8.0, onDutyNotDrivingHours: 1.0, offDutyHours: 15.0 }, // 9.0
      { dayIndex: 6, drivingHours: 6.0, onDutyNotDrivingHours: 2.0, offDutyHours: 16.0 }, // 8.0
      { dayIndex: 7, drivingHours: 7.0, onDutyNotDrivingHours: 1.0, offDutyHours: 16.0 }, // 8.0
      { dayIndex: 8, drivingHours: 5.0, onDutyNotDrivingHours: 0.5, offDutyHours: 18.5 }, // 5.5
    ];

    const recap = calculateRolling70HourRecap(sampleLogs);
    expect(recap.isLegalCycle).toBe(true);
    // Day 8 past 7 days sum = Day 2 to Day 8 = 10+10+9+9+8+8+5.5 = 59.5 hrs
    expect(recap.totalCycleHoursUsed).toBe(59.5);
    expect(recap.currentAvailableHours).toBe(10.5);
    // At midnight after Day 8, Day 1 (10.5 hrs) rolls off:
    expect(recap.days[7].hoursRegainedAtMidnight).toBe(10.5);
  });
});
