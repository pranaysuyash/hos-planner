import React from 'react';
import type { DutyInterval, DutyStatus } from '../engine/types';
import { IconPrinter } from './icons';

interface LogbookGridProps {
  dateLabel?: string;
  driverName?: string;
  intervals: DutyInterval[];
}

const ROWS: { id: DutyStatus; label: string; short: string; color: string; y: number }[] = [
  { id: 'OFF_DUTY', label: '1. OFF DUTY', short: 'OFF', color: '#94a3b8', y: 40 },
  { id: 'SLEEPER_BERTH', label: '2. SLEEPER BERTH', short: 'SB', color: '#c084fc', y: 90 },
  { id: 'DRIVING', label: '3. DRIVING', short: 'D', color: '#38bdf8', y: 140 },
  { id: 'ON_DUTY_NOT_DRIVING', label: '4. ON DUTY (NOT DRIVING)', short: 'ON', color: '#fbbf24', y: 190 },
];

export const LogbookGrid: React.FC<LogbookGridProps> = ({
  dateLabel = 'Scenario day, date not supplied',
  driverName = 'Scenario driver, identity not supplied',
  intervals,
}) => {
  const width = 880;
  const height = 240;
  const leftMargin = 150;
  const rightMargin = 80;
  const gridWidth = width - leftMargin - rightMargin; // 650px
  const gridHeight = 160;

  // Calculate totals per row
  const totals: Record<DutyStatus, number> = {
    OFF_DUTY: 0,
    SLEEPER_BERTH: 0,
    DRIVING: 0,
    ON_DUTY_NOT_DRIVING: 0,
  };

  intervals.forEach(it => {
    totals[it.status] = (totals[it.status] || 0) + it.durationMinutes;
  });

  const minToX = (min: number) => leftMargin + (Math.min(1440, Math.max(0, min)) / 1440) * gridWidth;
  const statusToY = (status: DutyStatus) => {
    const row = ROWS.find(r => r.id === status);
    return row ? row.y : 40;
  };

  let pathD = '';
  let prevX = leftMargin;
  let prevY = 40;

  if (intervals.length > 0) {
    prevX = minToX(intervals[0].startMinutes);
    prevY = statusToY(intervals[0].status);
    pathD = `M ${prevX.toFixed(1)} ${prevY}`;

    intervals.forEach((it, index) => {
      const xStart = minToX(it.startMinutes);
      const xEnd = minToX(it.startMinutes + it.durationMinutes);
      const y = statusToY(it.status);

      const previous = intervals[index - 1];
      if (previous && Math.abs(it.startMinutes - (previous.startMinutes + previous.durationMinutes)) > 1e-7) {
        pathD += ` M ${xStart.toFixed(1)} ${y}`;
      } else if (y !== prevY) {
        pathD += ` L ${xStart.toFixed(1)} ${y}`;
      }

      pathD += ` L ${xEnd.toFixed(1)} ${y}`;
      prevX = xEnd;
      prevY = y;
    });
  }

  return (
    <div className="logbook-panel">
      {/* Logbook Header */}
      <div className="logbook-head">
        <div className="logbook-head-left">
          <span className="logbook-stamp">
            MODELED DUTY TIMELINE (SCENARIO ONLY)
          </span>
          <span className="logbook-meta">
            Scenario driver: <strong style={{ color: '#ffffff' }}>{driverName}</strong>
          </span>
        </div>
        <div className="logbook-head-right">
          <span>Scenario period: <strong style={{ color: '#ffffff', fontFamily: 'monospace' }}>{dateLabel}</strong></span>
          <button
            onClick={() => window.print()}
            className="btn-print-dot no-print"
            style={{
              background: '#1e293b',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              padding: '4px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Print scenario timeline and summary"
          >
            <IconPrinter size={13} /> Print scenario timeline
          </button>
          <span style={{ color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="live-pulse" style={{ background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
            Simulated Log Grid
          </span>
        </div>
      </div>

      {/* SVG 24-Hour Stepped Grid */}
      <div className="logbook-svg-container">
        <svg viewBox={`0 0 ${width} ${height}`} className="logbook-svg">
          <defs>
            <linearGradient id="gridGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.02" />
            </linearGradient>
            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background grid canvas */}
          <rect x={leftMargin} y={20} width={gridWidth} height={gridHeight} fill="url(#gridGlow)" rx="6" />

          {/* Hour Grid Lines & Labels */}
          {Array.from({ length: 25 }).map((_, i) => {
            const x = leftMargin + (i / 24) * gridWidth;
            const isNoon = i === 12;
            const isMidnight = i === 0 || i === 24;
            return (
              <g key={`hour-${i}`}>
                {/* Vertical Hour Line */}
                <line
                  x1={x}
                  y1={20}
                  x2={x}
                  y2={20 + gridHeight}
                  stroke={isMidnight ? '#64748b' : isNoon ? '#475569' : '#1e293b'}
                  strokeWidth={isMidnight || isNoon ? 1.5 : 0.75}
                  strokeDasharray={isMidnight || isNoon ? undefined : '2,2'}
                />

                {/* Quarter hour tick marks at top */}
                {i < 24 && (
                  <>
                    <line x1={x + gridWidth / 96} y1={20} x2={x + gridWidth / 96} y2={25} stroke="#334155" strokeWidth="0.5" />
                    <line x1={x + (gridWidth * 2) / 96} y1={20} x2={x + (gridWidth * 2) / 96} y2={28} stroke="#475569" strokeWidth="0.75" />
                    <line x1={x + (gridWidth * 3) / 96} y1={20} x2={x + (gridWidth * 3) / 96} y2={25} stroke="#334155" strokeWidth="0.5" />
                  </>
                )}

                {/* Hour Label */}
                <text
                  x={x}
                  y={14}
                  fill={isNoon ? '#38bdf8' : isMidnight ? '#cbd5e1' : '#94a3b8'}
                  fontSize="9.5"
                  textAnchor="middle"
                  fontFamily="monospace"
                  fontWeight={isNoon || isMidnight ? 'bold' : 'normal'}
                >
                  {i === 0 ? 'MID' : i === 12 ? 'NOON' : i === 24 ? 'MID' : i > 12 ? `${i - 12}p` : `${i}a`}
                </text>
              </g>
            );
          })}

          {/* Status Row Dividers & Labels */}
          {ROWS.map(row => (
            <g key={row.id}>
              {/* Row Guide Line */}
              <line
                x1={leftMargin}
                y1={row.y}
                x2={leftMargin + gridWidth}
                y2={row.y}
                stroke="#1e293b"
                strokeWidth="1"
              />

              {/* Row Label (Left) */}
              <text
                x={leftMargin - 14}
                y={row.y + 4}
                fill={row.color}
                fontSize="10.5"
                textAnchor="end"
                fontWeight="700"
                fontFamily="sans-serif"
                letterSpacing="0.04em"
              >
                {row.label}
              </text>

              {/* Row Total (Right) */}
              <text
                x={leftMargin + gridWidth + 20}
                y={row.y + 4}
                fill="#f8fafc"
                fontSize="12"
                textAnchor="start"
                fontWeight="800"
                fontFamily="monospace"
              >
                {((totals[row.id] || 0) / 60).toFixed(1)}h
              </text>
            </g>
          ))}

          {/* Stepped Duty Polyline with Neon Filter */}
          {pathD && (
            <>
              {/* Cyan shadow stroke */}
              <path
                d={pathD}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="5"
                strokeOpacity="0.35"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Vibrant core stroke */}
              <path
                d={pathD}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Total Sum Column Header */}
          <text
            x={leftMargin + gridWidth + 20}
            y={14}
            fill="#94a3b8"
            fontSize="9"
            fontWeight="bold"
            fontFamily="monospace"
            textAnchor="start"
          >
            TOTAL
          </text>
        </svg>
      </div>

      {/* Interval Breakdown Grid */}
      <div className="logbook-breakdown no-print">
        <div className="logbook-breakdown-title">
          DUTY STATUS CHANGE LOG &amp; SIMULATED WAYPOINT RECORDS (INDICATIVE)
        </div>
        <div className="logbook-cards-grid">
          {intervals.map((it, idx) => {
            const startHour = Math.floor(it.startMinutes / 60);
            const startMin = it.startMinutes % 60;
            const endHour = Math.floor((it.startMinutes + it.durationMinutes) / 60);
            const endMin = (it.startMinutes + it.durationMinutes) % 60;
            const row = ROWS.find(r => r.id === it.status);

            return (
              <div key={idx} className="interval-card">
                <div className="interval-card-h">
                  <span
                    className="interval-badge"
                    style={{ backgroundColor: `${row?.color}25`, color: row?.color }}
                  >
                    {row?.short} · {it.status.replace(/_/g, ' ')}
                  </span>
                  <span className="interval-time mono">
                    {String(startHour).padStart(2, '0')}:{String(startMin).padStart(2, '0')} - {String(endHour).padStart(2, '0')}:{String(endMin).padStart(2, '0')}
                  </span>
                </div>
                <div className="interval-loc">{it.location || 'Interstate Transit'}</div>
                <div className="interval-rem">{it.remark} ({((it.durationMinutes) / 60).toFixed(1)} hrs)</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scenario summary for print, alongside the modeled timeline. */}
      <div className="dot-inspection-sheet">
        <div className="dot-sheet-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="dot-sheet-title">SCENARIO DUTY TIMELINE SUMMARY</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#333' }}>
                Synthetic planning output. Not a driver log, official record or certification.
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px' }}>
              <div>SCENARIO PERIOD: <strong>{dateLabel}</strong></div>
            </div>
          </div>

          <div className="dot-meta-grid">
            <div>
              <div>CARRIER: <strong>Not supplied</strong></div>
              <div>OFFICE AND TERMINAL: <strong>Not supplied</strong></div>
            </div>
            <div>
              <div>SCENARIO DRIVER: <strong>{driverName}</strong></div>
              <div>DRIVER AND CO-DRIVER RECORDS: <strong>Not supplied</strong></div>
            </div>
            <div>
              <div>TRACTOR, TRAILER AND MILEAGE: <strong>Not supplied</strong></div>
            </div>
          </div>
        </div>

        {/* 24-hr Grid Summary Box */}
        <div className="dot-grid-box">
          <div style={{ fontWeight: 800, fontSize: '12px', marginBottom: '8px' }}>
            MODELED INTERVAL TOTALS (24-HOUR DISPLAY)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '11px', borderBottom: '1px solid #ccc', paddingBottom: '8px' }}>
            <div>OFF DUTY: <strong>{((totals.OFF_DUTY || 0) / 60).toFixed(1)} hrs</strong></div>
            <div>SLEEPER BERTH: <strong>{((totals.SLEEPER_BERTH || 0) / 60).toFixed(1)} hrs</strong></div>
            <div>DRIVING: <strong>{((totals.DRIVING || 0) / 60).toFixed(1)} hrs</strong></div>
            <div>ON DUTY (NOT DRIVING): <strong>{((totals.ON_DUTY_NOT_DRIVING || 0) / 60).toFixed(1)} hrs</strong></div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', fontWeight: 700 }}>
            TOTAL MODELED: <strong>{(((totals.OFF_DUTY || 0) + (totals.SLEEPER_BERTH || 0) + (totals.DRIVING || 0) + (totals.ON_DUTY_NOT_DRIVING || 0)) / 60).toFixed(1)} HOURS</strong>. Unmodeled time is unknown, not assumed off duty.
          </div>
        </div>

        {/* A historical recap needs actual prior driver records. */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontWeight: 800, fontSize: '12px', marginBottom: '4px' }}>
            7/8-DAY CYCLE HISTORY
          </div>
          <p>Prior driver history unavailable. Remaining cycle hours cannot be determined from this scenario.</p>
        </div>

        {/* No certification can be inferred from generated intervals. */}
        <div className="dot-signature-block">
          <div>No driver signature, certification or actual duty record is provided.</div>
        </div>
      </div>
    </div>
  );
};
