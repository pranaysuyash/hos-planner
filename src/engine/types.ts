/**
 * Driver Hours of Service (HOS) & Corridor Legality Domain Types.
 * Product 03 — FMCSA Part 395 Compliance & Corridor Transit Planning.
 */

export type DutyStatus = 'OFF_DUTY' | 'SLEEPER_BERTH' | 'DRIVING' | 'ON_DUTY_NOT_DRIVING';

export type HosCycleRule = 'US_70_8' | 'US_60_7' | 'CA_SOUTH_CYCLE_1';

export interface DutyInterval {
  status: DutyStatus;
  startMinutes: number; // 0 to 1440 (24h)
  durationMinutes: number;
  location: string;
  remark: string;
}

export interface DriverState {
  driverName: string;
  cycleRule: HosCycleRule;
  driverMode: 'solo' | 'team';
  currentDutyStatus: DutyStatus;

  // Clocks remaining (hours)
  drivingHoursRemaining: number; // Max 11.0
  shiftHoursRemaining: number; // Max 14.0
  driveUntilBreakHoursRemaining: number; // Max 8.0
  cycleHoursRemaining: number; // Max 70.0
}

export type WaypointType =
  | 'ORIGIN_PICKUP'
  | 'DRIVING_LEG'
  | 'MANDATORY_30M_BREAK'
  | 'SLEEPER_10H_REST'
  | 'FUEL_INSPECTION'
  | 'DESTINATION_DROPOFF';

export interface HosWaypoint {
  id: string;
  type: WaypointType;
  title: string;
  location: string;
  distanceMiles: number;
  cumulativeMiles: number;
  durationMinutes: number;
  cumulativeTimeMinutes: number;
  dutyStatus: DutyStatus;
  notes: string;
}

export interface HosViolation {
  rule: '11_HOUR_DRIVE' | '14_HOUR_WINDOW' | '30_MINUTE_BREAK' | '70_HOUR_CYCLE';
  severity: 'CRITICAL_OOS' | 'VIOLATION' | 'WARNING';
  occurredAtMile: number;
  occurredAtTimeMinutes: number;
  message: string;
  statutoryRemedy: string;
}

export interface CorridorItineraryPlan {
  origin: string;
  destination: string;
  totalDistanceMiles: number;
  avgSpeedMph: number;
  driverMode: 'solo' | 'team';

  totalTransitHours: number;
  pureDrivingHours: number;
  totalOnDutyHours: number;
  totalRestHours: number;

  mandatorySleeperCount: number;
  mandatory30mBreakCount: number;

  isLegal: boolean;
  violations: HosViolation[];
  waypoints: HosWaypoint[];

  earliestLegalDeliveryEtaHours: number;
  complianceSummary: string;
  driverAIntervals?: DutyInterval[];
  driverBIntervals?: DutyInterval[];
}

export interface HOSAuditResult {
  isCompliant: boolean;
  violations: HosViolation[];
  totalDrivingMinutes: number;
  totalOnDutyMinutes: number;
  totalOffDutyMinutes: number;
}
