import React, { useState, useMemo } from 'react';
import { POPULAR_CORRIDORS, planCorridorItinerary, type RoutePreset } from '../engine/corridor';
import { auditDutyIntervals } from '../engine/hos';
import type { DutyInterval } from '../engine/types';
import { LogbookGrid } from './LogbookGrid';
import { Realtime3DCorridor } from './Realtime3DCorridor';
import { SuiteDock } from './SuiteDock';

export const App: React.FC = () => {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const source = params.get('source');

  const [selectedPresetId, setSelectedPresetId] = useState<string>(source ? 'custom' : 'chi-dal');
  const [origin, setOrigin] = useState<string>(() => {
    if (params.get('origin')) return params.get('origin')!;
    if (params.get('locationCity')) return `${params.get('locationCity')}, ${params.get('locationState') || 'US'}`;
    return 'Chicago, IL';
  });
  const [destination, setDestination] = useState<string>(() => {
    if (params.get('destination')) return params.get('destination')!;
    return 'Dallas, TX';
  });
  const [distanceMiles, setDistanceMiles] = useState<number>(() => {
    const m = Number(params.get('miles'));
    return m > 0 ? m : 925;
  });
  const [avgSpeedMph, setAvgSpeedMph] = useState<number>(() => {
    const s = Number(params.get('speed')) || Number(params.get('speedMph'));
    return s > 0 ? s : 55;
  });
  const [driverMode, setDriverMode] = useState<'solo' | 'team'>(() => {
    const dm = params.get('driverMode');
    return dm === 'team' ? 'team' : 'solo';
  });
  const [activeTimeHours, setActiveTimeHours] = useState<number>(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);

  const [importedBanner, setImportedBanner] = useState<{ title: string; subtitle: string; source: string } | null>(() => {
    if (source === 'asset_studio_p04') {
      const vName = params.get('vehicleName') || 'Asset Studio Vehicle';
      const m = params.get('miles');
      return {
        title: `Imported Corridor Spec from Product 04 (Asset Studio)`,
        subtitle: `Equipment: ${vName} · Lane Distance: ${m ? `${m} mi` : 'Specified'} · Range: ${params.get('rangeMiles') || 'N/A'} mi`,
        source: 'P04',
      };
    }
    if (source === 'product-05-telematics') {
      const driver = params.get('driverName') || 'Assigned Driver';
      const loc = `${params.get('locationCity') || 'En Route'}, ${params.get('locationState') || 'US'}`;
      const status = params.get('currentDutyStatus') || 'DRIVING';
      return {
        title: `Live Driver Telematics Stream from Product 05`,
        subtitle: `Driver: ${driver} · Live GPS: ${loc} · Active Status: ${status.replace('_', ' ').toUpperCase()}`,
        source: 'P05',
      };
    }
    return null;
  });

  const handleSelectPreset = (preset: RoutePreset) => {
    setSelectedPresetId(preset.id);
    setOrigin(preset.origin);
    setDestination(preset.destination);
    setDistanceMiles(preset.distanceMiles);
  };

  // Compute legal corridor itinerary
  const itinerary = useMemo(() => {
    return planCorridorItinerary({
      origin,
      destination,
      distanceMiles,
      avgSpeedMph,
      driverMode,
    });
  }, [origin, destination, distanceMiles, avgSpeedMph, driverMode]);

  // Transform entire itinerary waypoints into continuous DutyIntervals
  const allDutyIntervals: DutyInterval[] = useMemo(() => {
    const intervals: DutyInterval[] = [];
    let currentStart = 0;

    for (const wp of itinerary.waypoints) {
      intervals.push({
        status: wp.dutyStatus,
        startMinutes: currentStart,
        durationMinutes: wp.durationMinutes,
        location: wp.location,
        remark: wp.title,
      });
      currentStart += wp.durationMinutes;
    }

    return intervals;
  }, [itinerary]);

  // Full itinerary audit across all days
  const audit = useMemo(() => {
    return auditDutyIntervals(allDutyIntervals);
  }, [allDutyIntervals]);

  // Total calendar/transit days in the plan
  const totalDays = useMemo(() => {
    const totalMinutes = allDutyIntervals.reduce((sum, it) => sum + it.durationMinutes, 0);
    return Math.max(1, Math.ceil(totalMinutes / 1440));
  }, [allDutyIntervals]);

  // Slice intervals for the currently selected day (0-24h window)
  const activeDayIntervals: DutyInterval[] = useMemo(() => {
    const dayStartMin = selectedDayIndex * 1440;
    const dayEndMin = (selectedDayIndex + 1) * 1440;
    const dayIntervals: DutyInterval[] = [];

    for (const it of allDutyIntervals) {
      const itStart = it.startMinutes;
      const itEnd = it.startMinutes + it.durationMinutes;

      // Overlaps current day window
      if (itEnd > dayStartMin && itStart < dayEndMin) {
        const clampedStart = Math.max(itStart, dayStartMin);
        const clampedEnd = Math.min(itEnd, dayEndMin);
        const duration = clampedEnd - clampedStart;

        dayIntervals.push({
          status: it.status,
          startMinutes: clampedStart - dayStartMin, // Relative to day midnight (0..1440)
          durationMinutes: duration,
          location: it.location,
          remark: it.remark,
        });
      }
    }

    // Pad remaining 24h with sleeper berth or off duty if needed
    const lastEnd = dayIntervals.length > 0
      ? dayIntervals[dayIntervals.length - 1].startMinutes + dayIntervals[dayIntervals.length - 1].durationMinutes
      : 0;

    if (lastEnd < 1440) {
      dayIntervals.push({
        status: 'OFF_DUTY',
        startMinutes: lastEnd,
        durationMinutes: 1440 - lastEnd,
        location: destination,
        remark: 'Post-Trip Rest & Off Duty',
      });
    }

    return dayIntervals;
  }, [allDutyIntervals, selectedDayIndex, destination]);

  const isCloud = typeof window !== 'undefined' && (window.location.hostname.includes('pages.dev') || window.location.hostname.includes('trucking.io'));
  const p01Url = isCloud ? 'https://cargofit.pages.dev' : 'http://localhost:5173';
  const p02Url = isCloud ? 'https://freightpricing.pages.dev' : 'http://localhost:5174';
  const p04Url = isCloud ? 'https://fleetstudio.pages.dev' : 'http://localhost:5176';

  return (
    <main className="app-container">
      <SuiteDock currentProductId="product-03-hos-planner" />
      {/* Top Header */}
      <header className="app-header">
        <div>
          <div className="product-badges">
            <span className="badge badge-purple">Product 03</span>
            <span className="badge badge-emerald">
              <span className="live-pulse" />
              Scenario Estimator (Indicative)
            </span>
            <span className="badge badge-blue">Port 5175</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc' }}>
            HOS Compliance &amp; Interstate Corridor Legality Planner
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
            Automated statutory routing, simulated duty logs, mandatory 10h sleeper resets, and 30-min break scheduling.
          </p>
        </div>

        {/* Cross-Product Bridge Navigation */}
        <div className="header-links">
          <a
            href={p01Url}
            target="_blank"
            rel="noreferrer"
            className="cross-link"
            title="Open Product 01: Cargo Fit & 3D Load Optimization"
          >
            📦 Product 01: Cargo Fit ↗
          </a>
          <a
            href={p02Url}
            target="_blank"
            rel="noreferrer"
            className="cross-link"
            title="Open Product 02: Freight Pricing & Telemetry HUD"
          >
            💰 Product 02: Freight Pricing ↗
          </a>
          <a
            href={p04Url}
            target="_blank"
            rel="noreferrer"
            className="cross-link"
            style={{ borderColor: '#38bdf8', color: '#38bdf8' }}
            title="Open Product 04: Fleet & Cargo Asset Studio"
          >
            🚛 Product 04: Asset Studio ↗
          </a>
        </div>
      </header>

      {/* Cross-Product Inbound Bridge Banner */}
      {importedBanner && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.15), rgba(16, 185, 129, 0.15))',
          border: '1px solid #38bdf8',
          borderRadius: '8px',
          padding: '12px 18px',
          margin: '0 0 20px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 0 15px rgba(56, 189, 248, 0.2)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: '#38bdf8',
                color: '#000',
                fontSize: '10px',
                fontWeight: 900,
                padding: '2px 6px',
                borderRadius: '4px'
              }}>BRIDGE INTAKE</span>
              <strong style={{ color: '#fff', fontSize: '14px' }}>{importedBanner.title}</strong>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: 4, fontFamily: 'monospace' }}>
              {importedBanner.subtitle}
            </p>
          </div>
          <button
            onClick={() => setImportedBanner(null)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#94a3b8',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* FMCSA Clocks Banner */}
      <div className="clocks-grid">
        <div className="clock-card">
          <div className="clock-title">
            <span>11-Hour Drive Clock</span>
            <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 800 }}>
              {driverMode === 'team' ? 'TEAM EXPEDITED' : 'SOLO CAP'}
            </span>
          </div>
          <div className="clock-value">
            {driverMode === 'team' ? '11.0' : Math.max(0, 11 - (itinerary.pureDrivingHours % 11)).toFixed(1)}
            <span>/ 11.0 hrs</span>
          </div>
          <div className="clock-bar-bg">
            <div
              className="clock-bar-fill"
              style={{
                width: `${driverMode === 'team' ? 100 : Math.min(100, ((11 - (itinerary.pureDrivingHours % 11)) / 11) * 100)}%`,
                backgroundColor: '#38bdf8',
              }}
            />
          </div>
        </div>

        <div className="clock-card">
          <div className="clock-title">
            <span>14-Hour Shift Window</span>
            <span style={{ fontSize: '10px', color: '#c084fc', fontWeight: 800 }}>
              {driverMode === 'team' ? 'CONTINUOUS' : 'WINDOW CAP'}
            </span>
          </div>
          <div className="clock-value">
            {driverMode === 'team' ? '14.0' : Math.max(0, 14 - ((itinerary.pureDrivingHours + itinerary.totalOnDutyHours) % 14)).toFixed(1)}
            <span>/ 14.0 hrs</span>
          </div>
          <div className="clock-bar-bg">
            <div
              className="clock-bar-fill"
              style={{
                width: `${driverMode === 'team' ? 100 : Math.min(100, ((14 - ((itinerary.pureDrivingHours + itinerary.totalOnDutyHours) % 14)) / 14) * 100)}%`,
                backgroundColor: '#c084fc',
              }}
            />
          </div>
        </div>

        <div className="clock-card">
          <div className="clock-title">
            <span>30-Min Rest Break</span>
            <span style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 800 }}>8H TRIGGER</span>
          </div>
          <div className="clock-value">
            {driverMode === 'team' ? '8.0' : '8.0'}
            <span>/ 8.0 hrs max</span>
          </div>
          <div className="clock-bar-bg">
            <div
              className="clock-bar-fill"
              style={{ width: '100%', backgroundColor: '#fbbf24' }}
            />
          </div>
        </div>

        <div className="clock-card">
          <div className="clock-title">
            <span>70-Hour / 8-Day Cycle</span>
            <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 800 }}>STATUTORY OK</span>
          </div>
          <div className="clock-value">
            {Math.max(0, 70 - itinerary.pureDrivingHours - itinerary.totalOnDutyHours).toFixed(1)}
            <span>/ 70.0 hrs</span>
          </div>
          <div className="clock-bar-bg">
            <div
              className="clock-bar-fill"
              style={{
                width: `${Math.max(10, ((70 - itinerary.pureDrivingHours) / 70) * 100)}%`,
                backgroundColor: '#34d399',
              }}
            />
          </div>
        </div>
      </div>

      {/* Realtime 3D Isometric Corridor Digital Twin */}
      <Realtime3DCorridor
        plan={itinerary}
        activeTimeHours={activeTimeHours}
        onTimeChange={setActiveTimeHours}
      />

      {/* Main Two-Column View */}
      <div className="main-grid">
        {/* Left Column: Corridor Selection & Parameters */}
        <div className="card">
          <div className="card-title">
            <span>Corridor Parameters</span>
            <span className="badge badge-blue">{driverMode.toUpperCase()}</span>
          </div>

          {/* Popular Corridors */}
          <div className="form-group">
            <label>High-Density Freight Presets</label>
            <div className="preset-pills">
              {POPULAR_CORRIDORS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`preset-btn ${selectedPresetId === preset.id ? 'active' : ''}`}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{preset.origin} → {preset.destination}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{preset.name}</div>
                  </div>
                  <span className="font-mono text-xs">{preset.distanceMiles} mi</span>
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields */}
          <div className="form-group">
            <label htmlFor="origin-terminal-input">Origin Terminal</label>
            <input
              id="origin-terminal-input"
              aria-label="Origin Terminal"
              type="text"
              value={origin}
              onChange={e => {
                setOrigin(e.target.value);
                setSelectedPresetId('');
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="destination-consignee-input">Destination Consignee</label>
            <input
              id="destination-consignee-input"
              aria-label="Destination Consignee"
              type="text"
              value={destination}
              onChange={e => {
                setDestination(e.target.value);
                setSelectedPresetId('');
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label htmlFor="corridor-miles-input">Corridor Miles</label>
              <input
                id="corridor-miles-input"
                aria-label="Corridor Distance in Miles"
                type="number"
                value={distanceMiles}
                onChange={e => {
                  setDistanceMiles(Number(e.target.value));
                  setSelectedPresetId('');
                }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="avg-speed-input">Avg Speed (MPH)</label>
              <input
                id="avg-speed-input"
                aria-label="Average Speed in Miles Per Hour"
                type="number"
                value={avgSpeedMph}
                onChange={e => setAvgSpeedMph(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="driver-operating-mode-select">Driver Operating Mode</label>
            <select
              id="driver-operating-mode-select"
              aria-label="Driver Operating Mode Selection"
              value={driverMode}
              onChange={e => setDriverMode(e.target.value as 'solo' | 'team')}
            >
              <option value="solo">Solo Commercial Driver (FMCSA Strict)</option>
              <option value="team">Team Drivers (Continuous Transit / Hot Seat)</option>
            </select>
          </div>

          {/* Summary Box */}
          <div style={{ marginTop: '16px', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
              Transit & Compliance Breakdown
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span style={{ color: '#cbd5e1' }}>Total Transit Time:</span>
              <strong style={{ color: '#38bdf8' }}>{itinerary.totalTransitHours} Hours</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span style={{ color: '#cbd5e1' }}>Pure Road Driving:</span>
              <strong style={{ color: '#f8fafc' }}>{itinerary.pureDrivingHours} Hours</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span style={{ color: '#cbd5e1' }}>10h Sleeper Layovers:</span>
              <strong style={{ color: '#c084fc' }}>{itinerary.mandatorySleeperCount}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: '#cbd5e1' }}>30m Mandatory Breaks:</span>
              <strong style={{ color: '#fbbf24' }}>{itinerary.mandatory30mBreakCount}</strong>
            </div>
          </div>
        </div>

        {/* Right Column: 24-hr Logbook Grid & Waypoint Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Statutory Logbook Section */}
          <div className="card">
            <div className="card-title">
              <span>24-Hour Duty Status Graph (Scenario Model)</span>
              <span className={`badge ${audit.isCompliant ? 'badge-emerald' : 'badge-rose'}`} style={{ color: audit.isCompliant ? '#34d399' : '#f87171' }}>
                {audit.isCompliant ? '✓ Feasible Under Modeled Rules' : `⚠ ${audit.violations.length} Violation(s) Detected`}
              </span>
            </div>

            {/* Multi-Day Navigation Tabs if transit spans >24 hours */}
            {totalDays > 1 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                {Array.from({ length: totalDays }).map((_, dIdx) => (
                  <button
                    key={dIdx}
                    type="button"
                    onClick={() => setSelectedDayIndex(dIdx)}
                    style={{
                      background: selectedDayIndex === dIdx ? '#38bdf8' : '#1e293b',
                      color: selectedDayIndex === dIdx ? '#000000' : '#cbd5e1',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Day {dIdx + 1} (Hours {dIdx * 24}–{(dIdx + 1) * 24})
                  </button>
                ))}
              </div>
            )}

            {/* Violation Details Banner if detected */}
            {!audit.isCompliant && audit.violations.length > 0 && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px' }}>
                <strong style={{ color: '#ef4444', fontSize: '13px' }}>Regulatory Violations Detected:</strong>
                <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: '12px', color: '#fca5a5' }}>
                  {audit.violations.map((v, vIdx) => (
                    <li key={vIdx} style={{ marginBottom: '4px' }}>
                      <strong>{v.rule}:</strong> {v.message} <br />
                      <span style={{ color: '#94a3b8' }}>Remedy: {v.statutoryRemedy}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <LogbookGrid
              driverName={driverMode === 'team' ? 'Team Lead / Co-Driver Swapping' : 'J. Doe (Commercial Solo)'}
              dateLabel={`Day ${selectedDayIndex + 1} of ${totalDays}`}
              intervals={activeDayIntervals}
            />
          </div>

          {/* Waypoints & Layover Itinerary */}
          <div className="card">
            <div className="card-title">
              <span>Interstate Waypoints & Scheduled Layovers</span>
              <span className="badge badge-purple">{itinerary.waypoints.length} Leg Segments</span>
            </div>

            <div className="waypoint-list">
              {itinerary.waypoints.map(wp => {
                const getIconClass = () => {
                  switch (wp.type) {
                    case 'ORIGIN_PICKUP': return 'icon-origin';
                    case 'DRIVING_LEG': return 'icon-drive';
                    case 'MANDATORY_30M_BREAK': return 'icon-break';
                    case 'SLEEPER_10H_REST': return 'icon-rest';
                    case 'FUEL_INSPECTION': return 'icon-break';
                    case 'DESTINATION_DROPOFF': return 'icon-dest';
                    default: return 'icon-drive';
                  }
                };

                const getIconSymbol = () => {
                  switch (wp.type) {
                    case 'ORIGIN_PICKUP': return '📦';
                    case 'DRIVING_LEG': return '🛣️';
                    case 'MANDATORY_30M_BREAK': return '☕';
                    case 'SLEEPER_10H_REST': return '🛌';
                    case 'FUEL_INSPECTION': return '⛽';
                    case 'DESTINATION_DROPOFF': return '🏁';
                    default: return '📍';
                  }
                };

                const hours = (wp.cumulativeTimeMinutes / 60).toFixed(1);

                return (
                  <div key={wp.id} className="waypoint-item">
                    <div className={`waypoint-icon ${getIconClass()}`}>
                      {getIconSymbol()}
                    </div>
                    <div className="waypoint-content">
                      <div className="waypoint-head">
                        <span className="waypoint-title">{wp.title}</span>
                        <span className="waypoint-time">T+{hours}h | Mile {Math.round(wp.cumulativeMiles)}</span>
                      </div>
                      <div className="waypoint-location">{wp.location}</div>
                      <div className="waypoint-desc">{wp.notes}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
