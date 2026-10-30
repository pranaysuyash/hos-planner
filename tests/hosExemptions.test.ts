import { describe, it, expect } from 'vitest';
import {
  evaluateAgriculturalExemption,
  evaluateAdverseDriving,
  evaluateShortHaul16Hour,
  categorizeSpecialDutyStatus,
  calculateAirMiles,
} from '../src/engine/hosExemptions';

describe('FMCSA Part 395 Statutory HOS Exemptions Engine', () => {
  describe('Agricultural Exemption (49 CFR § 395.1(k))', () => {
    it('calculates great-circle air miles accurately', () => {
      // Chicago (41.8781, -87.6298) to Rockford IL (42.2711, -89.0940) ~ 68 air miles
      const airMiles = calculateAirMiles(41.8781, -87.6298, 42.2711, -89.094);
      expect(airMiles).toBeGreaterThan(60);
      expect(airMiles).toBeLessThan(75);
    });

    it('grants HOS clock pause within 150 air miles during harvest season for livestock', () => {
      const result = evaluateAgriculturalExemption({
        originLat: 41.8781,
        originLng: -87.6298,
        currentLat: 42.2711,
        currentLng: -89.094,
        isHarvestSeason: true,
        commodityType: 'LIVESTOCK',
      });

      expect(result.isExempt).toBe(true);
      expect(result.insideZone).toBe(true);
      expect(result.hosClockActive).toBe(false);
      expect(result.auditNote).toContain('Part 395 HOS clocks paused');
    });

    it('engages standard HOS clocks once vehicle moves beyond 150 air miles', () => {
      // Chicago to Omaha, NE (~410 air miles)
      const result = evaluateAgriculturalExemption({
        originLat: 41.8781,
        originLng: -87.6298,
        currentLat: 41.2565,
        currentLng: -95.9345,
        isHarvestSeason: true,
        commodityType: 'PERISHABLE_PRODUCE',
      });

      expect(result.isExempt).toBe(false);
      expect(result.insideZone).toBe(false);
      expect(result.hosClockActive).toBe(true);
      expect(result.auditNote).toContain('Outside 150 air-mile radius');
    });

    it('rejects agricultural exemption for non-agricultural freight', () => {
      const result = evaluateAgriculturalExemption({
        originLat: 41.8781,
        originLng: -87.6298,
        currentLat: 41.9,
        currentLng: -87.7,
        isHarvestSeason: true,
        commodityType: 'NON_AGRICULTURAL',
      });

      expect(result.isExempt).toBe(false);
      expect(result.auditNote).toContain('Ineligible: Freight is non-agricultural cargo');
    });
  });

  describe('Adverse Driving Conditions (49 CFR § 395.1(b)(1))', () => {
    it('authorizes 2 additional driving and duty hours for unexpected blizzard', () => {
      const result = evaluateAdverseDriving({
        isAdverseDeclared: true,
        reason: 'UNFORESEEN_WEATHER_BLIZZARD',
        unforeseenTimestamp: new Date().toISOString(),
      });

      expect(result.isGranted).toBe(true);
      expect(result.drivingHourLimit).toBe(13.0);
      expect(result.dutyWindowLimit).toBe(16.0);
      expect(result.extraHoursAllowed).toBe(2.0);
      expect(result.legalJustification).toContain('49 CFR § 395.1(b)(1)');
    });

    it('strictly denies adverse driving extension for normal predictable traffic congestion', () => {
      const result = evaluateAdverseDriving({
        isAdverseDeclared: true,
        reason: 'NORMAL_CONGESTION_INVALID',
        unforeseenTimestamp: new Date().toISOString(),
      });

      expect(result.isGranted).toBe(false);
      expect(result.drivingHourLimit).toBe(11.0);
      expect(result.dutyWindowLimit).toBe(14.0);
      expect(result.legalJustification).toContain('DENIED');
    });
  });

  describe('16-Hour Short-Haul Exception (49 CFR § 395.1(o))', () => {
    it('approves 16-hour duty window when all statutory prerequisites are met', () => {
      const result = evaluateShortHaul16Hour({
        hasUsedInPast7Days: false,
        returnedToHomeTerminal: true,
        releasedWithin16Hours: true,
        consecutiveOffDutyPriorHours: 10.5,
      });

      expect(result.isEligible).toBe(true);
      expect(result.extendedDutyWindowHours).toBe(16.0);
      expect(result.auditStatement).toContain('APPROVED');
    });

    it('rejects short-haul extension if already utilized in the preceding 7 days', () => {
      const result = evaluateShortHaul16Hour({
        hasUsedInPast7Days: true,
        returnedToHomeTerminal: true,
        releasedWithin16Hours: true,
        consecutiveOffDutyPriorHours: 10.0,
      });

      expect(result.isEligible).toBe(false);
      expect(result.rejectionReason).toContain('preceding 7 consecutive days');
    });
  });

  describe('Personal Conveyance vs Yard Move', () => {
    it('logs Personal Conveyance as Off-Duty without depleting driving or 14h duty clocks', () => {
      const pc = categorizeSpecialDutyStatus('PERSONAL_CONVEYANCE', 'DRIVING');
      expect(pc.status).toBe('OFF_DUTY');
      expect(pc.isPersonalConveyance).toBe(true);
      expect(pc.depletes11HourClock).toBe(false);
      expect(pc.depletes14HourClock).toBe(false);
    });

    it('logs Yard Move as On-Duty Not Driving without depleting 11h driving clock', () => {
      const ym = categorizeSpecialDutyStatus('YARD_MOVE', 'DRIVING');
      expect(ym.status).toBe('ON_DUTY_NOT_DRIVING');
      expect(ym.isYardMove).toBe(true);
      expect(ym.depletes11HourClock).toBe(false);
      expect(ym.depletes14HourClock).toBe(true);
    });
  });
});
