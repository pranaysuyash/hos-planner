const clockTitles = [
  '11-Hour Drive Clock',
  '14-Hour Shift Window',
  '30-Min Rest Break',
  '70-Hour / 8-Day Cycle',
];

/** Remaining real-world duty clocks require driver and carrier history, not route totals. */
export function ScenarioClocks() {
  return (
    <section aria-label="Driver duty clock availability">
      <p>Actual remaining time is unavailable: complete duty history, carrier rules and current driver status are not supplied.</p>
      <div className="clocks-grid">
        {clockTitles.map(title => (
          <div className="clock-card" key={title}>
            <div className="clock-title"><span>{title}</span></div>
            <div className="clock-value">Unavailable</div>
          </div>
        ))}
      </div>
    </section>
  );
}
