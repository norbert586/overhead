import { useEffect, useMemo, useState } from "react";
import "./app.css";

export default function App() {
  const [flights, setFlights] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("http://localhost:8080/api/flights?limit=50")
      .then((res) => res.json())
      .then(setFlights)
      .catch(console.error);

    const interval = setInterval(() => {
      fetch("http://localhost:8080/api/flights?limit=50")
        .then((res) => res.json())
        .then(setFlights)
        .catch(console.error);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flights;
    return flights.filter((f) => {
      return (
        (f.callsign && f.callsign.toLowerCase().includes(q)) ||
        (f.reg && f.reg.toLowerCase().includes(q)) ||
        (f.type_code && f.type_code.toLowerCase().includes(q)) ||
        (f.model && f.model.toLowerCase().includes(q)) ||
        (f.origin_iata && f.origin_iata.toLowerCase().includes(q)) ||
        (f.dest_iata && f.dest_iata.toLowerCase().includes(q))
      );
    });
  }, [flights, query]);

  return (
    <div className="app">
      <div className="card">
        <header className="header">
          FLIGHT INTELLIGENCE LOGS
        </header>

        <div className="controls">
          <input
            className="search"
            placeholder="Filter by callsign, reg, type, origin, dest..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter flights"
          />
        </div>

        <div className="list" role="list">
          {filtered.length === 0 ? (
            <div className="empty">No flights — try widening your filter.</div>
          ) : (
            filtered.map((f, i) => (
              <div
                key={f.id ?? i}
                className="row"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") console.log("open", f);
                }}
                onClick={() => console.log("open", f)}
              >
                <span className="time">
                  {new Date(f.last_seen).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>

                <span className="callsign">
                  {f.callsign || f.reg || "UNKNOWN"}
                </span>

                <span className="type">
                  {f.type_code || f.model || "—"}
                </span>

                <span className="route">
                  {f.origin_iata && f.dest_iata
                    ? `${f.origin_iata}→${f.dest_iata}`
                    : "—"}
                </span>

                <span className="altitude">
                  {f.altitude_ft === "ground" ? "GND" : `${f.altitude_ft}ft`}
                </span>

                <span className="distance">
                  {f.distance_nm?.toFixed(1)}nm
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
