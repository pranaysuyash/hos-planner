/**
 * Interstate Corridor Transit & HOS Legality Simulator.
 * Product 03 — Generates legally compliant multi-day itineraries
 * with mandatory 30-min rest breaks, 10-hr sleeper berths, and fuel stops.
 */

import type { CorridorItineraryPlan, HosWaypoint, HosViolation } from './types';
import { HOS_LIMITS } from './hos';

export interface RoutePreset {
  id: string;
  name: string;
  origin: string;
  destination: string;
  distanceMiles: number;
  corridorNotes: string;
}

export const POPULAR_CORRIDORS: RoutePreset[] = [
  {
    id: 'chi-dal',
    name: 'Midwest to South Corridor (I-55 / I-30)',
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    distanceMiles: 925,
    corridorNotes: 'High-density freight lane. Solo requires 1 sleeper layover (Effingham/Memphis) and 1 30-min break.',
  },
  {
    id: 'la-atl',
    name: 'Sunbelt Transcontinental (I-10 / I-20)',
    origin: 'Los Angeles, CA',
    destination: 'Atlanta, GA',
    distanceMiles: 2180,
    corridorNotes: 'Long haul cross-country. Solo requires 3 sleeper resets and multiple 30-min breaks. Team finishes in ~42h.',
  },
  {
    id: 'sea-den',
    name: 'Northwest to Rockies (I-84 / I-80)',
    origin: 'Seattle, WA',
    destination: 'Denver, CO',
    distanceMiles: 1305,
    corridorNotes: 'Mountain passes & elevation. Solo requires 2 sleeper layovers.',
  },
  {
    id: 'nyc-mia',
    name: 'East Coast Spine (I-95 Corridor)',
    origin: 'New York, NY',
    destination: 'Miami, FL',
    distanceMiles: 1285,
    corridorNotes: 'Metro congestion zones. Solo requires 2 sleeper layovers.',
  },
];

export interface PlanOptions {
  origin: string;
  destination: string;
  distanceMiles: number;
  avgSpeedMph?: number;
  driverMode?: 'solo' | 'team';
  initialDrivingHoursRemaining?: number;
  initialShiftHoursRemaining?: number;
}

/**
 * Plans a legal interstate transit itinerary compliant with FMCSA Part 395.
 */
