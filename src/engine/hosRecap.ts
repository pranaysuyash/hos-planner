/**
 * FMCSA 49 CFR § 395.3(b) 8-Day Rolling Cycle Hours Recap & Interstate Truck Parking Engine
 *
 * Implements statutory rolling 70-hour / 8-day duty recap calculations,
 * hours regained at midnight (Day 1 drop-off), 34-hour restart advisories,
 * and interstate corridor rest area parking capacity monitoring.
 */

export interface DailyLogRecapDay {
  dayIndex: number; // 1 (oldest) to 8 (today)
  dateStr: string;
  drivingHours: number;
  onDutyNotDrivingHours: number;
  totalOnDutyHours: number;
}

export interface RestStopParking {
  id: string;
  name: string;
  corridor: string;
  interstateMile: number;
  totalTruckSpots: number;
  availableTruckSpots: number;
  occupancyStatus: 'AMPLE' | 'LIMITED' | 'CRITICAL_FULL';
  amenities: string[];
  hasShorePower: boolean; // Electric plugin for anti-idle & reefers
}

export interface HosRecapSummary {
  cycleType: '70h_8d' | '60h_7d';
  cycleLimitHours: number;
  dailyLogs: DailyLogRecapDay[];
  totalOnDutyLast8Days: number;
  cycleHoursRemaining: number;
  hoursRegainedTonightMidnight: number;
  projectedAvailableTomorrow: number;
  cycleViolation: boolean;
  restart34hRecommended: boolean;
  restartReason?: string;
  nearbyRestStops: RestStopParking[];
}

/** Standard representative 8-day duty history for OTR driver */
export const DEFAULT_8DAY_HISTORY: DailyLogRecapDay[] = [
  { dayIndex: 1, dateStr: 'Day -7', drivingHours: 9.5, onDutyNotDrivingHours: 1.5, totalOnDutyHours: 11.0 },
  { dayIndex: 2, dateStr: 'Day -6', drivingHours: 8.0, onDutyNotDrivingHours: 1.0, totalOnDutyHours: 9.0 },
  { dayIndex: 3, dateStr: 'Day -5', drivingHours: 10.0, onDutyNotDrivingHours: 1.0, totalOnDutyHours: 11.0 },
  { dayIndex: 4, dateStr: 'Day -4', drivingHours: 7.5, onDutyNotDrivingHours: 2.0, totalOnDutyHours: 9.5 },
  { dayIndex: 5, dateStr: 'Day -3', drivingHours: 8.5, onDutyNotDrivingHours: 1.5, totalOnDutyHours: 10.0 },
  { dayIndex: 6, dateStr: 'Day -2', drivingHours: 6.0, onDutyNotDrivingHours: 1.0, totalOnDutyHours: 7.0 },
  { dayIndex: 7, dateStr: 'Day -1 (Yesterday)', drivingHours: 5.5, onDutyNotDrivingHours: 1.5, totalOnDutyHours: 7.0 },
  { dayIndex: 8, dateStr: 'Day 0 (Today)', drivingHours: 4.0, onDutyNotDrivingHours: 1.0, totalOnDutyHours: 5.0 },
];

