import React, { useState, useMemo } from 'react';
import {
  calculateHosRecap,
  DEFAULT_8DAY_HISTORY,
  DailyLogRecapDay,
  HosRecapSummary,
} from '../engine/hosRecap';

interface HosRecapModalProps {
  isOpen: boolean;
  onClose: () => void;
  plannedTripHours?: number;
}

export const HosRecapModal: React.FC<HosRecapModalProps> = ({
  isOpen,
  onClose,
  plannedTripHours = 14,
}) => {
  const [cycleType, setCycleType] = useState<'70h_8d' | '60h_7d'>('70h_8d');
  const [logs, setLogs] = useState<DailyLogRecapDay[]>(DEFAULT_8DAY_HISTORY);

  const recap: HosRecapSummary = useMemo(() => {
    return calculateHosRecap(logs, cycleType, plannedTripHours);
  }, [logs, cycleType, plannedTripHours]);

  const updateDayHours = (index: number, driving: number, onDutyNotDriving: number) => {
    setLogs((prev) =>
      prev.map((d) =>
        d.dayIndex === index
          ? {
              ...d,
              drivingHours: driving,
              onDutyNotDrivingHours: onDutyNotDriving,
              totalOnDutyHours: Number((driving + onDutyNotDriving).toFixed(1)),
            }
          : d
      )
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="camera-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recap-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="camera-modal-content"
        style={{
          maxWidth: 720,
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #334155',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div
          style={{
            background: '#1e293b',
            borderBottom: '1px solid #334155',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 id="recap-modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc' }}>
              ⏱️ 8-Day Rolling Cycle Hours Recap &amp; Corridor Parking
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
              FMCSA 49 CFR § 395.3(b) 70-hr/8-day rolling duty clock &amp; truck rest stop availability.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '4px 8px',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px', maxHeight: '72vh', overflowY: 'auto' }}>
          {/* Cycle Stats HUD */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>8-Day On-Duty Total</div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: recap.cycleViolation ? '#ef4444' : recap.totalOnDutyLast8Days > 60 ? '#f59e0b' : '#38bdf8',
                }}
              >
                {recap.totalOnDutyLast8Days}h / {recap.cycleLimitHours}h
              </div>
            </div>

            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Available Hours Today</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: recap.cycleHoursRemaining > 4 ? '#22c55e' : '#f59e0b' }}>
                {recap.cycleHoursRemaining}h
              </div>
            </div>

            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Hours Regained Tonight</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8' }}>
                +{recap.hoursRegainedTonightMidnight}h
              </div>
              <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Day 1 drop-off @ 00:00</div>
            </div>

            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Available Tomorrow</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#22c55e' }}>
                {recap.projectedAvailableTomorrow}h
              </div>
              <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Max 14h shift limit</div>
            </div>
          </div>

          {/* Alert / Warning */}
          {recap.restart34hRecommended && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
              <div>
                <strong style={{ color: '#fca5a5', fontSize: '0.85rem' }}>
                  Statutory 34-Hour Restart Advisory Recommended
                </strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#fecaca' }}>
                  {recap.restartReason}
                </p>
              </div>
            </div>
          )}

          {/* Cycle Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>
              Rolling Window Logs (Days 1–8):
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setCycleType('70h_8d')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: cycleType === '70h_8d' ? '#0284c7' : '#334155',
                  color: '#ffffff',
                }}
              >
                70-Hour / 8-Day Rule
              </button>
              <button
                type="button"
                onClick={() => setCycleType('60h_7d')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: cycleType === '60h_7d' ? '#0284c7' : '#334155',
                  color: '#ffffff',
                }}
              >
                60-Hour / 7-Day Rule
              </button>
            </div>
          </div>

          {/* Daily Table */}
          <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden', border: '1px solid #334155', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Day</th>
                  <th style={{ padding: '8px 12px' }}>Driving</th>
                  <th style={{ padding: '8px 12px' }}>On-Duty (Other)</th>
                  <th style={{ padding: '8px 12px' }}>Total On-Duty</th>
                  <th style={{ padding: '8px 12px' }}>Duty Load</th>
                </tr>
              </thead>
              <tbody>
                {recap.dailyLogs.map((d) => (
                  <tr
                    key={d.dayIndex}
                    style={{
                      borderBottom: '1px solid #334155',
                      background: d.dayIndex === 1 ? 'rgba(56, 189, 248, 0.05)' : d.dayIndex === 8 ? 'rgba(34, 197, 94, 0.05)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                      {d.dateStr}
                      {d.dayIndex === 1 && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: '#38bdf8' }}>(Drops Tonight)</span>}
                      {d.dayIndex === 8 && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: '#22c55e' }}>(Current)</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <input
                        type="number"
                        min={0}
                        max={11}
                        step={0.5}
                        value={d.drivingHours}
                        onChange={(e) => updateDayHours(d.dayIndex, Number(e.target.value), d.onDutyNotDrivingHours)}
                        style={{ width: 48, background: '#0f172a', color: '#f8fafc', border: '1px solid #475569', borderRadius: 4, padding: '2px 4px', fontSize: '0.75rem' }}
                      />
                      {' '}h
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <input
                        type="number"
                        min={0}
                        max={8}
                        step={0.5}
                        value={d.onDutyNotDrivingHours}
                        onChange={(e) => updateDayHours(d.dayIndex, d.drivingHours, Number(e.target.value))}
                        style={{ width: 48, background: '#0f172a', color: '#f8fafc', border: '1px solid #475569', borderRadius: 4, padding: '2px 4px', fontSize: '0.75rem' }}
                      />
                      {' '}h
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: d.totalOnDutyHours > 12 ? '#f59e0b' : '#f8fafc' }}>
                      {d.totalOnDutyHours}h
                    </td>
                    <td style={{ padding: '8px 12px', width: '25%' }}>
                      <div style={{ height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, (d.totalOnDutyHours / 14) * 100)}%`,
                            background: d.totalOnDutyHours > 12 ? '#f59e0b' : '#38bdf8',
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Corridor Truck Parking Availability */}
          <h4 style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🅿️ Interstate Corridor Truck Parking &amp; Shore-Power Availability</span>
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {recap.nearbyRestStops.map((stop) => (
              <div
                key={stop.id}
                style={{
                  background: '#1e293b',
                  borderRadius: 6,
                  padding: '10px 12px',
                  border: '1px solid #334155',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <strong style={{ fontSize: '0.8rem', color: '#f8fafc' }}>{stop.name}</strong>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background:
                        stop.occupancyStatus === 'AMPLE'
                          ? 'rgba(34, 197, 94, 0.2)'
                          : stop.occupancyStatus === 'LIMITED'
                          ? 'rgba(245, 158, 11, 0.2)'
                          : 'rgba(239, 68, 68, 0.2)',
                      color:
                        stop.occupancyStatus === 'AMPLE'
                          ? '#4ade80'
                          : stop.occupancyStatus === 'LIMITED'
                          ? '#fcd34d'
                          : '#fca5a5',
                    }}
                  >
                    {stop.availableTruckSpots} / {stop.totalTruckSpots} SPOTS
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: 6 }}>{stop.corridor}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {stop.amenities.map((am, i) => (
                    <span key={i} style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 3, fontSize: '0.65rem', color: '#cbd5e1' }}>
                      {am}
                    </span>
                  ))}
                  {stop.hasShorePower && (
                    <span style={{ background: '#0369a1', padding: '2px 6px', borderRadius: 3, fontSize: '0.65rem', color: '#ffffff', fontWeight: 600 }}>
                      ⚡ Shore Power
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: '#1e293b',
            borderTop: '1px solid #334155',
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              border: 'none',
              background: '#0284c7',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
