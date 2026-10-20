import { describe, it, expect } from 'vitest';
import { auditDutyIntervals } from '../src/engine/hos';
import { planCorridorItinerary } from '../src/engine/corridor';
import type { DutyInterval } from '../src/engine/types';

describe('FMCSA Part 395 Hours of Service (HOS) Engine', () => {
  it('passes a fully compliant legal shift (8h driving, 30m break, 2h driving, 10h rest)', () => {
    const intervals: DutyInterval[] = [
      { status: 'ON_DUTY_NOT_DRIVING', startMinutes: 0, durationMinutes: 15, location: 'Terminal', remark: 'Pre-Trip' },
      { status: 'DRIVING', startMinutes: 15, durationMinutes: 420, location: 'Highway', remark: 'Drive leg 1' }, // 7 hrs
      { status: 'OFF_DUTY', startMinutes: 435, durationMinutes: 30, location: 'Travel Plaza', remark: '30m Break' },
      { status: 'DRIVING', startMinutes: 465, durationMinutes: 180, location: 'Highway', remark: 'Drive leg 2' }, // 3 hrs (total 10 hrs)
      { status: 'ON_DUTY_NOT_DRIVING', startMinutes: 645, durationMinutes: 15, location: 'Consignee', remark: 'Post-Trip' },
      { status: 'SLEEPER_BERTH', startMinutes: 660, durationMinutes: 600, location: 'Truck Stop', remark: '10h Sleeper Reset' },
    ];

    const audit = auditDutyIntervals(intervals);
    expect(audit.isCompliant).toBe(true);
    expect(audit.violations).toHaveLength(0);
    expect(audit.totalDrivingMinutes).toBe(600); // 10 hours
  });

  it('detects 11-Hour Driving Cap violation if driving exceeds 11 hours without 10h rest', () => {
    const intervals: DutyInterval[] = [
      { status: 'DRIVING', startMinutes: 0, durationMinutes: 420, location: 'Hwy', remark: 'Leg 1 (7h)' },
      { status: 'OFF_DUTY', startMinutes: 420, durationMinutes: 30, location: 'Plaza', remark: 'Break' },
      { status: 'DRIVING', startMinutes: 450, durationMinutes: 300, location: 'Hwy', remark: 'Leg 2 (5h -> Total 12h)' }, // Exceeds 11h!
    ];

    const audit = auditDutyIntervals(intervals);
    expect(audit.isCompliant).toBe(false);
    expect(audit.violations.some(v => v.rule === '11_HOUR_DRIVE')).toBe(true);
    expect(audit.violations[0].severity).toBe('CRITICAL_OOS');
  });

  it('detects 14-Hour Shift Window violation if driving occurs after 14 elapsed hours', () => {
    const intervals: DutyInterval[] = [
      { status: 'ON_DUTY_NOT_DRIVING', startMinutes: 0, durationMinutes: 600, location: 'Dock', remark: 'Shipper Delay 10h' },
      { status: 'DRIVING', startMinutes: 600, durationMinutes: 300, location: 'Hwy', remark: 'Drive 5h (End at T+15h)' },
    ];

    const audit = auditDutyIntervals(intervals);
    expect(audit.isCompliant).toBe(false);
    expect(audit.violations.some(v => v.rule === '14_HOUR_WINDOW')).toBe(true);
  });

  it('detects violation if driving > 8 hours without a 30-minute rest break', () => {
    const intervals: DutyInterval[] = [
      { status: 'DRIVING', startMinutes: 0, durationMinutes: 510, location: 'Hwy', remark: 'Continuous 8.5h drive' },
    ];

    const audit = auditDutyIntervals(intervals);
    expect(audit.isCompliant).toBe(false);
    expect(audit.violations.some(v => v.rule === '30_MINUTE_BREAK')).toBe(true);
  });
});

describe('Interstate Corridor Transit Planner', () => {
  it('correctly schedules solo corridor transit with mandatory 10h sleeper layovers', () => {
    // Chicago to Dallas: 925 miles at 55 mph = ~16.8 driving hours
    // Must include at least 1 mandatory 10h sleeper layover + 30m break
    const plan = planCorridorItinerary({
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      distanceMiles: 925,
      avgSpeedMph: 55,
      driverMode: 'solo',
    });

    expect(plan.isLegal).toBe(true);
    expect(plan.mandatorySleeperCount).toBeGreaterThanOrEqual(1);
    expect(plan.totalTransitHours).toBeGreaterThan(26.0); // 16.8 driving + 10 rest + inspection
    expect(plan.waypoints.length).toBeGreaterThan(3);

    const sleeperWaypoint = plan.waypoints.find(w => w.type === 'SLEEPER_10H_REST');
    expect(sleeperWaypoint).toBeDefined();
    expect(sleeperWaypoint?.durationMinutes).toBe(600);
  });

  it('allows continuous expedited transit for team drivers without 10h stoppage', () => {
    const teamPlan = planCorridorItinerary({
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      distanceMiles: 925,
      avgSpeedMph: 55,
      driverMode: 'team',
    });

    expect(teamPlan.isLegal).toBe(true);
    expect(teamPlan.mandatorySleeperCount).toBe(0); // No 10h truck layovers
    expect(teamPlan.totalTransitHours).toBeLessThan(18.0); // Continuous driving with driver swaps
  });
});
