/**
 * Interstate Corridor Transit & HOS Legality Simulator.
 * Product 03 — Generates legally compliant multi-day itineraries
 * with mandatory 30-min rest breaks, 10-hr sleeper berths, and fuel stops.
 */

import type { CorridorItineraryPlan, HosWaypoint, DutyInterval, HosViolation } from './types';
import { HOS_LIMITS, auditDutyIntervals } from './hos';

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

  // Every iteration must consume finite positive distance. Enforce this at the
  // engine boundary as well as the UI, since adapters and bridges call it too.
  if (![distanceMiles, avgSpeedMph, initialDrivingHoursRemaining, initialShiftHoursRemaining].every(Number.isFinite)
    || distanceMiles <= 0 || avgSpeedMph <= 0 || distanceMiles / avgSpeedMph > 1000
    || initialDrivingHoursRemaining < 0 || initialDrivingHoursRemaining > HOS_LIMITS.MAX_DRIVE_HOURS_PER_SHIFT
    || initialShiftHoursRemaining < 0 || initialShiftHoursRemaining > HOS_LIMITS.MAX_ON_DUTY_HOURS_PER_SHIFT
    || !['solo', 'team'].includes(driverMode)) {
    throw new RangeError('Declare finite positive distance and speed, at most 1,000 driving hours, a supported driver mode and valid initial duty clocks.');
  }

  const waypoints: HosWaypoint[] = [];

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

  const driverAIntervals: DutyInterval[] = [];
  const driverBIntervals: DutyInterval[] = [];

  if (driverMode === 'team') {
    // Origin: Driver A does pre-trip, Driver B is off duty
    driverAIntervals.push({
      status: 'ON_DUTY_NOT_DRIVING',
      startMinutes: 0,
      durationMinutes: preTripMinutes,
      location: origin,
      remark: 'Driver A: Pre-Trip Inspection',
    });
    driverBIntervals.push({
      status: 'OFF_DUTY',
      startMinutes: 0,
      durationMinutes: preTripMinutes,
      location: origin,
      remark: 'Driver B: Passenger / Off Duty',
    });

    let activeDriver: 'A' | 'B' = 'A';
    let teamLegIndex = 0;

    // Team driving: Truck rolls continuously with scheduled driver rotations and mandatory 30m breaks
    while (remainingMiles > 0) {
      // Each driver stint is at most 10 hours driving (well under 11h driving cap)
      // If trip can be finished in this stint, only take required miles
      const stintDriveHours = Math.min(10, remainingMiles / avgSpeedMph);
      const stintMiles = Math.min(remainingMiles, stintDriveHours * avgSpeedMph);
      const currentDriverName = activeDriver === 'A' ? 'Driver A' : 'Driver B';
      const restingDriverName = activeDriver === 'A' ? 'Driver B' : 'Driver A';

      // If stint exceeds 8 hours of driving, FMCSA 49 CFR § 395.3(a)(3)(ii) requires a 30-min break
      if (stintDriveHours > 8) {
        const firstHalfHours = Number((stintDriveHours / 2).toFixed(2));
        const firstHalfMiles = firstHalfHours * avgSpeedMph;
        const firstHalfMinutes = Math.round((firstHalfMiles / avgSpeedMph) * 60);

        // Leg 1 of stint
        const leg1Start = currentTimeMinutes;
        currentMile += firstHalfMiles;
        currentTimeMinutes += firstHalfMinutes;
        pureDrivingMinutes += firstHalfMinutes;
        remainingMiles -= firstHalfMiles;

        waypoints.push({
          id: `wp-${waypointCounter++}`,
          type: 'DRIVING_LEG',
          title: `Team Driving Leg #${++teamLegIndex} (${Math.round(firstHalfMiles)} mi)`,
          location: `En Route Mile ${Math.round(currentMile)}`,
          distanceMiles: firstHalfMiles,
          cumulativeMiles: currentMile,
          durationMinutes: firstHalfMinutes,
          cumulativeTimeMinutes: currentTimeMinutes,
          dutyStatus: 'DRIVING',
          notes: `${currentDriverName} driving; ${restingDriverName} resting in Sleeper Berth.`,
        });

        if (activeDriver === 'A') {
          driverAIntervals.push({
            status: 'DRIVING',
            startMinutes: leg1Start,
            durationMinutes: firstHalfMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver A: Driving Leg',
          });
          driverBIntervals.push({
            status: 'SLEEPER_BERTH',
            startMinutes: leg1Start,
            durationMinutes: firstHalfMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver B: Resting in Sleeper Berth',
          });
        } else {
          driverBIntervals.push({
            status: 'DRIVING',
            startMinutes: leg1Start,
            durationMinutes: firstHalfMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver B: Driving Leg',
          });
          driverAIntervals.push({
            status: 'SLEEPER_BERTH',
            startMinutes: leg1Start,
            durationMinutes: firstHalfMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver A: Resting in Sleeper Berth',
          });
        }

        // 30-Minute Rest Break
        breakCount++;
        const breakDuration = 30;
        const breakStart = currentTimeMinutes;
        currentTimeMinutes += breakDuration;
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
          notes: `${currentDriverName} rest break; required after 8h driving (§ 395.3(a)(3)(ii)).`,
        });

        if (activeDriver === 'A') {
          driverAIntervals.push({
            status: 'OFF_DUTY',
            startMinutes: breakStart,
            durationMinutes: breakDuration,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver A: 30m Rest Break',
          });
          driverBIntervals.push({
            status: 'SLEEPER_BERTH',
            startMinutes: breakStart,
            durationMinutes: breakDuration,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver B: Resting in Sleeper Berth',
          });
        } else {
          driverBIntervals.push({
            status: 'OFF_DUTY',
            startMinutes: breakStart,
            durationMinutes: breakDuration,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver B: 30m Rest Break',
          });
          driverAIntervals.push({
            status: 'SLEEPER_BERTH',
            startMinutes: breakStart,
            durationMinutes: breakDuration,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver A: Resting in Sleeper Berth',
          });
        }

        // Leg 2 of stint
        const secondHalfMiles = Math.min(remainingMiles, (stintDriveHours - firstHalfHours) * avgSpeedMph);
        const secondHalfMinutes = Math.round((secondHalfMiles / avgSpeedMph) * 60);

        const leg2Start = currentTimeMinutes;
        currentMile += secondHalfMiles;
        currentTimeMinutes += secondHalfMinutes;
        pureDrivingMinutes += secondHalfMinutes;
        remainingMiles -= secondHalfMiles;

        waypoints.push({
          id: `wp-${waypointCounter++}`,
          type: 'DRIVING_LEG',
          title: `Team Driving Leg #${++teamLegIndex} (${Math.round(secondHalfMiles)} mi)`,
          location: `En Route Mile ${Math.round(currentMile)}`,
          distanceMiles: secondHalfMiles,
          cumulativeMiles: currentMile,
          durationMinutes: secondHalfMinutes,
          cumulativeTimeMinutes: currentTimeMinutes,
          dutyStatus: 'DRIVING',
          notes: `${currentDriverName} driving; ${restingDriverName} resting in Sleeper Berth.`,
        });

        if (activeDriver === 'A') {
          driverAIntervals.push({
            status: 'DRIVING',
            startMinutes: leg2Start,
            durationMinutes: secondHalfMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver A: Driving Leg',
          });
          driverBIntervals.push({
            status: 'SLEEPER_BERTH',
            startMinutes: leg2Start,
            durationMinutes: secondHalfMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver B: Resting in Sleeper Berth',
          });
        } else {
          driverBIntervals.push({
            status: 'DRIVING',
            startMinutes: leg2Start,
            durationMinutes: secondHalfMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver B: Driving Leg',
          });
          driverAIntervals.push({
            status: 'SLEEPER_BERTH',
            startMinutes: leg2Start,
            durationMinutes: secondHalfMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver A: Resting in Sleeper Berth',
          });
        }
      } else {
        // Continuous leg under 8 hours (no break needed)
        const legMinutes = Math.round((stintMiles / avgSpeedMph) * 60);
        const legStart = currentTimeMinutes;
        currentMile += stintMiles;
        currentTimeMinutes += legMinutes;
        pureDrivingMinutes += legMinutes;
        remainingMiles -= stintMiles;

        waypoints.push({
          id: `wp-${waypointCounter++}`,
          type: 'DRIVING_LEG',
          title: `Team Driving Leg #${++teamLegIndex} (${Math.round(stintMiles)} mi)`,
          location: `En Route Mile ${Math.round(currentMile)}`,
          distanceMiles: stintMiles,
          cumulativeMiles: currentMile,
          durationMinutes: legMinutes,
          cumulativeTimeMinutes: currentTimeMinutes,
          dutyStatus: 'DRIVING',
          notes: `${currentDriverName} behind wheel; ${restingDriverName} resting in Sleeper Berth.`,
        });

        if (activeDriver === 'A') {
          driverAIntervals.push({
            status: 'DRIVING',
            startMinutes: legStart,
            durationMinutes: legMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver A: Driving Leg',
          });
          driverBIntervals.push({
            status: 'SLEEPER_BERTH',
            startMinutes: legStart,
            durationMinutes: legMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver B: Resting in Sleeper Berth',
          });
        } else {
          driverBIntervals.push({
            status: 'DRIVING',
            startMinutes: legStart,
            durationMinutes: legMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver B: Driving Leg',
          });
          driverAIntervals.push({
            status: 'SLEEPER_BERTH',
            startMinutes: legStart,
            durationMinutes: legMinutes,
            location: `Mile ${Math.round(currentMile)}`,
            remark: 'Driver A: Resting in Sleeper Berth',
          });
        }
      }

      if (remainingMiles > 0) {
        // Driver swap + pre-trip inspection (15 min)
        const swapMinutes = 15;
        const swapStart = currentTimeMinutes;
        currentTimeMinutes += swapMinutes;
        totalOnDutyMinutes += swapMinutes;

        waypoints.push({
          id: `wp-${waypointCounter++}`,
          type: 'FUEL_INSPECTION',
          title: `Driver Swap & Pre-Trip Inspection (${restingDriverName} takes wheel)`,
          location: `Interstate Travel Plaza (MP ${Math.round(currentMile)})`,
          distanceMiles: 0,
          cumulativeMiles: currentMile,
          durationMinutes: swapMinutes,
          cumulativeTimeMinutes: currentTimeMinutes,
          dutyStatus: 'ON_DUTY_NOT_DRIVING',
          notes: `${currentDriverName} shifts to Sleeper Berth; ${restingDriverName} conducts inspection and takes wheel.`,
        });

        if (activeDriver === 'A') {
          driverAIntervals.push({
            status: 'SLEEPER_BERTH',
            startMinutes: swapStart,
            durationMinutes: swapMinutes,
            location: `Travel Plaza MP ${Math.round(currentMile)}`,
            remark: 'Driver A: Shift to Sleeper',
          });
          driverBIntervals.push({
            status: 'ON_DUTY_NOT_DRIVING',
            startMinutes: swapStart,
            durationMinutes: swapMinutes,
            location: `Travel Plaza MP ${Math.round(currentMile)}`,
            remark: 'Driver B: Pre-Drive Inspection & Fuel',
          });
        } else {
          driverBIntervals.push({
            status: 'SLEEPER_BERTH',
            startMinutes: swapStart,
            durationMinutes: swapMinutes,
            location: `Travel Plaza MP ${Math.round(currentMile)}`,
            remark: 'Driver B: Shift to Sleeper',
          });
          driverAIntervals.push({
            status: 'ON_DUTY_NOT_DRIVING',
            startMinutes: swapStart,
            durationMinutes: swapMinutes,
            location: `Travel Plaza MP ${Math.round(currentMile)}`,
            remark: 'Driver A: Pre-Drive Inspection & Fuel',
          });
        }

        // Toggle active driver
        activeDriver = activeDriver === 'A' ? 'B' : 'A';
      }
    }

    // Destination: Active driver does post-trip, other remains off duty
    const postTripStart = currentTimeMinutes;
    if (activeDriver === 'A') {
      driverAIntervals.push({
        status: 'ON_DUTY_NOT_DRIVING',
        startMinutes: postTripStart,
        durationMinutes: 20,
        location: destination,
        remark: 'Driver A: Consignee Post-Trip',
      });
      driverBIntervals.push({
        status: 'OFF_DUTY',
        startMinutes: postTripStart,
        durationMinutes: 20,
        location: destination,
        remark: 'Driver B: Off Duty Post-Trip',
      });
    } else {
      driverBIntervals.push({
        status: 'ON_DUTY_NOT_DRIVING',
        startMinutes: postTripStart,
        durationMinutes: 20,
        location: destination,
        remark: 'Driver B: Consignee Post-Trip',
      });
      driverAIntervals.push({
        status: 'OFF_DUTY',
        startMinutes: postTripStart,
        durationMinutes: 20,
        location: destination,
        remark: 'Driver A: Off Duty Post-Trip',
      });
    }
  } else {
    // Solo driving: Strictly adheres to 11-hr drive, 14-hr window, and 8-hr break rules
    while (remainingMiles > 0) {
      // Check if driver needs a mandatory 30-min break after 8 hours of driving
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

      // Check if driver exhausted 11h drive cap or 14h shift window (needs 10-hour sleeper berth reset)
      if (shiftDriveMinutesRemaining <= 0 || shiftWindowMinutesRemaining <= 0) {
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

  let isLegal = false;
  let violations: HosViolation[] = [];

  if (driverMode === 'team') {
    // Audit both Driver A and Driver B separately for team operations
    const auditA = auditDutyIntervals(driverAIntervals);
    const auditB = auditDutyIntervals(driverBIntervals);
    isLegal = auditA.isCompliant && auditB.isCompliant;
    violations = [...auditA.violations, ...auditB.violations];
  } else {
    // Convert waypoints into continuous DutyIntervals and validate through the independent HOS engine
    const dutyIntervals: DutyInterval[] = [];
    let t = 0;
    for (const wp of waypoints) {
      dutyIntervals.push({
        status: wp.dutyStatus,
        startMinutes: t,
        durationMinutes: wp.durationMinutes,
        location: wp.location,
        remark: wp.title,
      });
      t += wp.durationMinutes;
    }
    const audit = auditDutyIntervals(dutyIntervals);
    isLegal = audit.isCompliant;
    violations = audit.violations;
  }

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
    isLegal,
    violations,
    waypoints,
    earliestLegalDeliveryEtaHours: totalTransitHours,
    complianceSummary: isLegal
      ? `Feasible FMCSA Part 395 corridor scenario with ${sleeperCount} sleeper layover(s) and ${breakCount} 30-min break(s).`
      : `HOS Compliance Violations Detected (${violations.length} issue(s)): Itinerary violates statutory rules.`,
  };
}
