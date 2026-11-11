import React, { useState } from 'react';
import {
  NorthAmericanJurisdiction,
  JURISDICTION_RULES,
  MAJOR_BORDER_CROSSINGS,
  auditCrossBorderCompliance,
} from '../engine/crossBorderHos';
import { IconAlertTriangle, IconCheck, IconGlobe, IconX } from './icons';

export interface CrossBorderHosModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDrivingHours: number;
  currentDutyHours?: number;
  onSelectJurisdiction?: (jurisdiction: NorthAmericanJurisdiction) => void;
}

export const CrossBorderHosModal: React.FC<CrossBorderHosModalProps> = ({
  isOpen,
  onClose,
  currentDrivingHours,
  currentDutyHours = currentDrivingHours + 1.5,
  onSelectJurisdiction,
}) => {
  const [activeJurisdiction, setActiveJurisdiction] = useState<NorthAmericanJurisdiction>('US_FMCSA');
  const [selectedPortKey, setSelectedPortKey] = useState<string>('AMBASSADOR_BRIDGE');
  const continuousDriving = Math.min(currentDrivingHours, 4.5);

  if (!isOpen) return null;

  const audit = auditCrossBorderCompliance(activeJurisdiction, currentDrivingHours, currentDutyHours, continuousDriving);
  const rules = JURISDICTION_RULES[activeJurisdiction];
  const port = MAJOR_BORDER_CROSSINGS[selectedPortKey];

  const handleApply = (j: NorthAmericanJurisdiction) => {
    if (onSelectJurisdiction) {
      onSelectJurisdiction(j);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cross-border-hos-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(2, 6, 23, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '740px',
          backgroundColor: '#0b1329',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#f8fafc',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #0b1329 0%, #111e38 100%)',
          }}
        >
          <div>
            <h3
              id="cross-border-hos-title"
              style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <IconGlobe size={16} />
              <span>USMCA Cross-Border HOS Regulations</span>
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>
              Statutory Rules for United States (FMCSA), Canada (SOR/2005-313), and Mexico (NOM-087)
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Jurisdiction Tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {(Object.keys(JURISDICTION_RULES) as NorthAmericanJurisdiction[]).map((jKey) => {
              const r = JURISDICTION_RULES[jKey];
              const isSelected = jKey === activeJurisdiction;
              return (
                <button
                  key={jKey}
                  type="button"
                  onClick={() => setActiveJurisdiction(jKey)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: isSelected ? '1px solid #38bdf8' : '1px solid #334155',
                    backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : '#0f172a',
                    color: isSelected ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: isSelected ? 700 : 500,
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 700, color: isSelected ? '#38bdf8' : '#cbd5e1' }}>{r.title}</div>
                  <div style={{ fontSize: '10px', marginTop: '2px', opacity: 0.8 }}>{r.statuteRef}</div>
                </button>
              );
            })}
          </div>

          {/* Border Port Selection */}
          <div
            style={{
              background: '#0f172a',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid #1e293b',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                BORDER CROSSING PORT:
              </label>
              <select
                value={selectedPortKey}
                onChange={(e) => setSelectedPortKey(e.target.value)}
                style={{
                  padding: '6px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f8fafc',
                  fontSize: '11px',
                }}
              >
                {Object.entries(MAJOR_BORDER_CROSSINGS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '16px', fontSize: '11px' }}>
              <div>
                <span style={{ color: '#94a3b8' }}>Est. Wait:</span> <strong>{port.typicalWaitMinutes} min</strong>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>FAST Lane:</span>{' '}
                <strong style={{ color: port.fastLaneAvailable ? '#10b981' : '#94a3b8' }}>
                  {port.fastLaneAvailable ? 'AVAILABLE' : 'STANDARD ONLY'}
                </strong>
              </div>
            </div>
          </div>

          {/* Comparative Limits HUD */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px',
              background: '#090d1c',
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid #1e293b',
            }}
          >
            <div>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>MAX DRIVING:</span>
              <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'monospace', color: '#f8fafc' }}>
                {rules.maxDrivingHours.toFixed(1)} hrs
              </div>
              <span style={{ fontSize: '10px', color: '#64748b' }}>Rem: {audit.remainingDriveHours.toFixed(1)}h</span>
            </div>

            <div>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>SHIFT WINDOW:</span>
              <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'monospace', color: '#f8fafc' }}>
                {rules.maxShiftWindowHours.toFixed(1)} hrs
              </div>
              <span style={{ fontSize: '10px', color: '#64748b' }}>Rem: {audit.remainingDutyHours.toFixed(1)}h</span>
            </div>

            <div>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>DAILY REST:</span>
              <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'monospace', color: '#f8fafc' }}>
                {rules.mandatoryRestHours.toFixed(1)} hrs
              </div>
              <span style={{ fontSize: '10px', color: '#64748b' }}>Mandatory</span>
            </div>

            <div>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>REST BREAK:</span>
              <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'monospace', color: '#f8fafc' }}>
                {rules.breakRequirement.durationMinutes} min
              </div>
              <span style={{ fontSize: '10px', color: '#64748b' }}>after {rules.breakRequirement.afterDrivingHours}h driving</span>
            </div>

            <div>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>PRIMARY CYCLE:</span>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                {rules.cycleOptions[0]?.name.split(' ')[0]} {rules.cycleOptions[0]?.name.split(' ')[1]}
              </div>
              <span style={{ fontSize: '10px', color: '#64748b' }}>{rules.cycleOptions[0]?.resetHours}h reset</span>
            </div>
          </div>

          {/* Compliance Status & Violations */}
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              backgroundColor: audit.isOverallLegal ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${audit.isOverallLegal ? '#10b981' : '#ef4444'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: audit.isOverallLegal ? '#10b981' : '#ef4444',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {audit.isOverallLegal ? <IconCheck size={13} /> : <IconAlertTriangle size={13} />}
                <span>LEGAL STATUS: {audit.isOverallLegal ? 'COMPLIANT UNDER JURISDICTION' : 'STATUTORY VIOLATION'}</span>
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Driven: <strong>{currentDrivingHours}h</strong> / On-Duty: <strong>{currentDutyHours}h</strong>
              </span>
            </div>

            {audit.violations.length > 0 ? (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {audit.violations.map((v, idx) => (
                  <div key={idx} style={{ fontSize: '11px', color: '#fca5a5' }}>
                    • {v}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#6ee7b7' }}>
                Trip schedule fully satisfies all statutory rules under {rules.title} ({rules.statuteRef}).
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            background: '#090d1c',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#1e293b',
              border: 'none',
              borderRadius: '6px',
              color: '#94a3b8',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => handleApply(activeJurisdiction)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0284c7',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Switch to {rules.title}
          </button>
        </div>
      </div>
    </div>
  );
};
