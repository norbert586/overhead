import { useEffect, useState } from "react";

const API = "http://localhost:8080";

export default function Stats() {
  const [summary, setSummary] = useState(null);
  const [summary24h, setSummary24h] = useState(null);
  const [classification, setClassification] = useState([]);
  const [hourly, setHourly] = useState([]);

  const [topAircraft, setTopAircraft] = useState([]);
  const [topOperators, setTopOperators] = useState([]);
  const [countries, setCountries] = useState([]);
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    fetch(`${API}/api/stats/summary`).then(r => r.json()).then(setSummary);
    fetch(`${API}/api/stats/summary-24h`).then(r => r.json()).then(setSummary24h);
    fetch(`${API}/api/stats/classification`).then(r => r.json()).then(setClassification);
    fetch(`${API}/api/stats/hourly`).then(r => r.json()).then(setHourly);

    fetch(`${API}/api/stats/top-aircraft`).then(r => r.json()).then(setTopAircraft);
    fetch(`${API}/api/stats/top-operators`).then(r => r.json()).then(setTopOperators);
    fetch(`${API}/api/stats/countries`).then(r => r.json()).then(setCountries);
    fetch(`${API}/api/stats/routes`).then(r => r.json()).then(setRoutes);
  }, []);

  if (!summary || !summary24h) {
    return <div className="empty">Loading statistics…</div>;
  }

  const maxHourly = Math.max(...hourly.map(h => h.events), 1);

  return (
    <div className="stats">

      {/* ALL-TIME SNAPSHOT */}
      <section>
        <h3>All-Time Snapshot</h3>
        <div className="snapshot">
          <div><strong>{summary.total_events}</strong><span>Events</span></div>
          <div><strong>{summary.unique_aircraft}</strong><span>Aircraft</span></div>
          <div><strong>{summary.operators}</strong><span>Operators</span></div>
          <div><strong>{summary.countries}</strong><span>Countries</span></div>
          <div><strong>{summary.avg_altitude}</strong><span>Avg Altitude</span></div>
        </div>
      </section>

      {/* 24H SNAPSHOT */}
      <section>
        <h3>Last 24 Hours</h3>
        <div className="snapshot">
          <div><strong>{summary24h.events_24h}</strong><span>Events</span></div>
          <div><strong>{summary24h.aircraft_24h}</strong><span>Aircraft</span></div>
          <div><strong>{summary24h.operators_24h}</strong><span>Operators</span></div>
        </div>
      </section>

      {/* CLASSIFICATION */}
      <section>
        <h3>Classification</h3>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Events</th>
            </tr>
          </thead>
          <tbody>
            {classification.map(c => (
              <tr key={c.classification}>
                <td>{c.classification}</td>
                <td>{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* HOURLY HISTOGRAM */}
      <section>
        <h3>Hourly Activity (Last 24h)</h3>
        <div className="hourly">
          {hourly.map(h => (
            <div key={h.hour} className="hour">
              <span className="hour-label">{h.hour}</span>
              <div
                className="hour-bar"
                style={{ width: `${(h.events / maxHourly) * 100}%` }}
                title={`${h.events} events`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* EXISTING SECTIONS (UNCHANGED) */}
      <section>
        <h3>Most Seen Aircraft</h3>
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
        <h3>Top Routes</h3>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Events</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r, i) => (
              <tr key={i}>
                <td>{r.origin_iata} → {r.dest_iata}</td>
                <td>{r.event_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

    </div>
  );
}
