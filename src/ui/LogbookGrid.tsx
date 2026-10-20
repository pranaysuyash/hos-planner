import React from 'react';
import type { DutyInterval, DutyStatus } from '../engine/types';

interface LogbookGridProps {
  dateLabel?: string;
  driverName?: string;
  intervals: DutyInterval[];
}

const ROWS: { id: DutyStatus; label: string; short: string; color: string; y: number }[] = [
  { id: 'OFF_DUTY', label: '1. OFF DUTY', short: 'OFF', color: '#64748b', y: 40 },
  { id: 'SLEEPER_BERTH', label: '2. SLEEPER BERTH', short: 'SB', color: '#8b5cf6', y: 90 },
  { id: 'DRIVING', label: '3. DRIVING', short: 'D', color: '#3b82f6', y: 140 },
  { id: 'ON_DUTY_NOT_DRIVING', label: '4. ON DUTY (NOT DRIVING)', short: 'ON', color: '#f59e0b', y: 190 },
];

export const LogbookGrid: React.FC<LogbookGridProps> = ({
  dateLabel = new Date().toISOString().split('T')[0],
  driverName = 'J. Doe (Solo Dispatch)',
  intervals,
}) => {
  const width = 860;
  const height = 240;
  const leftMargin = 140;
  const rightMargin = 80;
  const gridWidth = width - leftMargin - rightMargin; // 640px
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

  // Generate SVG path for stepped line
  // 1440 minutes in 24 hours
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

    intervals.forEach(it => {
      const xStart = minToX(it.startMinutes);
      const xEnd = minToX(it.startMinutes + it.durationMinutes);
      const y = statusToY(it.status);

      // Step up/down to new status
      if (xStart !== prevX || y !== prevY) {
        pathD += ` L ${xStart.toFixed(1)} ${prevY}`; // horizontal to change point
        pathD += ` L ${xStart.toFixed(1)} ${y}`;     // vertical switch
      }

      // Horizontal segment across the duration
      pathD += ` L ${xEnd.toFixed(1)} ${y}`;
      prevX = xEnd;
      prevY = y;
    });
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl overflow-x-auto">
      {/* Logbook Header */}
      <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 text-xs text-slate-400 gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 font-semibold border border-blue-700/50">
            FMCSA § 395 24-HR RECORD OF DUTY STATUS
          </span>
          <span className="text-slate-300 font-medium">Driver: <strong className="text-white">{driverName}</strong></span>
        </div>
        <div className="flex items-center gap-4">
          <span>Date: <strong className="text-white font-mono">{dateLabel}</strong></span>
          <span className="text-emerald-400 font-medium">ELD Synchronized</span>
        </div>
      </div>

      {/* SVG 24-Hour Grid */}
      <div className="mt-4 min-w-[860px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none font-mono">
          <defs>
            <linearGradient id="gridGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#1e293b" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Background */}
          <rect x={leftMargin} y={20} width={gridWidth} height={gridHeight} fill="url(#gridGlow)" rx="4" />

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
                  stroke={isMidnight ? '#64748b' : isNoon ? '#475569' : '#334155'}
                  strokeWidth={isMidnight || isNoon ? 1.5 : 0.75}
                  strokeDasharray={isMidnight || isNoon ? undefined : '2,2'}
                />

                {/* Quarter hour tick marks at top */}
                {i < 24 && (
                  <>
                    <line x1={x + gridWidth / 96} y1={20} x2={x + gridWidth / 96} y2={25} stroke="#334155" strokeWidth="0.5" />
                    <line x1={x + (gridWidth * 2) / 96} y1={20} x2={x + (gridWidth * 2) / 96} y2={28} stroke="#475569" strokeWidth="0.7" />
                    <line x1={x + (gridWidth * 3) / 96} y1={20} x2={x + (gridWidth * 3) / 96} y2={25} stroke="#334155" strokeWidth="0.5" />
                  </>
                )}

                {/* Hour Label */}
                <text
                  x={x}
                  y={14}
                  fill={isNoon ? '#38bdf8' : '#94a3b8'}
                  fontSize="9"
                  textAnchor="middle"
                  fontWeight={isNoon ? 'bold' : 'normal'}
                >
                  {i === 0 ? 'M' : i === 12 ? 'N' : i === 24 ? 'M' : i > 12 ? `${i - 12}p` : `${i}a`}
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
                x={leftMargin - 12}
                y={row.y + 4}
                fill={row.color}
                fontSize="10"
                textAnchor="end"
                fontWeight="600"
              >
                {row.label}
              </text>

              {/* Row Total (Right) */}
              <text
                x={leftMargin + gridWidth + 20}
                y={row.y + 4}
                fill="#f8fafc"
                fontSize="11"
                textAnchor="start"
                fontWeight="bold"
              >
                {((totals[row.id] || 0) / 60).toFixed(1)}h
              </text>
            </g>
          ))}

          {/* Stepped Duty Polyline */}
          {pathD && (
            <>
              {/* Glow filter under line */}
              <path
                d={pathD}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="4"
                strokeOpacity="0.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={pathD}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2"
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
            textAnchor="start"
          >
            TOTAL
          </text>
        </svg>
      </div>

      {/* Interval Breakdown List */}
      <div className="mt-4 pt-3 border-t border-slate-800">
        <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
          Duty Status Change Log & Geotags
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          {intervals.map((it, idx) => {
            const startHour = Math.floor(it.startMinutes / 60);
            const startMin = it.startMinutes % 60;
            const endHour = Math.floor((it.startMinutes + it.durationMinutes) / 60);
            const endMin = (it.startMinutes + it.durationMinutes) % 60;
            const row = ROWS.find(r => r.id === it.status);

            return (
              <div
                key={idx}
                className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 text-xs flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={{ backgroundColor: `${row?.color}25`, color: row?.color }}
                  >
                    {row?.short} • {it.status.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-slate-400">
                    {String(startHour).padStart(2, '0')}:{String(startMin).padStart(2, '0')} - {String(endHour).padStart(2, '0')}:{String(endMin).padStart(2, '0')}
                  </span>
                </div>
                <div className="text-slate-300 font-medium truncate">{it.location || 'Highway Transit'}</div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">{it.remark} ({(it.durationMinutes / 60).toFixed(1)}h)</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
