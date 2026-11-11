import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScenarioClocks } from '../src/ui/ScenarioClocks';

describe('scenario clock presentation', () => {
  it('preserves each clock while explaining that actual remaining time is unknown', () => {
    const html = renderToStaticMarkup(createElement(ScenarioClocks));
    for (const title of ['11-Hour Drive Clock', '14-Hour Shift Window', '30-Min Rest Break', '70-Hour / 8-Day Cycle']) {
      expect(html).toContain(title);
    }
    expect(html.match(/Unavailable/g)).toHaveLength(4);
    expect(html).toContain('complete duty history');
    expect(html).not.toContain('STATUTORY OK');
  });
});
