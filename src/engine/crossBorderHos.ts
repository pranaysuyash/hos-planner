/**
 * USMCA Cross-Border Hours of Service Engine.
 * 
 * Implements statutory cross-border HOS regulations for:
 * 1. United States: FMCSA 49 CFR Part 395
 * 2. Canada: SOR/2005-313 Commercial Vehicle Drivers Hours of Service Regulations
 * 3. Mexico: NOM-087-SCT-2-2017 Secretaría de Comunicaciones y Transportes
 */

export type NorthAmericanJurisdiction = 'US_FMCSA' | 'CANADA_SOR_2005_313' | 'MEXICO_NOM_087';

export interface BorderCrossingPort {
  code: string;
  name: string;
  usState: string;
  neighboringCountry: 'CANADA' | 'MEXICO';
  neighboringProvinceOrState: string;
  fastLaneAvailable: boolean;
  typicalWaitMinutes: number;
}

export const MAJOR_BORDER_CROSSINGS: Record<string, BorderCrossingPort> = {
  'AMBASSADOR_BRIDGE': {
    code: 'AMBASSADOR_BRIDGE',
    name: 'Ambassador Bridge (Detroit, MI / Windsor, ON)',
    usState: 'MI',
    neighboringCountry: 'CANADA',
    neighboringProvinceOrState: 'Ontario',
    fastLaneAvailable: true,
    typicalWaitMinutes: 45,
  },
  'BLUE_WATER_BRIDGE': {
    code: 'BLUE_WATER_BRIDGE',
    name: 'Blue Water Bridge (Port Huron, MI / Point Edward, ON)',
    usState: 'MI',
    neighboringCountry: 'CANADA',
    neighboringProvinceOrState: 'Ontario',
    fastLaneAvailable: true,
    typicalWaitMinutes: 30,
  },
  'LAREDO_WORLD_TRADE': {
    code: 'LAREDO_WORLD_TRADE',
    name: 'World Trade Bridge (Laredo, TX / Nuevo Laredo, Tamps)',
    usState: 'TX',
    neighboringCountry: 'MEXICO',
    neighboringProvinceOrState: 'Tamaulipas',
    fastLaneAvailable: true,
    typicalWaitMinutes: 65,
  },
  'OTAY_MESA': {
    code: 'OTAY_MESA',
    name: 'Otay Mesa Commercial Facility (San Diego, CA / Tijuana, BC)',
    usState: 'CA',
    neighboringCountry: 'MEXICO',
    neighboringProvinceOrState: 'Baja California',
    fastLaneAvailable: true,
    typicalWaitMinutes: 55,
  },
};

export interface JurisdictionRules {
  jurisdiction: NorthAmericanJurisdiction;
  title: string;
  statuteRef: string;
  maxDrivingHours: number;
  maxShiftWindowHours: number;
  mandatoryRestHours: number;
  breakRequirement: {
    durationMinutes: number;
    afterDrivingHours: number;
  };
  cycleOptions: Array<{
    name: string;
    maxDutyHours: number;
    daysCount: number;
    resetHours: number;
  }>;
}

export const JURISDICTION_RULES: Record<NorthAmericanJurisdiction, JurisdictionRules> = {
  'US_FMCSA': {
    jurisdiction: 'US_FMCSA',
    title: 'United States FMCSA',
    statuteRef: '49 CFR Part 395',
    maxDrivingHours: 11.0,
    maxShiftWindowHours: 14.0,
    mandatoryRestHours: 10.0,
    breakRequirement: {
      durationMinutes: 30,
      afterDrivingHours: 8.0,
    },
    cycleOptions: [
      { name: '70-Hour / 8-Day Cycle', maxDutyHours: 70, daysCount: 8, resetHours: 34 },
      { name: '60-Hour / 7-Day Cycle', maxDutyHours: 60, daysCount: 7, resetHours: 34 },
    ],
  },
  'CANADA_SOR_2005_313': {
    jurisdiction: 'CANADA_SOR_2005_313',
    title: 'Canada Commercial Vehicle HOS',
    statuteRef: 'SOR/2005-313',
    maxDrivingHours: 13.0,
    maxShiftWindowHours: 16.0, // 16-hour elapsed workshift window
    mandatoryRestHours: 10.0, // 8 consecutive + 2 additional
    breakRequirement: {
      durationMinutes: 30, // Defer to off-duty distribution
      afterDrivingHours: 13.0,
    },
    cycleOptions: [
      { name: 'Cycle 1 (70 Hours / 7 Days)', maxDutyHours: 70, daysCount: 7, resetHours: 36 },
      { name: 'Cycle 2 (120 Hours / 14 Days)', maxDutyHours: 120, daysCount: 14, resetHours: 72 },
    ],
  },
  'MEXICO_NOM_087': {
    jurisdiction: 'MEXICO_NOM_087',
    title: 'Mexico SICT HOS',
    statuteRef: 'NOM-087-SCT-2-2017',
    maxDrivingHours: 14.0, // 14 hours max in 24-hr period
    maxShiftWindowHours: 24.0,
    mandatoryRestHours: 8.0, // 8 consecutive hours rest
    breakRequirement: {
      durationMinutes: 30, // Mandatory 30-min pause every 5h of continuous driving
      afterDrivingHours: 5.0,
    },
    cycleOptions: [
      { name: 'Standard 24-Hour Rolling Schedule', maxDutyHours: 84, daysCount: 7, resetHours: 24 },
    ],
  },
};

