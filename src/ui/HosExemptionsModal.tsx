import React, { useState, useMemo } from 'react';
import {
  evaluateAgriculturalExemption,
  evaluateAdverseDriving,
  evaluateShortHaul16Hour,
  categorizeSpecialDutyStatus,
} from '../engine/hosExemptions';

interface HosExemptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HosExemptionsModal: React.FC<HosExemptionsModalProps> = ({
  isOpen,
  onClose,
}) => {
  // Agricultural Exemption State
  const [agCommodity, setAgCommodity] = useState<'LIVESTOCK' | 'PERISHABLE_PRODUCE' | 'NON_AGRICULTURAL'>('LIVESTOCK');
  const [isHarvestSeason, setIsHarvestSeason] = useState(true);
  const [distanceFromSourceAirMiles, setDistanceFromSourceAirMiles] = useState(85);

  // Adverse Driving State
  const [adverseDeclared, setAdverseDeclared] = useState(false);
  const [adverseReason, setAdverseReason] = useState<'UNFORESEEN_WEATHER_BLIZZARD' | 'UNFORESEEN_ROAD_CLOSURE' | 'TRAFFIC_ACCIDENT_DETOUR' | 'NORMAL_CONGESTION_INVALID'>('UNFORESEEN_WEATHER_BLIZZARD');

  // Short-Haul 16-Hour State
  const [usedShortHaulPast7Days, setUsedShortHaulPast7Days] = useState(false);
  const [returnedHomeTerminal, setReturnedHomeTerminal] = useState(true);

  // Special Duty Mode
  const [specialMode, setSpecialMode] = useState<'NORMAL' | 'PERSONAL_CONVEYANCE' | 'YARD_MOVE'>('NORMAL');

  const agResult = useMemo(() => {
    // Synthetic coordinate offset matching air miles
    const latOffset = (distanceFromSourceAirMiles / 60);
    return evaluateAgriculturalExemption({
      originLat: 41.8781,
      originLng: -87.6298,
      currentLat: 41.8781 + latOffset,
      currentLng: -87.6298,
      isHarvestSeason,
      commodityType: agCommodity,
    });
  }, [agCommodity, isHarvestSeason, distanceFromSourceAirMiles]);

  const adverseResult = useMemo(() => {
    return evaluateAdverseDriving({
      isAdverseDeclared: adverseDeclared,
      reason: adverseReason,
      unforeseenTimestamp: new Date().toISOString(),
    });
  }, [adverseDeclared, adverseReason]);

  const shortHaulResult = useMemo(() => {
    return evaluateShortHaul16Hour({
      hasUsedInPast7Days: usedShortHaulPast7Days,
      returnedToHomeTerminal: returnedHomeTerminal,
      releasedWithin16Hours: true,
      consecutiveOffDutyPriorHours: 10.0,
    });
  }, [usedShortHaulPast7Days, returnedHomeTerminal]);

  const specialDutyResult = useMemo(() => {
    return categorizeSpecialDutyStatus(specialMode, 'DRIVING');
  }, [specialMode]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exemptions-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-container"
        style={{
          background: '#ffffff',
          color: '#0f172a',
          borderRadius: 12,
          maxWidth: 680,
          width: '100%',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 id="exemptions-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              FMCSA Part 395 Statutory HOS Exemptions &amp; Duty Modes
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
              Statutory 49 CFR relief: Agricultural 150-air-mile, Adverse Weather 2-hr, 16-hr Short-Haul &amp; PC/YM
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#64748b',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 1: Agricultural 150 Air-Mile Exemption */}
          <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                🌾 49 CFR § 395.1(k) Agricultural 150 Air-Mile Exemption
              </div>
              <span
                style={{
                  background: agResult.isExempt ? '#22c55e' : '#64748b',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 4,
                }}
              >
                {agResult.isExempt ? 'EXEMPT · CLOCKS PAUSED' : 'NON-EXEMPT'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Commodity</label>
                <select
                  value={agCommodity}
                  onChange={(e) => setAgCommodity(e.target.value as any)}
                  style={{ width: '100%', padding: '6px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                >
                  <option value="LIVESTOCK">Livestock / Cattle</option>
                  <option value="PERISHABLE_PRODUCE">Perishable Produce</option>
                  <option value="NON_AGRICULTURAL">General Freight (Non-Ag)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Planting / Harvest Season</label>
                <select
                  value={isHarvestSeason ? 'yes' : 'no'}
                  onChange={(e) => setIsHarvestSeason(e.target.value === 'yes')}
                  style={{ width: '100%', padding: '6px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                >
                  <option value="yes">Active Declared Season</option>
                  <option value="no">Off-Season</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Distance from Source: {distanceFromSourceAirMiles} air-mi</label>
                <input
                  type="range"
                  min="10"
                  max="250"
                  value={distanceFromSourceAirMiles}
                  onChange={(e) => setDistanceFromSourceAirMiles(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 8 }}
                />
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 8, background: '#ffffff', padding: '6px 10px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              {agResult.auditNote}
            </div>
          </div>

          {/* Section 2: Adverse Driving Conditions */}
          <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                ❄️ 49 CFR § 395.1(b)(1) Adverse Driving Conditions (2-Hour Extension)
              </div>
              <span
                style={{
                  background: adverseResult.isGranted ? '#0284c7' : '#94a3b8',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 4,
                }}
              >
                {adverseResult.isGranted ? 'GRANTED: 13H DRIVE / 16H DUTY' : 'STANDARD: 11H / 14H'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={adverseDeclared}
                  onChange={(e) => setAdverseDeclared(e.target.checked)}
                />
                Declare Unexpected Adverse Conditions
              </label>
              {adverseDeclared && (
                <select
                  value={adverseReason}
                  onChange={(e) => setAdverseReason(e.target.value as any)}
                  style={{ flex: 1, padding: '6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12 }}
                >
                  <option value="UNFORESEEN_WEATHER_BLIZZARD">Unexpected Severe Blizzard / Black Ice</option>
                  <option value="UNFORESEEN_ROAD_CLOSURE">Emergency Interstate Closure / Detour</option>
                  <option value="TRAFFIC_ACCIDENT_DETOUR">Fatal Multi-Vehicle Crash Highway Shutdown</option>
                  <option value="NORMAL_CONGESTION_INVALID">Predictable Rush Hour (Ineligible)</option>
                </select>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 8, background: '#ffffff', padding: '6px 10px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              {adverseResult.legalJustification}
            </div>
          </div>

          {/* Section 3: Special Duty Modes (Personal Conveyance vs Yard Move) */}
          <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 8 }}>
              🛏️ Special Duty Logging Mode (Personal Conveyance vs. Yard Move)
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setSpecialMode('NORMAL')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 6,
                  border: `1px solid ${specialMode === 'NORMAL' ? '#0f172a' : '#cbd5e1'}`,
                  background: specialMode === 'NORMAL' ? '#0f172a' : '#ffffff',
                  color: specialMode === 'NORMAL' ? '#ffffff' : '#334155',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Standard Driving
              </button>
              <button
                type="button"
                onClick={() => setSpecialMode('PERSONAL_CONVEYANCE')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 6,
                  border: `1px solid ${specialMode === 'PERSONAL_CONVEYANCE' ? '#16a34a' : '#cbd5e1'}`,
                  background: specialMode === 'PERSONAL_CONVEYANCE' ? '#16a34a' : '#ffffff',
                  color: specialMode === 'PERSONAL_CONVEYANCE' ? '#ffffff' : '#334155',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Personal Conveyance (PC)
              </button>
              <button
                type="button"
                onClick={() => setSpecialMode('YARD_MOVE')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 6,
                  border: `1px solid ${specialMode === 'YARD_MOVE' ? '#d97706' : '#cbd5e1'}`,
                  background: specialMode === 'YARD_MOVE' ? '#d97706' : '#ffffff',
                  color: specialMode === 'YARD_MOVE' ? '#ffffff' : '#334155',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Yard Move (YM)
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 8, background: '#ffffff', padding: '6px 10px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              Status: <b>{specialDutyResult.status}</b> · Depletes 11h Drive: <b>{specialDutyResult.depletes11HourClock ? 'YES' : 'NO'}</b> · Depletes 14h Duty: <b>{specialDutyResult.depletes14HourClock ? 'YES' : 'NO'}</b>
              <br />
              {specialDutyResult.complianceRule}
            </div>
          </div>

          {/* Section 4: Short-Haul 16-Hour Big Day Exception */}
          <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                ⏱️ 49 CFR § 395.1(o) Short-Haul 16-Hour Exception (1x per 7 Days)
              </div>
              <span
                style={{
                  background: shortHaulResult.isEligible ? '#059669' : '#94a3b8',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 4,
                }}
              >
                {shortHaulResult.isEligible ? 'ELIGIBLE: 16H SHIFT' : 'STANDARD: 14H SHIFT'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={usedShortHaulPast7Days}
                  onChange={(e) => setUsedShortHaulPast7Days(e.target.checked)}
                />
                Already used in prior 6 consecutive days
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={returnedHomeTerminal}
                  onChange={(e) => setReturnedHomeTerminal(e.target.checked)}
                />
                Released at same home work terminal
              </label>
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 8, background: '#ffffff', padding: '6px 10px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              {shortHaulResult.auditStatement}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Apply &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};
