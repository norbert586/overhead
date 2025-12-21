import { useEffect, useState } from "react";

export default function Stats() {
  const [summary, setSummary] = useState(null);
  const [topAircraft, setTopAircraft] = useState([]);
  const [topOperators, setTopOperators] = useState([]);
  const [countries, setCountries] = useState([]);
  const [routes, setRoutes] = useState([]);

useEffect(() => {
  fetch("http://localhost:8080/api/stats/summary")
    .then(r => r.json())
    .then(setSummary);

  fetch("http://localhost:8080/api/stats/top-aircraft")
    .then(r => r.json())
    .then(setTopAircraft);

  fetch("http://localhost:8080/api/stats/top-operators")
    .then(r => r.json())
    .then(setTopOperators);

  fetch("http://localhost:8080/api/stats/countries")
    .then(r => r.json())
    .then(setCountries);

  fetch("http://localhost:8080/api/stats/routes")
    .then(r => r.json())
    .then(setRoutes);
}, []);


  if (!summary) return <div className="empty">Loading statistics…</div>;

  return (
    <div className="stats">
      {/* Snapshot */}
      <div className="snapshot">
        <div><strong>{summary.total_events}</strong><span>Flights Logged</span></div>
        <div><strong>{summary.unique_aircraft}</strong><span>Unique Aircraft</span></div>
        <div><strong>{summary.operators}</strong><span>Operators</span></div>
        <div><strong>{summary.countries}</strong><span>Countries</span></div>
        <div><strong>{summary.avg_altitude}</strong><span>Avg Altitude (ft)</span></div>
      </div>

      {/* Top Aircraft */}
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

      {/* Operators */}
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

      {/* Countries */}
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

      {/* Routes */}
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