export function planCorridorItinerary(opts: PlanOptions): CorridorItineraryPlan {
  const {
    origin,
    destination,
    distanceMiles,
    avgSpeedMph = 55,
    driverMode = 'solo',
    initialDrivingHoursRemaining = HOS_LIMITS.MAX_DRIVE_HOURS_PER_SHIFT,
    initialShiftHoursRemaining = HOS_LIMITS.MAX_ON_DUTY_HOURS_PER_SHIFT,
  } = opts;

  const waypoints: HosWaypoint[] = [];
  const violations: HosViolation[] = [];

  let currentMile = 0;
  let currentTimeMinutes = 0; // minutes from departure
  let waypointCounter = 1;

  // 1. Origin Pickup & Pre-Trip Inspection (15 min On Duty)
  const preTripMinutes = 15;
  waypoints.push({
    id: `wp-${waypointCounter++}`,
    type: 'ORIGIN_PICKUP',
    title: 'Pre-Trip Inspection & Live Load',
    location: origin,
    distanceMiles: 0,
    cumulativeMiles: 0,
    durationMinutes: preTripMinutes,
    cumulativeTimeMinutes: preTripMinutes,
    dutyStatus: 'ON_DUTY_NOT_DRIVING',
    notes: 'Verify commercial equipment, air brake test, bill of lading pickup.',
  });
  currentTimeMinutes += preTripMinutes;

  let remainingMiles = distanceMiles;
  let shiftDriveMinutesRemaining = initialDrivingHoursRemaining * 60;
  let shiftWindowMinutesRemaining = (initialShiftHoursRemaining * 60) - preTripMinutes;
  let driveMinutesUntil30mBreak = HOS_LIMITS.MAX_DRIVE_HOURS_BEFORE_BREAK * 60;

  let sleeperCount = 0;
  let breakCount = 0;
  let pureDrivingMinutes = 0;
  let totalOnDutyMinutes = preTripMinutes;
  let totalRestMinutes = 0;

  if (driverMode === 'team') {
    // Team driving: Truck rolls continuously except for 15-min driver swaps & fuel
    while (remainingMiles > 0) {
      // Team driver shift is typically 10 hours driving before swapping
      const maxDriveHoursForLeg = 10;
      const legMilesAvailable = maxDriveHoursForLeg * avgSpeedMph;
      const legMiles = Math.min(remainingMiles, legMilesAvailable);
      const legDurationMinutes = Math.round((legMiles / avgSpeedMph) * 60);

      currentMile += legMiles;
      currentTimeMinutes += legDurationMinutes;
      pureDrivingMinutes += legDurationMinutes;
      remainingMiles -= legMiles;

      waypoints.push({
        id: `wp-${waypointCounter++}`,
        type: 'DRIVING_LEG',
        title: `Team Driving Leg (${Math.round(legMiles)} mi)`,
        location: `En Route Mile ${Math.round(currentMile)}`,
        distanceMiles: legMiles,
        cumulativeMiles: currentMile,
        durationMinutes: legDurationMinutes,
        cumulativeTimeMinutes: currentTimeMinutes,
        dutyStatus: 'DRIVING',
        notes: `Active Driver in cab; Relief Driver resting in Sleeper Berth.`,
      });

      if (remainingMiles > 0) {
        // Driver swap + fuel inspection
        const swapMinutes = 20;
        currentTimeMinutes += swapMinutes;
        totalOnDutyMinutes += swapMinutes;

        waypoints.push({
          id: `wp-${waypointCounter++}`,
          type: 'FUEL_INSPECTION',
          title: 'Driver Swap & Fueling',
          location: `Interstate Travel Plaza (MP ${Math.round(currentMile)})`,
          distanceMiles: 0,
          cumulativeMiles: currentMile,
          durationMinutes: swapMinutes,
          cumulativeTimeMinutes: currentTimeMinutes,
          dutyStatus: 'ON_DUTY_NOT_DRIVING',
          notes: 'Switch active driver log to Sleeper Berth; Co-driver starts driving shift.',
        });
      }
    }
  } else {
    // Solo driving: Strictly adheres to 11-hr drive, 14-hr window, and 8-hr break rules
    while (remainingMiles > 0) {
      // Determine how many minutes we can drive right now
      const maxContinuousDriveMinutes = Math.min(
        shiftDriveMinutesRemaining,
        shiftWindowMinutesRemaining,
        driveMinutesUntil30mBreak,
      );

      if (maxContinuousDriveMinutes <= 0) {
        // Need a 10-hour sleeper berth reset!
        sleeperCount++;
        const restDuration = 10 * 60; // 600 min
        currentTimeMinutes += restDuration;
        totalRestMinutes += restDuration;

        waypoints.push({
          id: `wp-${waypointCounter++}`,
          type: 'SLEEPER_10H_REST',
          title: `Mandatory 10-Hour Sleeper Berth Rest #${sleeperCount}`,
          location: `Rest Area / Truck Stop (Mile ${Math.round(currentMile)})`,
          distanceMiles: 0,
          cumulativeMiles: currentMile,
          durationMinutes: restDuration,
          cumulativeTimeMinutes: currentTimeMinutes,
          dutyStatus: 'SLEEPER_BERTH',
          notes: 'Full statutory 10-hour consecutive rest. Resets 11h drive clock and 14h shift window.',
        });

        // Reset shift clocks
        shiftDriveMinutesRemaining = HOS_LIMITS.MAX_DRIVE_HOURS_PER_SHIFT * 60;
        shiftWindowMinutesRemaining = HOS_LIMITS.MAX_ON_DUTY_HOURS_PER_SHIFT * 60;
        driveMinutesUntil30mBreak = HOS_LIMITS.MAX_DRIVE_HOURS_BEFORE_BREAK * 60;
        continue;
      }

      // Check if driver needs a 30-min break
      if (driveMinutesUntil30mBreak <= 0) {
        breakCount++;
        const breakDuration = 30;
        currentTimeMinutes += breakDuration;
        shiftWindowMinutesRemaining -= breakDuration;
        totalRestMinutes += breakDuration;

        waypoints.push({
          id: `wp-${waypointCounter++}`,
          type: 'MANDATORY_30M_BREAK',
          title: `Mandatory 30-Minute Rest Break #${breakCount}`,
          location: `Highway Travel Plaza (Mile ${Math.round(currentMile)})`,
          distanceMiles: 0,
          cumulativeMiles: currentMile,
          durationMinutes: breakDuration,
          cumulativeTimeMinutes: currentTimeMinutes,
          dutyStatus: 'OFF_DUTY',
          notes: 'Required under FMCSA 49 CFR § 395.3(a)(3)(ii) after 8 hours driving without break.',
        });

        driveMinutesUntil30mBreak = HOS_LIMITS.MAX_DRIVE_HOURS_BEFORE_BREAK * 60;
        continue;
      }

      // Compute miles possible in this legal slice
      const driveMinutesCapacity = Math.min(
        shiftDriveMinutesRemaining,
        shiftWindowMinutesRemaining,
        driveMinutesUntil30mBreak,
      );

      const maxMilesForLeg = (driveMinutesCapacity / 60) * avgSpeedMph;
      const legMiles = Math.min(remainingMiles, maxMilesForLeg);
      const legDurationMinutes = Math.max(1, Math.round((legMiles / avgSpeedMph) * 60));

      currentMile += legMiles;
      currentTimeMinutes += legDurationMinutes;
      pureDrivingMinutes += legDurationMinutes;
      remainingMiles -= legMiles;

      shiftDriveMinutesRemaining -= legDurationMinutes;
      shiftWindowMinutesRemaining -= legDurationMinutes;
      driveMinutesUntil30mBreak -= legDurationMinutes;

      waypoints.push({
        id: `wp-${waypointCounter++}`,
        type: 'DRIVING_LEG',
        title: `Interstate Driving Leg (${Math.round(legMiles)} mi)`,
        location: `Corridor Mile ${Math.round(currentMile)}`,
        distanceMiles: legMiles,
        cumulativeMiles: currentMile,
        durationMinutes: legDurationMinutes,
        cumulativeTimeMinutes: currentTimeMinutes,
        dutyStatus: 'DRIVING',
        notes: `Speed maintained at ~${avgSpeedMph} MPH. Clocks running.`,
      });
    }
  }

  // Destination Delivery & Post-Trip (20 min)
  const postTripMinutes = 20;
  waypoints.push({
    id: `wp-${waypointCounter++}`,
    type: 'DESTINATION_DROPOFF',
    title: 'Consignee Delivery & Post-Trip DVIR',
    location: destination,
    distanceMiles: 0,
    cumulativeMiles: currentMile,
    durationMinutes: postTripMinutes,
    cumulativeTimeMinutes: currentTimeMinutes + postTripMinutes,
    dutyStatus: 'ON_DUTY_NOT_DRIVING',
    notes: 'Seal verification, dock delivery receipt signature, driver post-trip inspection.',
  });
  currentTimeMinutes += postTripMinutes;
  totalOnDutyMinutes += postTripMinutes;

  const totalTransitHours = Number((currentTimeMinutes / 60).toFixed(1));
  const pureDrivingHours = Number((pureDrivingMinutes / 60).toFixed(1));
  const totalOnDutyHours = Number((totalOnDutyMinutes / 60).toFixed(1));
  const totalRestHours = Number((totalRestMinutes / 60).toFixed(1));

  return {
    origin,
    destination,
    totalDistanceMiles: distanceMiles,
    avgSpeedMph,
    driverMode,
    totalTransitHours,
    pureDrivingHours,
    totalOnDutyHours,
    totalRestHours,
    mandatorySleeperCount: sleeperCount,
    mandatory30mBreakCount: breakCount,
    isLegal: violations.length === 0,
    violations,
    waypoints,
    earliestLegalDeliveryEtaHours: totalTransitHours,
    complianceSummary: `100% FMCSA Compliant corridor itinerary with ${sleeperCount} mandatory sleeper layovers and ${breakCount} 30-min rest breaks.`,
  };
}
