import { describe, it, expect } from 'vitest';
import { calculateHosRecap, DailyLogRecapDay } from '../src/engine/hosRecap';

describe('FMCSA 8-Day Rolling Cycle Hours Recap Engine', () => {
  it('correctly aggregates 8-day rolling on-duty hours and computes remaining cycle', () => {
    const recap = calculateHosRecap();

    // Default history: 11 + 9 + 11 + 9.5 + 10 + 7 + 7 + 5 = 69.5 hours
    expect(recap.totalOnDutyLast8Days).toBe(69.5);
    expect(recap.cycleHoursRemaining).toBe(0.5);
    expect(recap.cycleViolation).toBe(false);
  });

  it('correctly calculates hours regained at midnight from Day 1 drop-off', () => {
    const recap = calculateHosRecap();

    // Day 1 total on-duty hours were 11.0, so at midnight the driver regains 11.0 hours
    expect(recap.hoursRegainedTonightMidnight).toBe(11.0);

    // Remaining after Day 1 drops off = 70.0 - (69.5 - 11.0) = 70.0 - 58.5 = 11.5 hours
    expect(recap.projectedAvailableTomorrow).toBe(11.5);
  });

  it('detects statutory cycle violation when total hours exceed 70.0', () => {
    const heavyLogs: DailyLogRecapDay[] = [
      { dayIndex: 1, dateStr: 'D-7', drivingHours: 9, onDutyNotDrivingHours: 1, totalOnDutyHours: 10 },
      { dayIndex: 2, dateStr: 'D-6', drivingHours: 9, onDutyNotDrivingHours: 1, totalOnDutyHours: 10 },
      { dayIndex: 3, dateStr: 'D-5', drivingHours: 9, onDutyNotDrivingHours: 1, totalOnDutyHours: 10 },
      { dayIndex: 4, dateStr: 'D-4', drivingHours: 9, onDutyNotDrivingHours: 1, totalOnDutyHours: 10 },
      { dayIndex: 5, dateStr: 'D-3', drivingHours: 9, onDutyNotDrivingHours: 1, totalOnDutyHours: 10 },
      { dayIndex: 6, dateStr: 'D-2', drivingHours: 9, onDutyNotDrivingHours: 1, totalOnDutyHours: 10 },
      { dayIndex: 7, dateStr: 'D-1', drivingHours: 9, onDutyNotDrivingHours: 1, totalOnDutyHours: 10 },
      { dayIndex: 8, dateStr: 'D-0', drivingHours: 4, onDutyNotDrivingHours: 1, totalOnDutyHours: 5 },
    ]; // Total = 75.0 hours

    const recap = calculateHosRecap(heavyLogs, '70h_8d', 10);
    expect(recap.totalOnDutyLast8Days).toBe(75.0);
    expect(recap.cycleViolation).toBe(true);
    expect(recap.cycleHoursRemaining).toBe(0);
    expect(recap.restart34hRecommended).toBe(true);
  });

  it('provides corridor truck parking waypoint availability data', () => {
    const recap = calculateHosRecap();
    expect(recap.nearbyRestStops.length).toBeGreaterThan(0);
    const walcott = recap.nearbyRestStops.find((rs) => rs.id === 'RS-01');
    expect(walcott).toBeDefined();
    expect(walcott?.totalTruckSpots).toBe(900);
    expect(walcott?.hasShorePower).toBe(true);
  });
});
