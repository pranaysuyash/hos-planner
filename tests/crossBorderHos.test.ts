import { describe, it, expect } from 'vitest';
import {
  auditCrossBorderCompliance,
  JURISDICTION_RULES,
  MAJOR_BORDER_CROSSINGS,
} from '../src/engine/crossBorderHos';

describe('USMCA Cross-Border Statutory HOS Engine (T-033)', () => {
  it('registers all 3 USMCA country statutory frameworks with distinct rules', () => {
    expect(JURISDICTION_RULES.US_FMCSA.maxDrivingHours).toBe(11.0);
    expect(JURISDICTION_RULES.CANADA_SOR_2005_313.maxDrivingHours).toBe(13.0);
    expect(JURISDICTION_RULES.MEXICO_NOM_087.maxDrivingHours).toBe(14.0);

    expect(JURISDICTION_RULES.US_FMCSA.maxShiftWindowHours).toBe(14.0);
    expect(JURISDICTION_RULES.CANADA_SOR_2005_313.maxShiftWindowHours).toBe(16.0);
  });

  it('validates 12 hours driving is legal in Canada but a violation in the US', () => {
    // 12 hours driving, 13 hours on-duty, 4 hours continuous
    const usAudit = auditCrossBorderCompliance('US_FMCSA', 12.0, 13.0, 4.0);
    expect(usAudit.isDrivingLegal).toBe(false);
    expect(usAudit.isOverallLegal).toBe(false);
    expect(usAudit.violations[0]).toContain('49 CFR Part 395');

    const caAudit = auditCrossBorderCompliance('CANADA_SOR_2005_313', 12.0, 13.0, 4.0);
    expect(caAudit.isDrivingLegal).toBe(true);
    expect(caAudit.isOverallLegal).toBe(true);
    expect(caAudit.remainingDriveHours).toBe(1.0);
  });

  it('enforces Mexico NOM-087 mandatory 30-min break after 5 hours of continuous driving', () => {
    // 5.5 hours continuous driving in Mexico without a break
    const mxAudit = auditCrossBorderCompliance('MEXICO_NOM_087', 5.5, 6.0, 5.5);
    expect(mxAudit.isBreakLegal).toBe(false);
    expect(mxAudit.isOverallLegal).toBe(false);
    expect(mxAudit.violations[0]).toContain('Mandatory 30-min rest break required after 5h');
  });

  it('contains valid cross-border international ports of entry', () => {
    expect(MAJOR_BORDER_CROSSINGS.AMBASSADOR_BRIDGE.neighboringCountry).toBe('CANADA');
    expect(MAJOR_BORDER_CROSSINGS.LAREDO_WORLD_TRADE.neighboringCountry).toBe('MEXICO');
    expect(MAJOR_BORDER_CROSSINGS.AMBASSADOR_BRIDGE.fastLaneAvailable).toBe(true);
  });
});
