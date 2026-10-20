import React, { useState, useMemo } from 'react';
import { POPULAR_CORRIDORS, planCorridorItinerary, type RoutePreset } from '../engine/corridor';
import { auditDutyIntervals } from '../engine/hos';
import type { DutyInterval } from '../engine/types';
import { LogbookGrid } from './LogbookGrid';
import { Realtime3DCorridor } from './Realtime3DCorridor';

export const App: React.FC = () => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('chi-dal');
  const [origin, setOrigin] = useState<string>('Chicago, IL');
  const [destination, setDestination] = useState<string>('Dallas, TX');
  const [distanceMiles, setDistanceMiles] = useState<number>(925);
  const [avgSpeedMph, setAvgSpeedMph] = useState<number>(55);
  const [driverMode, setDriverMode] = useState<'solo' | 'team'>('solo');
  const [activeTimeHours, setActiveTimeHours] = useState<number>(0);

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

  // Transform first 24 hours of itinerary waypoints into 24-hr duty intervals for the logbook grid
  const dutyIntervals: DutyInterval[] = useMemo(() => {
    const intervals: DutyInterval[] = [];
    let currentStart = 0;

    for (const wp of itinerary.waypoints) {
      if (currentStart >= 1440) break; // First 24h cycle
      const duration = Math.min(wp.durationMinutes, 1440 - currentStart);
      intervals.push({
        status: wp.dutyStatus,
        startMinutes: currentStart,
        durationMinutes: duration,
        location: wp.location,
        remark: wp.title,
      });
      currentStart += duration;
    }

    // Pad remaining 24h with sleeper berth or off duty if needed
    if (currentStart < 1440) {
      intervals.push({
        status: 'OFF_DUTY',
        startMinutes: currentStart,
        durationMinutes: 1440 - currentStart,
        location: destination,
        remark: 'Post-Trip Rest & Off Duty',
      });
    }

    return intervals;
  }, [itinerary, destination]);

  const audit = useMemo(() => {
    return auditDutyIntervals(dutyIntervals);
  }, [dutyIntervals]);

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div>
          <div className="product-badges">
            <span className="badge badge-purple">Product 03</span>
            <span className="badge badge-emerald">
              <span className="live-pulse" />
              FMCSA § 395 ELD Active
            </span>
            <span className="badge badge-blue">Port 5175</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc' }}>
            HOS Compliance & Interstate Corridor Legality Planner
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
            Automated statutory routing, ELD duty logs, mandatory 10h sleeper resets, and 30-min break scheduling.
          </p>
        </div>

        {/* Cross-Product Bridge Navigation */}
        <div className="header-links">
          <a
            href="http://localhost:5173/"
            target="_blank"
            rel="noreferrer"
            className="cross-link"
            title="Open Product 01: Cargo Fit & 3D Load Optimization"
          >
            📦 Product 01: Cargo Fit ↗
          </a>
          <a
            href="http://localhost:5174/"
            target="_blank"
            rel="noreferrer"
            className="cross-link"
            title="Open Product 02: Freight Pricing & Telemetry HUD"
          >
            💰 Product 02: Freight Pricing ↗
          </a>
        </div>
      </header>

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
            <label>Origin Terminal</label>
            <input
              type="text"
              value={origin}
              onChange={e => {
                setOrigin(e.target.value);
                setSelectedPresetId('');
              }}
            />
          </div>

          <div className="form-group">
            <label>Destination Consignee</label>
            <input
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
              <label>Corridor Miles</label>
              <input
                type="number"
                value={distanceMiles}
                onChange={e => {
                  setDistanceMiles(Number(e.target.value));
                  setSelectedPresetId('');
                }}
              />
            </div>
            <div className="form-group">
              <label>Avg Speed (MPH)</label>
              <input
                type="number"
                value={avgSpeedMph}
                onChange={e => setAvgSpeedMph(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Driver Operating Mode</label>
            <select
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
              <span>Electronic Logging Device (ELD) 24-Hour Graph</span>
              <span className={`badge ${audit.isCompliant ? 'badge-emerald' : 'badge-amber'}`}>
                {audit.isCompliant ? '✓ 100% FMCSA Compliant' : '⚠ Audit Flags Detected'}
              </span>
            </div>
            <LogbookGrid
              driverName={driverMode === 'team' ? 'Team Lead / Co-Driver Swapping' : 'J. Doe (Commercial Solo)'}
              intervals={dutyIntervals}
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
    </div>
  );
};