export interface CrossBorderComplianceAudit {
  activeJurisdiction: NorthAmericanJurisdiction;
  rules: JurisdictionRules;
  accumulatedDrivingHours: number;
  accumulatedDutyHours: number;
  continuousDrivingHours: number;
  consecutiveRestHours: number;
  isDrivingLegal: boolean;
  isDutyWindowLegal: boolean;
  isBreakLegal: boolean;
  isOverallLegal: boolean;
  violations: string[];
  remainingDriveHours: number;
  remainingDutyHours: number;
}

/**
 * Evaluates current driver timetable compliance against the statutory rules of the active country.
 */
export function auditCrossBorderCompliance(
  jurisdiction: NorthAmericanJurisdiction,
  drivingHours: number,
  dutyHours: number,
  continuousDrivingHours: number,
  consecutiveRestHours: number = 10
): CrossBorderComplianceAudit {
  const rules = JURISDICTION_RULES[jurisdiction];
  const violations: string[] = [];

  // 1. Max driving hours check
  const isDrivingLegal = drivingHours <= rules.maxDrivingHours;
  if (!isDrivingLegal) {
    violations.push(
      `Exceeded ${rules.title} max driving limit: ${drivingHours}h driven vs ${rules.maxDrivingHours}h statutory cap (${rules.statuteRef}).`
    );
  }

  // 2. Max workshift window check
  const isDutyWindowLegal = dutyHours <= rules.maxShiftWindowHours;
  if (!isDutyWindowLegal) {
    violations.push(
      `Exceeded ${rules.title} shift window: ${dutyHours}h on-duty vs ${rules.maxShiftWindowHours}h maximum window (${rules.statuteRef}).`
    );
  }

  // 3. Continuous driving break check
  let isBreakLegal = true;
  if (continuousDrivingHours > rules.breakRequirement.afterDrivingHours) {
    isBreakLegal = false;
    violations.push(
      `Mandatory ${rules.breakRequirement.durationMinutes}-min rest break required after ${rules.breakRequirement.afterDrivingHours}h of continuous driving under ${rules.statuteRef}.`
    );
  }

  // 4. Consecutive rest check
  if (consecutiveRestHours < rules.mandatoryRestHours && dutyHours === 0 && drivingHours > 0) {
    violations.push(
      `Insufficient daily rest: ${consecutiveRestHours}h taken vs ${rules.mandatoryRestHours}h mandatory (${rules.statuteRef}).`
    );
  }

  const isOverallLegal = isDrivingLegal && isDutyWindowLegal && isBreakLegal && violations.length === 0;

  return {
    activeJurisdiction: jurisdiction,
    rules,
    accumulatedDrivingHours: drivingHours,
    accumulatedDutyHours: dutyHours,
    continuousDrivingHours,
    consecutiveRestHours,
    isDrivingLegal,
    isDutyWindowLegal,
    isBreakLegal,
    isOverallLegal,
    violations,
    remainingDriveHours: Math.max(0, rules.maxDrivingHours - drivingHours),
    remainingDutyHours: Math.max(0, rules.maxShiftWindowHours - dutyHours),
  };
}
