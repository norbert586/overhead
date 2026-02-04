import { useEffect, useState } from "react";
import RouteMap from "./RouteMap";

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

  // Modal for notable flights
  const [expandedFlight, setExpandedFlight] = useState(null);
  const [photoCache, setPhotoCache] = useState({}); // reg -> photo | null

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

  // Load aircraft photo
  const loadPhotoForReg = async (reg) => {
    if (!reg || photoCache[reg] !== undefined) return;

    try {
      const res = await fetch(`https://api.planespotters.net/pub/photos/reg/${reg}`);
      const data = await res.json();
      const photo = data?.photos?.length ? data.photos[0] : null;
      setPhotoCache((prev) => ({ ...prev, [reg]: photo }));
    } catch {
      setPhotoCache((prev) => ({ ...prev, [reg]: null }));
    }
  };

  if (!summary || !summary24h) {
    return <div className="empty">Loading statistics…</div>;
  }

  const maxHourly = Math.max(...hourly.map(h => h.events), 1);
  const totalClassified = classificationDetailed.reduce((sum, c) => sum + c.total_count, 0);
  const maxAltitude = Math.max(...altitudeDistribution.map(a => a.count), 1);
  const maxAircraftType = Math.max(...aircraftTypes.map(a => a.event_count), 1);
  const maxDayActivity = Math.max(...activityByDay.map(d => d.events), 1);

  // Calculate threat level based on government traffic (more conservative thresholds)
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

      {/* ROUTE MAP */}
      <RouteMap apiBase={API} />

      {/* ALTITUDE DISTRIBUTION */}
      <section>
        <h3>ALTITUDE DISTRIBUTION</h3>
        <div className="altitude-grid">
          {altitudeDistribution.map(a => {
            const percentage = ((a.count / summary.total_events) * 100).toFixed(1);
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

      {/* HOURLY HISTOGRAM */}
      <section>
        <h3>HOURLY ACTIVITY (LAST 24H)</h3>
        <div className="hourly">
          {hourly.map(h => (
            <div key={h.hour} className="hour">
              <span className="hour-label">{h.hour}</span>
              <div className="hour-bar-container">
                <div
                  className="hour-bar"
                  style={{ width: `${(h.events / maxHourly) * 100}%` }}
                  title={`${h.events} events`}
                />
              </div>
              <span className="hour-count">{h.events}</span>
            </div>
          ))}
        </div>
      </section>

      {/* WEEKLY ACTIVITY PATTERN */}
      {activityByDay.length > 0 && (
        <section>
          <h3>WEEKLY ACTIVITY PATTERN</h3>
          <div className="weekly-grid">
            {activityByDay.map(d => (
              <div key={d.day_num} className="day-item">
                <span className="day-name">{d.day_name}</span>
                <div
                  className="day-bar"
                  style={{ height: `${(d.events / maxDayActivity) * 100}%` }}
                  title={`${d.events} events`}
                />
                <span className="day-count">{d.events}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TOP AIRCRAFT TYPES */}
      <section>
        <h3>MOST COMMON AIRCRAFT TYPES</h3>
        <div className="aircraft-types-list">
          {aircraftTypes.slice(0, 10).map((a, idx) => (
            <div key={`${a.type_code}-${idx}`} className="aircraft-type-item">
              <div className="aircraft-type-header">
                <span className="aircraft-rank">#{idx + 1}</span>
                <span className="aircraft-type">{a.type_code}</span>
                <span className="aircraft-model">{a.model || '—'}</span>
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
                className="notable-item notable-item-clickable"
                style={{ borderLeftColor: classColors[f.classification] || classColors.unknown }}
                onClick={() => setExpandedFlight(f)}
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

      {/* MOST SEEN AIRCRAFT */}
      <section>
        <h3>MOST SEEN AIRCRAFT</h3>
        <table>
          <thead>
            <tr>
              <th>Reg</th>
              <th>Type</th>
              <th>Operator</th>
              <th>Seen</th>
            </tr>
          </thead>
          <tbody>
            {topAircraft.map(a => (
              <tr key={a.reg}>
                <td>{a.reg}</td>
                <td>{a.model || a.type_code}</td>
                <td>{a.operator}</td>
                <td>{a.times_seen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Most Active Operators</h3>
        <table>
          <thead>
            <tr>
              <th>Operator</th>
              <th>Events</th>
              <th>Aircraft</th>
            </tr>
          </thead>
          <tbody>
            {topOperators.map(o => (
              <tr key={o.operator}>
                <td>{o.operator}</td>
                <td>{o.total_events}</td>
                <td>{o.unique_aircraft}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

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

      <section>
        <h3>TOP FLIGHT ROUTES</h3>
        <div className="routes-list">
          {routes.slice(0, 10).map((r, idx) => {
            const maxRoute = routes[0]?.event_count || 1;

            // Extract country ISO codes from the airport data if available
            // The country_iso might be in the data or we need to infer it
            const getCountryISO = (country) => {
              // Common country name to ISO mapping for major countries
              const countryMap = {
                'United States': 'us',
                'United Kingdom': 'gb',
                'Canada': 'ca',
                'Mexico': 'mx',
                'France': 'fr',
                'Germany': 'de',
                'Spain': 'es',
                'Italy': 'it',
                'Netherlands': 'nl',
                'Belgium': 'be',
                'Switzerland': 'ch',
                'Austria': 'at',
                'Portugal': 'pt',
                'Greece': 'gr',
                'Turkey': 'tr',
                'Japan': 'jp',
                'China': 'cn',
                'South Korea': 'kr',
                'Australia': 'au',
                'New Zealand': 'nz',
                'Brazil': 'br',
                'Argentina': 'ar',
                'India': 'in',
                'Russia': 'ru',
                'South Africa': 'za',
                'UAE': 'ae',
                'Saudi Arabia': 'sa',
                'Qatar': 'qa',
                'Singapore': 'sg',
                'Thailand': 'th',
                'Malaysia': 'my',
                'Indonesia': 'id',
                'Philippines': 'ph',
                'Vietnam': 'vn',
                'Israel': 'il',
                'Egypt': 'eg',
                'Morocco': 'ma',
                'Kenya': 'ke',
                'Nigeria': 'ng',
                'Chile': 'cl',
                'Colombia': 'co',
                'Peru': 'pe',
                'Venezuela': 've',
                'Ecuador': 'ec',
                'Poland': 'pl',
                'Czech Republic': 'cz',
                'Hungary': 'hu',
                'Romania': 'ro',
                'Ukraine': 'ua',
                'Sweden': 'se',
                'Norway': 'no',
                'Denmark': 'dk',
                'Finland': 'fi',
                'Iceland': 'is',
                'Ireland': 'ie',
                'Luxembourg': 'lu'
              };
              return countryMap[country] || null;
            };

            const originISO = getCountryISO(r.origin_country);
            const destISO = getCountryISO(r.dest_country);

            return (
              <div key={`${r.origin_iata}-${r.dest_iata}-${idx}`} className="route-item">
                <div className="route-header">
                  <span className="route-rank">#{idx + 1}</span>
                  <div className="route-path">
                    <div className="route-airport">
                      <strong>{r.origin_iata}</strong>
                      {r.origin_city && <span className="route-city">{r.origin_city}</span>}
                      {originISO && (
                        <img
                          src={`https://flagcdn.com/16x12/${originISO}.png`}
                          alt={r.origin_country}
                          className="route-flag"
                        />
                      )}
                    </div>
                    <span className="route-arrow">→</span>
                    <div className="route-airport">
                      <strong>{r.dest_iata}</strong>
                      {r.dest_city && <span className="route-city">{r.dest_city}</span>}
                      {destISO && (
                        <img
                          src={`https://flagcdn.com/16x12/${destISO}.png`}
                          alt={r.dest_country}
                          className="route-flag"
                        />
                      )}
                    </div>
                  </div>
                  <span className="route-count">{r.event_count}</span>
                </div>
                <div className="route-bar-container">
                  <div
                    className="route-bar"
                    style={{ width: `${(r.event_count / maxRoute) * 100}%` }}
                  />
                </div>
                {(r.origin_country || r.dest_country) && (
                  <div className="route-countries">
                    {r.origin_country && <span>{r.origin_country}</span>}
                    {r.origin_country && r.dest_country && <span className="stat-sep">•</span>}
                    {r.dest_country && <span>{r.dest_country}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* MODAL FOR EXPANDED FLIGHT */}
      {expandedFlight && (
        <div className="flight-modal-overlay" onClick={() => setExpandedFlight(null)}>
          <div className="flight-modal" onClick={(e) => e.stopPropagation()}>
            <div className="flight-modal-header">
              <h3>FLIGHT DETAILS</h3>
              <button className="flight-modal-close" onClick={() => setExpandedFlight(null)}>×</button>
            </div>

            <div className="flight-modal-content">
              {/* Aircraft Photo */}
              {expandedFlight.reg && (() => {
                if (photoCache[expandedFlight.reg] === undefined) {
                  loadPhotoForReg(expandedFlight.reg);
                }
                const photo = photoCache[expandedFlight.reg];
                return photo ? (
                  <div className="flight-modal-photo">
                    <img
                      src={photo.thumbnail_large?.src || photo.thumbnail?.src}
                      alt={`${expandedFlight.reg}`}
                    />
                    <div className="photo-credit">
                      Photo: {photo.photographer} via Planespotters.net
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="flight-modal-grid">
                <span className="label">Callsign</span>
                <span className="value">{expandedFlight.callsign || '—'}</span>

                <span className="label">Registration</span>
                <span className="value">{expandedFlight.reg || '—'}</span>

                <span className="label">Aircraft Type</span>
                <span className="value">{expandedFlight.type_code || '—'}</span>

                <span className="label">Model</span>
                <span className="value">{expandedFlight.model || '—'}</span>

                <span className="label">Operator</span>
                <span className="value">{expandedFlight.operator || '—'}</span>

                <span className="label">Classification</span>
                <span className="value">{(expandedFlight.classification || 'unknown').toUpperCase()}</span>

                <span className="label">Altitude</span>
                <span className="value">{expandedFlight.altitude_ft || '—'}</span>

                <span className="label">Country</span>
                <span className="value">
                  {expandedFlight.country_iso && (
                    <>
                      <img
                        src={`https://flagcdn.com/16x12/${expandedFlight.country_iso.toLowerCase()}.png`}
                        alt={expandedFlight.country_iso}
                        style={{ verticalAlign: 'middle', marginRight: '8px' }}
                      />
                      {expandedFlight.country_iso}
                    </>
                  )}
                  {!expandedFlight.country_iso && '—'}
                </span>

                <span className="label">Times Seen</span>
                <span className="value">{expandedFlight.times_seen}</span>

                <span className="label">Last Seen</span>
                <span className="value">{expandedFlight.last_seen || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
