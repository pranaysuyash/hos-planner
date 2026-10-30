/**
 * FMCSA Part 395 Statutory Hours of Service (HOS) Exemptions Engine.
 * Product 03 — HOS Compliance & Interstate Corridor Legality Planner
 *
 * Implements statutory federal exemptions under 49 CFR Part 395:
 * 1. 49 CFR § 395.1(k) — Agricultural Exemption (150 air-mile radius / 172.6 statute miles)
 * 2. 49 CFR § 395.1(b)(1) — Adverse Driving Conditions (2-hour extension for unexpected conditions)
 * 3. 49 CFR § 395.1(o) — 16-Hour Short-Haul Exception (Once per 7 days)
 * 4. Personal Conveyance (PC - Off-Duty) vs. Yard Move (YM - On-Duty Not Driving)
 */

export interface AgriculturalExemptionInput {
  originLat: number;
  originLng: number;
  currentLat: number;
  currentLng: number;
  isHarvestSeason: boolean;
  commodityType: 'LIVESTOCK' | 'PERISHABLE_PRODUCE' | 'GRAIN_AND_BULK' | 'NON_AGRICULTURAL';
}

export interface AgriculturalExemptionResult {
  isExempt: boolean;
  airMilesFromSource: number;
  maxExemptAirMiles: number; // 150 air miles = 172.6 statute miles
  insideZone: boolean;
  hosClockActive: boolean;
  statutoryBasis: string;
  auditNote: string;
}

export interface AdverseDrivingInput {
  isAdverseDeclared: boolean;
  reason: 'UNFORESEEN_WEATHER_BLIZZARD' | 'UNFORESEEN_ROAD_CLOSURE' | 'TRAFFIC_ACCIDENT_DETOUR' | 'NORMAL_CONGESTION_INVALID';
  unforeseenTimestamp: string;
}

export interface AdverseDrivingResult {
  isGranted: boolean;
  drivingHourLimit: number; // 11 standard -> 13 under adverse
  dutyWindowLimit: number; // 14 standard -> 16 under adverse
  extraHoursAllowed: number;
  legalJustification: string;
}

export interface ShortHaul16HourInput {
  hasUsedInPast7Days: boolean;
  returnedToHomeTerminal: boolean;
  releasedWithin16Hours: boolean;
  consecutiveOffDutyPriorHours: number;
}

export interface ShortHaul16HourResult {
  isEligible: boolean;
  extendedDutyWindowHours: number; // 16 hours
  rejectionReason?: string;
  auditStatement: string;
}

export interface DutyStatusCategorization {
  status: 'OFF_DUTY' | 'SLEEPER_BERTH' | 'DRIVING' | 'ON_DUTY_NOT_DRIVING';
  isPersonalConveyance: boolean;
  isYardMove: boolean;
  depletes11HourClock: boolean;
  depletes14HourClock: boolean;
  complianceRule: string;
}

export const STATUTE_MILES_PER_AIR_MILE = 1.15078; // 1 nautical/air mile = 1.15078 statute miles
export const MAX_AG_AIR_MILES = 150.0;

/** Convert air miles (nautical miles) to road/statute miles equivalent */
export function airMilesToStatuteMiles(airMiles: number): number {
  return Number((airMiles * STATUTE_MILES_PER_AIR_MILE).toFixed(1));
}

/** Great-circle distance between two coordinates in air miles (nautical miles) */
export function calculateAirMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in nautical/air miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

/** Evaluates 49 CFR § 395.1(k) Agricultural Exemption */
export function evaluateAgriculturalExemption(input: AgriculturalExemptionInput): AgriculturalExemptionResult {
  if (input.commodityType === 'NON_AGRICULTURAL') {
    return {
      isExempt: false,
      airMilesFromSource: 0,
      maxExemptAirMiles: MAX_AG_AIR_MILES,
      insideZone: false,
      hosClockActive: true,
      statutoryBasis: '49 CFR § 395.1(k)',
      auditNote: 'Ineligible: Freight is non-agricultural cargo.',
    };
  }

  if (!input.isHarvestSeason) {
    return {
      isExempt: false,
      airMilesFromSource: 0,
      maxExemptAirMiles: MAX_AG_AIR_MILES,
      insideZone: false,
      hosClockActive: true,
      statutoryBasis: '49 CFR § 395.1(k)',
      auditNote: 'Ineligible: State planting or harvest season not currently declared active.',
    };
  }

  const airMiles = calculateAirMiles(input.originLat, input.originLng, input.currentLat, input.currentLng);
  const insideZone = airMiles <= MAX_AG_AIR_MILES;

  return {
    isExempt: insideZone,
    airMilesFromSource: airMiles,
    maxExemptAirMiles: MAX_AG_AIR_MILES,
    insideZone,
    hosClockActive: !insideZone,
    statutoryBasis: '49 CFR § 395.1(k) / FAST Act § 5202',
    auditNote: insideZone
      ? `EXEMPT: Within 150 air-mile radius (${airMiles} air miles from source). Part 395 HOS clocks paused.`
      : `NON-EXEMPT: Outside 150 air-mile radius (${airMiles} air miles). Standard Part 395 clocks engaged at boundary.`,
  };
}

