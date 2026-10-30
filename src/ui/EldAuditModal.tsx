import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconFileText } from './icons';
import type { CorridorItineraryPlan, HOSAuditResult } from '../engine/types';
import './duty-report.css';

interface ReportContext {
  shipmentReference?: string;
  driverId?: string;
  carrierDot?: string;
  equipmentId?: string;
}
interface EldAuditModalProps {
  plan: CorridorItineraryPlan;
  audit: HOSAuditResult;
  driverMode: 'solo' | 'team';
  context?: ReportContext;
  isOpen: boolean;
  onClose: () => void;
}
interface ReportSnapshot {
  plan: CorridorItineraryPlan;
  audit: HOSAuditResult;
  driverMode: 'solo' | 'team';
  context: ReportContext;
  preparedAt: string;
}

/** A frozen planning report per opening; it never certifies a driver's actual log. */
export function EldAuditModal({ plan, audit, driverMode, context, isOpen, onClose }: EldAuditModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const latest = useRef({ plan, audit, driverMode, context });
  latest.current = { plan, audit, driverMode, context };
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  useEffect(() => {
    if (isOpen) setSnapshot({ ...structuredClone(latest.current), context: structuredClone(latest.current.context ?? {}), preparedAt: new Date().toISOString() });
  }, [isOpen]);
  useEffect(() => {
    const element = dialog.current;
    if (!isOpen || !snapshot || !element) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!element.open) element.showModal();
    heading.current?.focus();
    return () => {
      if (element.open) element.close();
      queueMicrotask(() => { if (!element.open && opener?.isConnected) opener.focus(); });
    };
  }, [isOpen, snapshot]);
  if (!isOpen || !snapshot || typeof document === 'undefined') return null;
  const report = snapshot;
  const minutes = (status: string) => report.plan.waypoints.filter(w => w.dutyStatus === status).reduce((sum, w) => sum + w.durationMinutes, 0);
  const statuses = ['OFF_DUTY', 'SLEEPER_BERTH', 'DRIVING', 'ON_DUTY_NOT_DRIVING'];
  const totalMinutes = report.plan.waypoints.reduce((sum, w) => sum + w.durationMinutes, 0);
  const violations = [...report.plan.violations, ...report.audit.violations].filter((v, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(v)) === index);
  return createPortal(
    <dialog ref={dialog} className="duty-report-dialog" aria-labelledby="eld-modal-title" aria-describedby="duty-report-scope"
      onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <article className="duty-report-content">
        <header className="duty-report-toolbar">
          <h2 id="eld-modal-title" ref={heading} tabIndex={-1}><IconFileText size={18} /> Modeled duty planning report</h2>
          <div className="duty-report-actions"><button onClick={() => window.print()}>Print planning report</button><button onClick={onClose}>Close</button></div>
        </header>
        <p id="duty-report-scope" className="duty-report-scope">Scenario estimate using the native full-rest model. This report is not a certified ELD record, driver log, signature or regulatory approval. Actual departure, duty history, appointments and physical observations are not supplied.</p>
        <dl className="duty-report-metadata">
          <div><dt>Prepared at</dt><dd>{report.preparedAt}</dd></div>
          <div><dt>Shipment reference</dt><dd>{report.context.shipmentReference ?? 'Not declared'}</dd></div>
          <div><dt>Driver ID</dt><dd>{report.context.driverId ?? 'Not declared'}</dd></div>
          <div><dt>Carrier DOT</dt><dd>{report.context.carrierDot ?? 'Not declared'}</dd></div>
          <div><dt>Equipment ID</dt><dd>{report.context.equipmentId ?? 'Not declared'}</dd></div>
          <div><dt>Operation</dt><dd>{report.driverMode.toUpperCase()} scenario</dd></div>
        </dl>
        <p><strong>{report.plan.origin} → {report.plan.destination}</strong> · {report.plan.totalDistanceMiles.toLocaleString()} miles · {report.plan.avgSpeedMph} mph</p>
        <p>All timing below is elapsed from modeled departure. No calendar date or midnight start is inferred. The rows cover the full trip, which may span several days.</p>
        <div className="duty-report-table"><table><caption>Modeled duty durations from reviewed waypoints</caption><thead><tr><th scope="col">Duty status</th><th scope="col">Hours</th></tr></thead><tbody>
          {statuses.map(status => <tr key={status}><th scope="row">{status.replaceAll('_', ' ')}</th><td>{(minutes(status) / 60).toFixed(2)}</td></tr>)}
          <tr><th scope="row">TOTAL MODELED TRIP</th><td>{(totalMinutes / 60).toFixed(2)}</td></tr>
        </tbody></table></div>
        <h3>Native model checks</h3>
        <p>{report.plan.isLegal && report.audit.isCompliant ? 'No violations detected within the supplied model intervals.' : 'The native model detected violations; review the entries below.'}</p>
        <p>{report.plan.complianceSummary}</p>
        <p>The audit starts from the supplied scenario. It does not establish preceding eight-day duty history or validate split-sleeper pairings. Team exploration does not replace an individual driver log.</p>
        {violations.length > 0 && <ul>{violations.map((v, i) => <li key={i}><strong>{v.rule} · {v.severity}</strong>: {v.message} <span>{v.statutoryRemedy}</span></li>)}</ul>}
        <div className="duty-report-table"><table><caption>Complete reviewed itinerary</caption><thead><tr><th scope="col">Elapsed end</th><th scope="col">Location and activity</th><th scope="col">Duty status</th><th scope="col">Minutes</th></tr></thead><tbody>
          {report.plan.waypoints.map(w => <tr key={w.id}><td>{(w.cumulativeTimeMinutes / 60).toFixed(2)} h</td><td><strong>{w.title}</strong><br />{w.location}<br /><small>{w.notes}</small></td><td>{w.dutyStatus.replaceAll('_', ' ')}</td><td>{w.durationMinutes}</td></tr>)}
        </tbody></table></div>
        <footer>Planning discussion only. Confirm real operation against the assigned driver's records and current applicable requirements. No signature or attestation has been generated.</footer>
      </article>
    </dialog>, document.body,
  );
}
