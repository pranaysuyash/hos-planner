import React, { useState, useMemo } from 'react';
import {
  evaluateSplitSleeper,
  calculateRolling70HourRecap,
} from '../engine/splitSleeper';

interface SplitSleeperModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverMode?: 'solo' | 'team';
}

const DEFAULT_8DAY_LOGS = [
  { dayIndex: 1, dateStr: 'Mon Oct 19', drivingHours: 9.0, onDutyNotDrivingHours: 1.5, offDutyHours: 13.5 },
  { dayIndex: 2, dateStr: 'Tue Oct 20', drivingHours: 8.5, onDutyNotDrivingHours: 1.5, offDutyHours: 14.0 },
  { dayIndex: 3, dateStr: 'Wed Oct 21', drivingHours: 9.0, onDutyNotDrivingHours: 1.0, offDutyHours: 14.0 },
  { dayIndex: 4, dateStr: 'Thu Oct 22', drivingHours: 8.0, onDutyNotDrivingHours: 1.0, offDutyHours: 15.0 },
  { dayIndex: 5, dateStr: 'Fri Oct 23', drivingHours: 8.0, onDutyNotDrivingHours: 1.5, offDutyHours: 14.5 },
  { dayIndex: 6, dateStr: 'Sat Oct 24', drivingHours: 7.0, onDutyNotDrivingHours: 1.0, offDutyHours: 16.0 },
  { dayIndex: 7, dateStr: 'Sun Oct 25', drivingHours: 6.5, onDutyNotDrivingHours: 1.0, offDutyHours: 16.5 },
  { dayIndex: 8, dateStr: 'Mon Oct 26', drivingHours: 5.5, onDutyNotDrivingHours: 0.5, offDutyHours: 18.0 },
];

