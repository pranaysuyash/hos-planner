import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LogbookGrid } from '../src/ui/LogbookGrid';

describe('scenario logbook presentation', () => {
  it('keeps a printable chart while withholding invented identity, history and certification', () => {
    const html = renderToStaticMarkup(createElement(LogbookGrid, { driverName: 'Scenario driver', dateLabel: 'Day 1 of 1', intervals: [{ status: 'DRIVING', startMinutes: 0, durationMinutes: 60, location: 'Example', remark: 'Scenario' }] }));
    expect(html).toContain('Scenario');
    expect(html).not.toContain('Print Roadside DOT Sheet');
    expect(html).not.toContain('I certify that these entries are true');
    expect(html).not.toContain('DRV-849204');
    expect(html).not.toContain('582 MILES');
    expect(html).not.toContain('60.0h / 70h');
    expect(html).toContain('history unavailable');
    expect(html).toContain('Unmodeled time is unknown');
    expect(html).not.toContain('Valid 24.0h');
    expect(html).not.toContain('Apex Freight Logistics');
  });
});
