import { useEffect, useState } from "react";
import "./app.css";

export default function App() {
  const [flights, setFlights] = useState([]);

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

  return (
    <div className="app">
      <header className="header">
        FLIGHT INTELLIGENCE LOG
      </header>

      <div className="list">
        {flights.map((f, i) => (
          <div key={f.id ?? i} className="row">
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
        ))}
      </div>
    </div>
  );
}