export const SplitSleeperModal: React.FC<SplitSleeperModalProps> = ({
  isOpen,
  onClose,
  driverMode = 'solo',
}) => {
  const [period1Hours, setPeriod1Hours] = useState<number>(8.0);
  const [period1IsSleeper, setPeriod1IsSleeper] = useState<boolean>(true);
  const [period2Hours, setPeriod2Hours] = useState<number>(2.0);
  const [period2IsSleeper, setPeriod2IsSleeper] = useState<boolean>(false);
  const [dailyLogs, setDailyLogs] = useState(DEFAULT_8DAY_LOGS);

  const splitEvaluation = useMemo(() => {
    return evaluateSplitSleeper(
      { durationHours: period1Hours, isSleeperBerth: period1IsSleeper },
      { durationHours: period2Hours, isSleeperBerth: period2IsSleeper }
    );
  }, [period1Hours, period1IsSleeper, period2Hours, period2IsSleeper]);

  const rollingRecap = useMemo(() => {
    return calculateRolling70HourRecap(dailyLogs);
  }, [dailyLogs]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="split-sleeper-title"
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
    >
      <div
        className="modal-container"
        style={{
          background: '#ffffff',
          borderRadius: 12,
          maxWidth: 940,
          width: '100%',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #cbd5e1',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 id="split-sleeper-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                FMCSA Split Sleeper Berth (8/2 &amp; 7/3) &amp; 8-Day Rolling Recap
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 9999,
                  background: splitEvaluation.isQualifyingSplit ? '#dcfce7' : '#fee2e2',
                  color: splitEvaluation.isQualifyingSplit ? '#15803d' : '#b91c1c',
                  border: `1px solid ${splitEvaluation.isQualifyingSplit ? '#86efac' : '#fca5a5'}`,
                }}
              >
                {splitEvaluation.isQualifyingSplit ? `✓ LEGAL ${splitEvaluation.splitPattern.toUpperCase()} SPLIT` : '⚠ INVALID SPLIT'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              49 CFR § 395.1(g) clock-pausing provisions &amp; § 395.3(b) rolling 70-hour/8-day duty cycle for {driverMode} drivers.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              color: '#64748b',
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section 1: Split Sleeper Berth Calculator */}
          <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                1. Split Sleeper Rest Period Evaluation (2020 Final Rule)
              </h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setPeriod1Hours(8.0);
                    setPeriod1IsSleeper(true);
                    setPeriod2Hours(2.0);
                    setPeriod2IsSleeper(false);
                  }}
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: '1px solid #0284c7',
                    background: '#e0f2fe',
                    color: '#0369a1',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Preset: 8/2 Split
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPeriod1Hours(7.0);
                    setPeriod1IsSleeper(true);
                    setPeriod2Hours(3.0);
                    setPeriod2IsSleeper(false);
                  }}
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: '1px solid #0284c7',
                    background: '#e0f2fe',
                    color: '#0369a1',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Preset: 7/3 Split
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {/* Period 1 */}
              <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Rest Period A (Longer Segment, ≥ 7h):
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    min={4}
                    max={14}
                    step={0.5}
                    value={period1Hours}
                    onChange={(e) => setPeriod1Hours(Number(e.target.value))}
                    style={{ width: 80, padding: '6px 10px', fontSize: 14, fontWeight: 700, borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                  <span style={{ fontSize: 13, color: '#475569' }}>Hours</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}>
                    <input
                      type="checkbox"
                      checked={period1IsSleeper}
                      onChange={(e) => setPeriod1IsSleeper(e.target.checked)}
                      style={{ accentColor: '#0284c7' }}
                    />
                    Sleeper Berth (Mandatory)
                  </label>
                </div>
              </div>

              {/* Period 2 */}
              <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Rest Period B (Shorter Segment, ≥ 2h):
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    value={period2Hours}
                    onChange={(e) => setPeriod2Hours(Number(e.target.value))}
                    style={{ width: 80, padding: '6px 10px', fontSize: 14, fontWeight: 700, borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                  <span style={{ fontSize: 13, color: '#475569' }}>Hours</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}>
                    <input
                      type="checkbox"
                      checked={period2IsSleeper}
                      onChange={(e) => setPeriod2IsSleeper(e.target.checked)}
                      style={{ accentColor: '#0284c7' }}
                    />
                    Sleeper (Optional)
                  </label>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 6,
                background: splitEvaluation.isQualifyingSplit ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${splitEvaluation.isQualifyingSplit ? '#86efac' : '#fca5a5'}`,
                fontSize: 12,
                color: splitEvaluation.isQualifyingSplit ? '#166534' : '#991b1b',
                fontWeight: 600,
              }}
            >
              {splitEvaluation.explanation}
            </div>
          </div>

          {/* Section 2: 8-Day Rolling 70-Hour Recap */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                  2. 8-Day Rolling 70-Hour Duty Cycle Recap (§ 395.3(b))
                </h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Tracks daily on-duty hours, available drive clock, and hours regained at midnight.
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setDailyLogs([
                    { dayIndex: 1, dateStr: 'Mon Oct 19', drivingHours: 10.0, onDutyNotDrivingHours: 1.5, offDutyHours: 12.5 },
                    { dayIndex: 2, dateStr: 'Tue Oct 20', drivingHours: 9.5, onDutyNotDrivingHours: 1.5, offDutyHours: 13.0 },
                    { dayIndex: 3, dateStr: 'Wed Oct 21', drivingHours: 10.0, onDutyNotDrivingHours: 1.0, offDutyHours: 13.0 },
                    { dayIndex: 4, dateStr: 'Thu Oct 22', drivingHours: 9.0, onDutyNotDrivingHours: 1.0, offDutyHours: 14.0 },
                    { dayIndex: 5, dateStr: 'Fri Oct 23', drivingHours: 9.0, onDutyNotDrivingHours: 1.5, offDutyHours: 13.5 },
                    { dayIndex: 6, dateStr: 'Sat Oct 24', drivingHours: 8.0, onDutyNotDrivingHours: 1.0, offDutyHours: 15.0 },
                    { dayIndex: 7, dateStr: 'Sun Oct 25', drivingHours: 8.0, onDutyNotDrivingHours: 1.0, offDutyHours: 15.0 },
                    { dayIndex: 8, dateStr: 'Mon Oct 26', drivingHours: 7.0, onDutyNotDrivingHours: 0.5, offDutyHours: 16.5 },
                  ])}
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: '1px solid #f59e0b',
                    background: '#fef3c7',
                    color: '#b45309',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  ⚡ Heavy Week (66h)
                </button>
                <button
                  type="button"
                  onClick={() => setDailyLogs(DEFAULT_8DAY_LOGS)}
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Standard (52h)
                </button>
                <span style={{ fontSize: 12, color: '#475569' }}>
                  Cycle Hours Used: <b>{rollingRecap.totalCycleHoursUsed} / 70.0h</b>
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: rollingRecap.currentAvailableHours > 5 ? '#dcfce7' : '#fef3c7',
                    color: rollingRecap.currentAvailableHours > 5 ? '#15803d' : '#b45309',
                  }}
                >
                  {rollingRecap.currentAvailableHours}h Available Today
                </span>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 10px' }}>Day</th>
                  <th style={{ padding: '8px 10px' }}>Driving</th>
                  <th style={{ padding: '8px 10px' }}>On-Duty (Other)</th>
                  <th style={{ padding: '8px 10px' }}>Total On-Duty</th>
                  <th style={{ padding: '8px 10px' }}>Off-Duty Rest</th>
                  <th style={{ padding: '8px 10px' }}>Past 7 Days</th>
                  <th style={{ padding: '8px 10px' }}>Avail. Today</th>
                  <th style={{ padding: '8px 10px' }}>Regained at Midnight</th>
                </tr>
              </thead>
              <tbody>
                {rollingRecap.days.map((d, idx) => {
                  const isCurrentDay = idx === rollingRecap.days.length - 1;
                  return (
                    <tr
                      key={d.dayIndex}
                      style={{
                        background: isCurrentDay ? '#eff6ff' : idx % 2 === 0 ? '#fafafa' : '#ffffff',
                        borderBottom: '1px solid #e2e8f0',
                        fontWeight: isCurrentDay ? 700 : 400,
                      }}
                    >
                      <td style={{ padding: '8px 10px' }}>
                        {d.dateStr} {isCurrentDay && '◀ TODAY'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>{d.drivingHours}h</td>
                      <td style={{ padding: '8px 10px' }}>{d.onDutyNotDrivingHours}h</td>
                      <td style={{ padding: '8px 10px', color: '#0f172a', fontWeight: 600 }}>{d.totalOnDutyHours}h</td>
                      <td style={{ padding: '8px 10px' }}>
                        {d.offDutyHours}h {d.has34HourRestart && '⚡ 34h RESTART'}
                      </td>
                      <td style={{ padding: '8px 10px', color: d.isViolation ? '#dc2626' : '#1e293b', fontWeight: d.isViolation ? 800 : 500 }}>
                        {d.hoursWorkedPast7Days}h {d.isViolation && '⚠ VIOLATION'}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#0284c7', fontWeight: 700 }}>
                        {d.hoursAvailableToday}h
                      </td>
                      <td style={{ padding: '8px 10px', color: '#16a34a', fontWeight: 600 }}>
                        +{d.hoursRegainedAtMidnight}h
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Tomorrow's Projected Availability: <b>{rollingRecap.projectedHoursTomorrow}h</b> after midnight roll-off
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
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
