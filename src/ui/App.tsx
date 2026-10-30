import React, { useState, useMemo, useEffect } from 'react';
import { POPULAR_CORRIDORS, planCorridorItinerary, type RoutePreset } from '../engine/corridor';
import { auditDutyIntervals } from '../engine/hos';
import type { DutyInterval, CorridorItineraryPlan } from '../engine/types';
import { platformBus } from '../engine/platformBus';
import { LogbookGrid } from './LogbookGrid';
import { Realtime3DCorridor } from './Realtime3DCorridor';
import { SuiteDock } from './SuiteDock';
import {
  IconPackage,
  IconHighway,
  IconCoffee,
  IconBed,
  IconFuel,
  IconFlag,
  IconMapPin,
} from './icons';
import { EldAuditModal } from './EldAuditModal';
import { SplitSleeperModal } from './SplitSleeperModal';
import { HosExemptionsModal } from './HosExemptionsModal';
import { useShipmentSession } from '../suite/ShipmentSession';
import { useShipmentDraft } from '../suite/useShipmentDraft';
import { StructuredValue } from '../suite/ShipmentInspector';
import { dutyForShipment, intervalsForPlan, resultForDutyPlan, validateDutyDraft } from '../engine/shipmentAdapter';

export const App: React.FC = () => {
  const session = useShipmentSession();
  const [priorRestHours, setPriorRestHours] = useState(10);
  const [publicationMessage, setPublicationMessage] = useState('');
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
  const [activeTeamDriver, setActiveTeamDriver] = useState<'A' | 'B'>('A');
  const [activeTimeHours, setActiveTimeHours] = useState<number>(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [isSplitSleeperModalOpen, setIsSplitSleeperModalOpen] = useState<boolean>(false);
  const [isExemptionsModalOpen, setIsExemptionsModalOpen] = useState<boolean>(false);
  const nativeInputs = { origin, destination, distanceMiles, avgSpeedMph, driverMode, priorRestHours };
  const draft = useShipmentDraft({ value: nativeInputs, importValue: dutyForShipment, applyValue: next => {
    setSelectedPresetId('custom'); setOrigin(next.origin); setDestination(next.destination);
    setDistanceMiles(next.distanceMiles); setAvgSpeedMph(next.avgSpeedMph); setDriverMode(next.driverMode); setPriorRestHours(next.priorRestHours);
    setSelectedDayIndex(0); setActiveTimeHours(0); setPublicationMessage('');
  } });
  const inputError = validateDutyDraft(nativeInputs);


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
    if (inputError) return { origin, destination, totalDistanceMiles: 0, avgSpeedMph: 0, driverMode, totalTransitHours: 0, pureDrivingHours: 0, totalOnDutyHours: 0, totalRestHours: 0, mandatorySleeperCount: 0, mandatory30mBreakCount: 0, isLegal: false, violations: [], waypoints: [], earliestLegalDeliveryEtaHours: 0, complianceSummary: inputError } satisfies CorridorItineraryPlan;
    return planCorridorItinerary({
      origin,
      destination,
      distanceMiles,
      avgSpeedMph,
      driverMode,
    });
  }, [origin, destination, distanceMiles, avgSpeedMph, driverMode, inputError]);

  useEffect(() => {
    platformBus.publish('HOS_SCHEDULE_UPDATED', {
      corridorId: selectedPresetId,
      totalTransitHours: itinerary.totalTransitHours,
      driverMode,
      layoverCount: itinerary.mandatorySleeperCount,
      isLegal: itinerary.isLegal,
    });
  }, [selectedPresetId, itinerary.totalTransitHours, driverMode, itinerary.mandatorySleeperCount, itinerary.isLegal]);

  // Transform entire itinerary waypoints into continuous DutyIntervals
  const allDutyIntervals: DutyInterval[] = useMemo(() => {
    if (driverMode === 'team' && itinerary.driverAIntervals && itinerary.driverBIntervals) {
      return activeTeamDriver === 'A' ? itinerary.driverAIntervals : itinerary.driverBIntervals;
    }
    return intervalsForPlan(itinerary);
  }, [itinerary, driverMode, activeTeamDriver]);

  // Full itinerary audit across all days
  const audit = useMemo(() => {
    return inputError ? { isCompliant: false, violations: [], totalDrivingMinutes: 0, totalOnDutyMinutes: 0, totalOffDutyMinutes: 0 } : auditDutyIntervals(allDutyIntervals);
  }, [allDutyIntervals, inputError]);
  const reviewed = useMemo(() => {
    if (!session?.shipment) return null;
    try { return { result: resultForDutyPlan(session.shipment, nativeInputs, itinerary, audit), error: '' }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : 'Duty plan cannot be published.' }; }
  }, [session?.shipment, origin, destination, distanceMiles, avgSpeedMph, driverMode, priorRestHours, itinerary, audit]);

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

  return (
    <main id="main-content" className="app-container">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <SuiteDock currentProductId="product-03-hos-planner" />
      {session?.selectedId && <section className="shipment-native-panel" aria-label="Shipment duty task">
        <div className="shipment-native-heading"><div><span className="shipment-native-kicker">DUTY DECISION</span><h2>{itinerary.totalTransitHours} modeled transit hours</h2></div><span>{draft.dirty ? 'Local assumptions changed' : 'Reviewed shared assumptions'}</span></div>
        <p>{origin} → {destination} · {distanceMiles} mi · {avgSpeedMph} mph · {driverMode} · {priorRestHours} h declared prior rest</p>
        <div className="shipment-task-buttons">
          <button className="shipment-primary" disabled={!draft.canPublish || !reviewed?.result} onClick={async () => { if (!reviewed?.result || !draft.basis) return; const next = await session.submit('evaluate', { stage: 'hos', result: reviewed.result }, draft.basis.revision); if (next) { draft.acknowledge(next, nativeInputs); setPublicationMessage('Exact reviewed duty assumptions, itinerary and audit saved to the scenario.'); } }}>Publish reviewed duty plan</button>
          <button onClick={() => session.inspect('stage:hos')}>Saved duty details</button>
          <button disabled={session.busy || !session.online} onClick={draft.loadCurrent}>Load current shared inputs</button>
          <a href={session.productUrl('command-center-portal')}>Review dispatch readiness</a>
        </div>
        <p role="status">{session.shipment?.status !== 'draft' ? 'Planning is locked after dispatch. Saved duty evidence remains inspectable; local studies do not change it.' : draft.incoming ? 'The shipment changed. Your local duty draft is retained. Load current shared inputs before publishing.' : draft.error || reviewed?.error || publicationMessage || (session.online ? 'Connected publication supports the canonical lane and solo full-rest declaration. Speed is saved exactly as reviewed.' : 'Offline local duty study. Reconnect and load shared inputs before publishing.')}</p>
        <details className="shipment-draft-fields"><summary>Reviewed itinerary, audit, assumptions and source</summary><StructuredValue value={reviewed?.result?.details ?? { nativeInputs, itinerary, audit }} /></details>
      </section>}
      {!session?.selectedId && <p className="native-local-note">{draft.detached ? 'Detached local duty study. Inputs are retained; edits do not update the shared shipment.' : 'Independent duty planner. Presets, team exploration and modeled logs remain available without a shared shipment.'}</p>}
      {inputError && <p className="native-input-error" role="alert">{inputError}</p>}
      <p style={{ padding: '12px 20px' }}>Planning simulation using full ten-hour rest resets. Split-sleeper pairing and live ELD history are not supported; confirm operational decisions with the assigned driver and source records.</p>
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
      <details className="native-secondary-view" open={!session?.selectedId}><summary>Corridor simulation and timeline</summary>
      {!inputError && <Realtime3DCorridor
        plan={itinerary}
        activeTimeHours={activeTimeHours}
        onTimeChange={setActiveTimeHours}
      />}</details>

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

          <div className="form-group">
            <label htmlFor="prior-rest-hours">Declared prior full rest (hours)</label>
            <input id="prior-rest-hours" type="number" min="10" value={priorRestHours} onChange={event => setPriorRestHours(Number(event.target.value))} />
            <p>This model assumes a full reset. Connected changes to the declaration belong to the shipment manifest.</p>
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
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>24-Hour Duty Status Graph (Scenario Model)</span>
                <span className={`badge ${audit.isCompliant ? 'badge-emerald' : 'badge-rose'}`} style={{ color: audit.isCompliant ? '#34d399' : '#f87171' }}>
                  {inputError ? 'Correct invalid scenario inputs' : audit.isCompliant ? 'Feasible Under Modeled Rules' : `${audit.violations.length} Violation(s) Detected`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setIsSplitSleeperModalOpen(true)}
                  style={{
                    background: '#334155',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Split Sleeper &amp; 8-Day Recap 🛏️
                </button>
                <button
                  type="button"
                  onClick={() => setIsExemptionsModalOpen(true)}
                  style={{
                    background: '#334155',
                    color: '#34d399',
                    border: '1px solid rgba(52, 211, 153, 0.4)',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Statutory Exemptions 🌾
                </button>
                <button
                  type="button"
                  disabled={Boolean(inputError)}
                  onClick={() => setIsAuditModalOpen(true)}
                  style={{
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  View / Print Duty Planning Report
                </button>
              </div>
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

            {driverMode === 'team' && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTeamDriver('A')}
                  style={{
                    background: activeTeamDriver === 'A' ? '#0284c7' : '#1e293b',
                    color: '#fff',
                    border: '1px solid #38bdf8',
                    borderRadius: '4px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Driver A (Primary Operator)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTeamDriver('B')}
                  style={{
                    background: activeTeamDriver === 'B' ? '#0284c7' : '#1e293b',
                    color: '#fff',
                    border: '1px solid #38bdf8',
                    borderRadius: '4px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Driver B (Co-Driver / Relief)
                </button>
              </div>
            )}

            <LogbookGrid
              driverName={
                driverMode === 'team'
                  ? `Team Driver ${activeTeamDriver} (${activeTeamDriver === 'A' ? 'Primary' : 'Relief'})`
                  : (session?.shipment?.input.driverId ?? 'Scenario solo driver')
              }
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
                    case 'ORIGIN_PICKUP': return <IconPackage size={14} />;
                    case 'DRIVING_LEG': return <IconHighway size={14} />;
                    case 'MANDATORY_30M_BREAK': return <IconCoffee size={14} />;
                    case 'SLEEPER_10H_REST': return <IconBed size={14} />;
                    case 'FUEL_INSPECTION': return <IconFuel size={14} />;
                    case 'DESTINATION_DROPOFF': return <IconFlag size={14} />;
                    default: return <IconMapPin size={14} />;
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

      <EldAuditModal
        plan={itinerary}
        audit={audit}
        driverMode={driverMode}
        context={session?.shipment ? { shipmentReference: session.shipment.reference, driverId: session.shipment.input.driverId, carrierDot: session.shipment.input.carrierDot, equipmentId: session.shipment.input.equipmentId } : undefined}
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
      />

      <SplitSleeperModal
        isOpen={isSplitSleeperModalOpen}
        onClose={() => setIsSplitSleeperModalOpen(false)}
        driverMode={driverMode}
      />

      <HosExemptionsModal
        isOpen={isExemptionsModalOpen}
        onClose={() => setIsExemptionsModalOpen(false)}
      />
    </main>
  );
};
