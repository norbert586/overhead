import { useEffect, useState } from "react";
import RouteMap from "./RouteMap";

const LOGO_BASE = 'https://raw.githubusercontent.com/sexym0nk3y/airline-logos/main/logos';

export default function Stats({ apiBase }) {
  const API = apiBase || "http://192.168.86.234:8080";
  const [summary, setSummary] = useState(null);
  const [summary24h, setSummary24h] = useState(null);
  const [classificationDetailed, setClassificationDetailed] = useState([]);
  const [hourly, setHourly] = useState([]);

  const [topAircraft, setTopAircraft] = useState([]);
  const [topOperators, setTopOperators] = useState([]);
  const [countries, setCountries] = useState([]);
  const [routes, setRoutes] = useState([]);

  // New enhanced stats
  const [altitudeDistribution, setAltitudeDistribution] = useState([]);
  const [aircraftTypes, setAircraftTypes] = useState([]);
  const [activityByDay, setActivityByDay] = useState([]);
  const [recentNotable, setRecentNotable] = useState([]);

  // UI state
  const [expandedAircraft, setExpandedAircraft] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    // Existing endpoints
    fetch(`${API}/api/stats/summary`).then(r => r.json()).then(setSummary);
    fetch(`${API}/api/stats/summary-24h`).then(r => r.json()).then(setSummary24h);
    fetch(`${API}/api/stats/classification-detailed`).then(r => r.json()).then(setClassificationDetailed);
    fetch(`${API}/api/stats/hourly`).then(r => r.json()).then(setHourly);

    fetch(`${API}/api/stats/top-aircraft`).then(r => r.json()).then(setTopAircraft);
    fetch(`${API}/api/stats/top-operators`).then(r => r.json()).then(setTopOperators);
    fetch(`${API}/api/stats/countries`).then(r => r.json()).then(setCountries);
    fetch(`${API}/api/stats/routes`).then(r => r.json()).then(setRoutes);

    // New endpoints
    fetch(`${API}/api/stats/altitude-distribution`).then(r => r.json()).then(setAltitudeDistribution);
    fetch(`${API}/api/stats/aircraft-types`).then(r => r.json()).then(setAircraftTypes);
    fetch(`${API}/api/stats/activity-by-day`).then(r => r.json()).then(setActivityByDay);
    fetch(`${API}/api/stats/recent-notable`).then(r => r.json()).then(setRecentNotable);
  }, []);

  if (!summary || !summary24h) {
    return <div className="empty">Loading statistics…</div>;
  }

  // Fill all 24 hours (backend may skip hours with 0 events)
  const allHours = Array.from({ length: 24 }, (_, i) => {
    const hourStr = i.toString().padStart(2, '0');
    const found = hourly.find(h => h.hour === hourStr);
    return { hour: hourStr, events: found ? found.events : 0 };
  });
  const maxHourly = Math.max(...allHours.map(h => h.events), 1);

  const totalClassified = classificationDetailed.reduce((sum, c) => sum + c.total_count, 0);
  const maxAltitude = Math.max(...altitudeDistribution.map(a => a.count), 1);
  const maxAircraftType = Math.max(...aircraftTypes.map(a => a.event_count), 1);
  const maxDayActivity = Math.max(...activityByDay.map(d => d.events), 1);
  const maxRouteCount = Math.max(...routes.map(r => r.event_count), 1);

  // Calculate threat level based on government traffic
  const govClassification = classificationDetailed.find(c => c.classification === 'government');
  const govCount24h = govClassification?.count_24h || 0;
  const threatLevel = govCount24h >= 15 ? 'HIGH' : govCount24h >= 8 ? 'ELEVATED' : 'NOMINAL';

  return (
    <div className="stats">

      {/* THREAT ASSESSMENT HEADER */}
      <section className="threat-assessment">
        <div className="threat-indicator">
          <span className={`threat-level ${threatLevel.toLowerCase()}`}>
            {threatLevel}
          </span>
          <span className="threat-label">THREAT LEVEL</span>
        </div>
        <div className="threat-details">
          <div className="threat-stat">
            <strong>{govCount24h}</strong>
            <span>GOV/MIL (24h)</span>
          </div>
          <div className="threat-stat">
            <strong>{summary24h.events_24h}</strong>
            <span>TOTAL EVENTS (24h)</span>
          </div>
        </div>
      </section>

      {/* ALL-TIME SNAPSHOT */}
      <section>
        <h3>ALL-TIME SNAPSHOT</h3>
        <div className="snapshot">
          <div><strong>{summary.total_events.toLocaleString()}</strong><span>Events</span></div>
          <div><strong>{summary.unique_aircraft.toLocaleString()}</strong><span>Aircraft</span></div>
          <div><strong>{summary.operators.toLocaleString()}</strong><span>Operators</span></div>
          <div><strong>{summary.countries}</strong><span>Countries</span></div>
          <div><strong>{summary.avg_altitude?.toLocaleString() || 'N/A'}</strong><span>Avg Altitude</span></div>
        </div>
      </section>

      {/* CLASSIFICATION BREAKDOWN - ENHANCED */}
      <section>
        <h3>CLASSIFICATION BREAKDOWN</h3>
        <div className="classification-grid">
          {classificationDetailed.map(c => {
            const percentage = ((c.total_count / totalClassified) * 100).toFixed(1);
            const classColors = {
              commercial: 'rgba(100, 140, 255, 0.7)',
              private: 'rgba(234, 179, 8, 0.7)',
              government: 'rgba(220, 80, 80, 0.7)',
              cargo: 'rgba(139, 92, 246, 0.7)',
              unknown: 'rgba(255,255,255,0.25)'
            };

            return (
              <div key={c.classification} className="classification-item">
                <div className="classification-header">
                  <span className="classification-name">{c.classification.toUpperCase()}</span>
                  <span className="classification-percent">{percentage}%</span>
                </div>
                <div className="classification-bar-container">
                  <div
                    className="classification-bar"
                    style={{
                      width: `${percentage}%`,
                      background: classColors[c.classification] || classColors.unknown
                    }}
                  />
                </div>
                <div className="classification-stats">
                  <span>{c.total_count.toLocaleString()} events</span>
                  <span className="stat-sep">•</span>
                  <span>{c.unique_aircraft} aircraft</span>
                  {c.count_24h > 0 && (
                    <>
                      <span className="stat-sep">•</span>
                      <span className="stat-highlight">{c.count_24h} (24h)</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ALTITUDE DISTRIBUTION */}
      <section>
        <h3>ALTITUDE DISTRIBUTION</h3>
        <div className="altitude-grid">
          {altitudeDistribution.map(a => {
            const altLabels = {
              ground: 'GROUND',
              low: 'LOW (<10k ft)',
              medium: 'MEDIUM (10k-25k ft)',
              high: 'HIGH (>25k ft)'
            };
            const altColors = {
              ground: 'rgba(255,255,255,0.2)',
              low: 'rgba(234, 179, 8, 0.5)',
              medium: 'rgba(100, 140, 255, 0.5)',
              high: 'rgba(139, 92, 246, 0.5)'
            };

            return (
              <div key={a.altitude_band} className="altitude-item">
                <div className="altitude-header">
                  <span className="altitude-name">{altLabels[a.altitude_band]}</span>
                  <span className="altitude-count">{a.count.toLocaleString()}</span>
                </div>
                <div className="altitude-bar-container">
                  <div
                    className="altitude-bar"
                    style={{
                      width: `${(a.count / maxAltitude) * 100}%`,
                      background: altColors[a.altitude_band]
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* HOURLY ACTIVITY - VERTICAL BAR CHART */}
      <section>
        <h3>HOURLY ACTIVITY (LAST 24H)</h3>
        <div className="hourly-chart">
          {allHours.map(h => (
            <div key={h.hour} className="hourly-col">
              <span className="hourly-value">{h.events || ''}</span>
              <div className="hourly-track">
                <div
                  className="hourly-fill"
                  style={{ height: `${(h.events / maxHourly) * 100}%` }}
                />
              </div>
              <span className="hourly-label">
                {parseInt(h.hour) % 3 === 0 ? h.hour : ''}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* WEEKLY ACTIVITY PATTERN - FIXED */}
      {activityByDay.length > 0 && (
        <section>
          <h3>WEEKLY ACTIVITY PATTERN</h3>
          <div className="weekly-grid">
            {activityByDay.map(d => (
              <div key={d.day_num} className="day-item">
                <span className="day-count">{d.events}</span>
                <div className="day-bar-wrapper">
                  <div
                    className="day-bar"
                    style={{ height: `${(d.events / maxDayActivity) * 100}%` }}
                    title={`${d.events} events`}
                  />
                </div>
                <span className="day-name">{d.day_name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TOP AIRCRAFT TYPES - ENHANCED WITH MANUFACTURER */}
      <section>
        <h3>MOST COMMON AIRCRAFT TYPES</h3>
        <div className="aircraft-types-list">
          {aircraftTypes.slice(0, 10).map((a, idx) => (
            <div key={`${a.type_code}-${idx}`} className="aircraft-type-item">
              <div className="aircraft-type-header">
                <span className="aircraft-rank">#{idx + 1}</span>
                <div className="aircraft-type-info">
                  <div className="aircraft-type-title">
                    <span className="aircraft-type-code">{a.type_code}</span>
                    <span className="aircraft-model-name">{a.model || '—'}</span>
                  </div>
                  {a.manufacturer && (
                    <span className="aircraft-manufacturer">{a.manufacturer}</span>
                  )}
                </div>
                <span className="aircraft-type-count">{a.event_count}</span>
              </div>
              <div className="aircraft-type-bar-container">
                <div
                  className="aircraft-type-bar"
                  style={{ width: `${(a.event_count / maxAircraftType) * 100}%` }}
                />
              </div>
              <div className="aircraft-type-stats">
                <span>{a.event_count} events</span>
                <span className="stat-sep">•</span>
                <span>{a.unique_aircraft} aircraft</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* RECENT NOTABLE ACTIVITY */}
      <section>
        <h3>RECENT NOTABLE ACTIVITY</h3>
        <div className="notable-feed">
          {recentNotable.slice(0, 12).map((f, idx) => {
            const classColors = {
              commercial: 'rgba(100, 140, 255, 0.3)',
              private: 'rgba(234, 179, 8, 0.3)',
              government: 'rgba(220, 80, 80, 0.3)',
              cargo: 'rgba(139, 92, 246, 0.3)',
              unknown: 'rgba(255,255,255,0.1)'
            };

            return (
              <div
                key={`${f.callsign}-${f.last_seen}-${idx}`}
                className="notable-item"
                style={{ borderLeftColor: classColors[f.classification] || classColors.unknown }}
              >
                <div className="notable-header">
                  <span className="notable-callsign">{f.callsign || f.reg || 'UNKNOWN'}</span>
                  <span className={`notable-classification ${f.classification}`}>
                    {(f.classification || 'unknown').toUpperCase()}
                  </span>
                </div>
                <div className="notable-details">
                  <span className="notable-type">{f.type_code || f.model || '—'}</span>
                  {f.operator && (
                    <>
                      <span className="stat-sep">•</span>
                      <span className="notable-operator">{f.operator}</span>
                    </>
                  )}
                </div>
                <div className="notable-meta">
                  <span>{f.times_seen} passes</span>
                  {f.country_iso && (
                    <>
                      <span className="stat-sep">•</span>
                      <img
                        src={`https://flagcdn.com/16x12/${f.country_iso.toLowerCase()}.png`}
                        alt={f.country_iso}
                        style={{ verticalAlign: 'middle' }}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* MOST SEEN AIRCRAFT - CLICKABLE TILES */}
      <section>
        <h3>MOST SEEN AIRCRAFT</h3>
        <div className="aircraft-tiles">
          {topAircraft.map((a, idx) => (
            <div
              key={a.reg}
              className={`aircraft-tile ${expandedAircraft === a.reg ? 'expanded' : ''}`}
              onClick={() => setExpandedAircraft(expandedAircraft === a.reg ? null : a.reg)}
            >
              <div className="tile-header">
                <div className="tile-rank">#{idx + 1}</div>
                <div className="tile-main">
                  <span className="tile-reg">{a.reg}</span>
                  <span className="tile-type">{a.model || a.type_code || '—'}</span>
                </div>
                <div className="tile-seen">
                  <span className="tile-count">{a.times_seen}</span>
                  <span className="tile-count-label">seen</span>
                </div>
              </div>
              {expandedAircraft === a.reg && (
                <div className="tile-details">
                  {a.operator && (
                    <div className="tile-detail-row">
                      <span className="tile-label">Operator</span>
                      <span className="tile-value">{a.operator}</span>
                    </div>
                  )}
                  {a.manufacturer && (
                    <div className="tile-detail-row">
                      <span className="tile-label">Manufacturer</span>
                      <span className="tile-value">{a.manufacturer}</span>
                    </div>
                  )}
                  {a.type_code && (
                    <div className="tile-detail-row">
                      <span className="tile-label">Type Code</span>
                      <span className="tile-value">{a.type_code}</span>
                    </div>
                  )}
                  <div className="tile-detail-row">
                    <span className="tile-label">Classification</span>
                    <span className={`tile-classification ${a.classification || 'unknown'}`}>
                      {(a.classification || 'unknown').toUpperCase()}
                    </span>
                  </div>
                  {a.country_iso && (
                    <div className="tile-detail-row">
                      <span className="tile-label">Country</span>
                      <span className="tile-value">
                        <img
                          src={`https://flagcdn.com/16x12/${a.country_iso.toLowerCase()}.png`}
                          alt={a.country_iso}
                          style={{ verticalAlign: 'middle', marginRight: 6 }}
                        />
                        {a.country_iso}
                      </span>
                    </div>
                  )}
                  {a.last_seen && (
                    <div className="tile-detail-row">
                      <span className="tile-label">Last Seen</span>
                      <span className="tile-value">{new Date(a.last_seen + 'Z').toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* MOST ACTIVE OPERATORS - WITH LOGOS */}
      <section>
        <h3>MOST ACTIVE OPERATORS</h3>
        <div className="operators-list">
          {topOperators.map(o => (
            <div key={o.operator} className="operator-item">
              <div className="operator-logo-wrapper">
                {o.icao_code ? (
                  <img
                    src={`${LOGO_BASE}/${o.icao_code}.png`}
                    alt=""
                    className="operator-logo"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextElementSibling && (e.target.nextElementSibling.style.display = 'flex');
                    }}
                  />
                ) : null}
                <div
                  className="operator-logo-placeholder"
                  style={{ display: o.icao_code ? 'none' : 'flex' }}
                >
                  {(o.operator || '?')[0]}
                </div>
              </div>
              <div className="operator-info">
                <span className="operator-name">{o.operator}</span>
                <div className="operator-meta">
                  <span>{o.total_events} events</span>
                  <span className="stat-sep">•</span>
                  <span>{o.unique_aircraft} aircraft</span>
                </div>
              </div>
              <div className="operator-event-count">{o.total_events}</div>
            </div>
          ))}
        </div>
      </section>

      {/* COUNTRIES OVERHEAD */}
      <section>
        <h3>Countries Overhead</h3>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Country</th>
              <th>Aircraft</th>
              <th>Events</th>
            </tr>
          </thead>
          <tbody>
            {countries.map(c => (
              <tr key={c.country_iso}>
                <td>
                  <img
                    src={`https://flagcdn.com/24x18/${c.country_iso.toLowerCase()}.png`}
                    alt={c.country}
                  />
                </td>
                <td>{c.country}</td>
                <td>{c.aircraft_count}</td>
                <td>{c.event_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ROUTE MAP - COLLAPSIBLE DRAWER */}
      <section>
        <div
          className="map-drawer-toggle"
          onClick={() => setMapOpen(!mapOpen)}
        >
          <h3>FLIGHT ROUTE MAP</h3>
          <span className="map-drawer-arrow">{mapOpen ? '▲' : '▼'}</span>
        </div>
        {mapOpen && <RouteMap apiBase={API} />}
      </section>

      {/* TOP FLIGHT ROUTES - COMPACT */}
      <section>
        <h3>TOP FLIGHT ROUTES</h3>
        <div className="routes-list">
          {routes.map((r, i) => (
            <div key={i} className="route-item">
              <span className="route-rank">#{i + 1}</span>
              <div className="route-pair">
                <div className="route-endpoint">
                  <span className="route-iata">{r.origin_iata}</span>
                  {r.origin_city && <span className="route-city">{r.origin_city}</span>}
                </div>
                <span className="route-arrow">→</span>
                <div className="route-endpoint">
                  <span className="route-iata">{r.dest_iata}</span>
                  {r.dest_city && <span className="route-city">{r.dest_city}</span>}
                </div>
              </div>
              <div className="route-count-col">
                <span className="route-count">{r.event_count}</span>
                <div className="route-bar-track">
                  <div
                    className="route-bar-fill"
                    style={{ width: `${(r.event_count / maxRouteCount) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