/** Popular I-80 corridor verified truck stops and rest areas */
export const I80_CORRIDOR_REST_STOPS: RestStopParking[] = [
  {
    id: 'RS-01',
    name: "Iowa 80 Truckstop ('World's Largest')",
    corridor: 'I-80 Exit 284 (Walcott, IA)',
    interstateMile: 284,
    totalTruckSpots: 900,
    availableTruckSpots: 142,
    occupancyStatus: 'AMPLE',
    amenities: ['24/7 Service Shop', 'CAT Scale', 'Dentist', '24 Showers', 'Truckomat Wash'],
    hasShorePower: true,
  },
  {
    id: 'RS-02',
    name: 'Love’s Travel Stop #412',
    corridor: 'I-80 Exit 142 (Altoona, IA)',
    interstateMile: 142,
    totalTruckSpots: 110,
    availableTruckSpots: 14,
    occupancyStatus: 'LIMITED',
    amenities: ['Tire Pass', 'DEF at Pump', '7 Showers', 'Subway'],
    hasShorePower: false,
  },
  {
    id: 'RS-03',
    name: 'Pilot Travel Center #230',
    corridor: 'I-80 Exit 401 (Lincoln, NE)',
    interstateMile: 401,
    totalTruckSpots: 85,
    availableTruckSpots: 3,
    occupancyStatus: 'CRITICAL_FULL',
    amenities: ['PJ Fresh', 'CAT Scale', '5 Showers'],
    hasShorePower: false,
  },
  {
    id: 'RS-04',
    name: 'Wyoming State Welcome Rest Area',
    corridor: 'I-80 Mile 359 (Pine Bluffs, WY)',
    interstateMile: 359,
    totalTruckSpots: 45,
    availableTruckSpots: 22,
    occupancyStatus: 'AMPLE',
    amenities: ['Vending', 'Restrooms', 'Severe Weather Shelter'],
    hasShorePower: true,
  },
];

/**
 * Calculates FMCSA rolling cycle recap and determines availability.
 *
 * @param logs 8-day daily log entries (1 = oldest, 8 = today)
 * @param cycleType '70h_8d' (default interstate carrier) or '60h_7d'
 * @param plannedTripRemainingHours Estimated driving hours required to complete upcoming legs
 */
export function calculateHosRecap(
  logs: DailyLogRecapDay[] = DEFAULT_8DAY_HISTORY,
  cycleType: '70h_8d' | '60h_7d' = '70h_8d',
  plannedTripRemainingHours: number = 14
): HosRecapSummary {
  const cycleLimitHours = cycleType === '70h_8d' ? 70.0 : 60.0;

  // Sum on-duty hours in the active window
  const activeLogs = cycleType === '70h_8d' ? logs.slice(-8) : logs.slice(-7);
  const totalOnDutyLast8Days = Number(
    activeLogs.reduce((sum, d) => sum + d.totalOnDutyHours, 0).toFixed(1)
  );

  const cycleHoursRemaining = Number(
    Math.max(0, cycleLimitHours - totalOnDutyLast8Days).toFixed(1)
  );
  const cycleViolation = totalOnDutyLast8Days > cycleLimitHours;

  // Day 1 drop-off calculation: hours worked on Day 1 drop off at 00:00:00 midnight tonight
  const day1Hours = activeLogs[0]?.totalOnDutyHours ?? 0;
  const hoursRegainedTonightMidnight = Number(day1Hours.toFixed(1));

  // Projected available tomorrow = min(14.0, Cycle Limit - (Total - Day 1))
  const remainingAfterDrop = cycleLimitHours - (totalOnDutyLast8Days - hoursRegainedTonightMidnight);
  const projectedAvailableTomorrow = Number(Math.min(14.0, Math.max(0, remainingAfterDrop)).toFixed(1));

  // 34-hour restart recommendation
  let restart34hRecommended = false;
  let restartReason: string | undefined;

  if (cycleHoursRemaining < 6.0 && plannedTripRemainingHours > 8.0) {
    restart34hRecommended = true;
    restartReason = `Only ${cycleHoursRemaining}h remaining on 70h clock, but trip requires ${plannedTripRemainingHours}h. A 34-hour restart resets clock to full 70.0 hours.`;
  } else if (projectedAvailableTomorrow < 5.0 && hoursRegainedTonightMidnight < 4.0) {
    restart34hRecommended = true;
    restartReason = `Low midnight recovery (+${hoursRegainedTonightMidnight}h). Rolling cycle deficit will bottleneck multi-day corridor transit.`;
  }

  return {
    cycleType,
    cycleLimitHours,
    dailyLogs: logs,
    totalOnDutyLast8Days,
    cycleHoursRemaining,
    hoursRegainedTonightMidnight,
    projectedAvailableTomorrow,
    cycleViolation,
    restart34hRecommended,
    restartReason,
    nearbyRestStops: I80_CORRIDOR_REST_STOPS,
  };
}