/** Evaluates 49 CFR § 395.1(b)(1) Adverse Driving Conditions Exception */
export function evaluateAdverseDriving(input: AdverseDrivingInput): AdverseDrivingResult {
  if (!input.isAdverseDeclared) {
    return {
      isGranted: false,
      drivingHourLimit: 11.0,
      dutyWindowLimit: 14.0,
      extraHoursAllowed: 0,
      legalJustification: 'Standard statutory 11-hour driving and 14-hour duty window.',
    };
  }

  if (input.reason === 'NORMAL_CONGESTION_INVALID') {
    return {
      isGranted: false,
      drivingHourLimit: 11.0,
      dutyWindowLimit: 14.0,
      extraHoursAllowed: 0,
      legalJustification: 'DENIED: 49 CFR § 395.1(b)(1) explicitly excludes predictable rush-hour or recurring traffic congestion.',
    };
  }

  return {
    isGranted: true,
    drivingHourLimit: 13.0, // Up to 2 additional hours
    dutyWindowLimit: 16.0,  // Extended 16-hour window under 2020 Final Rule
    extraHoursAllowed: 2.0,
    legalJustification: `GRANTED (49 CFR § 395.1(b)(1)): 2-hour emergency extension authorized due to ${input.reason.replace(/_/g, ' ')}. Requires dispatch note and weather/incident record.`,
  };
}

/** Evaluates 49 CFR § 395.1(o) 16-Hour Short-Haul Exception */
export function evaluateShortHaul16Hour(input: ShortHaul16HourInput): ShortHaul16HourResult {
  if (input.hasUsedInPast7Days) {
    return {
      isEligible: false,
      extendedDutyWindowHours: 14.0,
      rejectionReason: 'Already utilized once in the preceding 7 consecutive days.',
      auditStatement: 'DENIED: 49 CFR § 395.1(o) permits only one 16-hour extension per 7-day period.',
    };
  }

  if (!input.returnedToHomeTerminal) {
    return {
      isEligible: false,
      extendedDutyWindowHours: 14.0,
      rejectionReason: 'Driver did not return to the normal work reporting location.',
      auditStatement: 'DENIED: Must return to normal work reporting location to qualify for short-haul extension.',
    };
  }

  if (input.consecutiveOffDutyPriorHours < 10.0) {
    return {
      isEligible: false,
      extendedDutyWindowHours: 14.0,
      rejectionReason: 'Driver lacked 10 consecutive hours off-duty prior to work shift.',
      auditStatement: 'DENIED: Requires 10 consecutive hours off-duty before shift start.',
    };
  }

  return {
    isEligible: true,
    extendedDutyWindowHours: 16.0,
    auditStatement: 'APPROVED (49 CFR § 395.1(o)): 16-hour duty window authorized for current workshift.',
  };
}

/** Resolves Special Duty Statuses (Personal Conveyance vs Yard Move) */
export function categorizeSpecialDutyStatus(
  mode: 'NORMAL' | 'PERSONAL_CONVEYANCE' | 'YARD_MOVE',
  baseStatus: 'DRIVING' | 'ON_DUTY_NOT_DRIVING'
): DutyStatusCategorization {
  if (mode === 'PERSONAL_CONVEYANCE') {
    return {
      status: 'OFF_DUTY',
      isPersonalConveyance: true,
      isYardMove: false,
      depletes11HourClock: false,
      depletes14HourClock: false,
      complianceRule: 'FMCSA Regulatory Guidance § 395.8 Question 26: Authorized off-duty personal travel (bobtail to lodging/food).',
    };
  }

  if (mode === 'YARD_MOVE') {
    return {
      status: 'ON_DUTY_NOT_DRIVING',
      isPersonalConveyance: false,
      isYardMove: true,
      depletes11HourClock: false, // Does not count against 11-hr pure driving
      depletes14HourClock: true,  // Does count against 14-hr duty clock
      complianceRule: '49 CFR § 395.2: Terminal or customer yard repositioning logged as On-Duty Not Driving.',
    };
  }

  return {
    status: baseStatus,
    isPersonalConveyance: false,
    isYardMove: false,
    depletes11HourClock: baseStatus === 'DRIVING',
    depletes14HourClock: true,
    complianceRule: 'Standard statutory logging under 49 CFR Part 395.',
  };
}
