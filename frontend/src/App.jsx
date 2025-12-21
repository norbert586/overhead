import { useEffect, useMemo, useState } from "react";
import "./app.css";
import Stats from "./Stats";


export default function App() {
  const [flights, setFlights] = useState([]);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [photoCache, setPhotoCache] = useState({});
  const [view, setView] = useState("live"); // "live" | "stats"


  /* -----------------------------
     Fetch flight list
  ------------------------------ */
  useEffect(() => {
    const fetchFlights = () => {
      fetch("http://localhost:8080/api/flights?limit=150")
        .then((res) => res.json())
        .then(setFlights)
        .catch(console.error);
    };

    fetchFlights();
    const interval = setInterval(fetchFlights, 5000);
    return () => clearInterval(interval);
  }, []);

  /* -----------------------------
     Lazy aircraft photo loader
  ------------------------------ */
  const loadPhotoForReg = async (reg) => {
    if (!reg || photoCache[reg]) return;

    try {
      const res = await fetch(
        `https://api.planespotters.net/pub/photos/reg/${reg}`
      );
      const data = await res.json();

      const photo =
        data.photos && data.photos.length > 0
          ? data.photos[0]
          : null;

      setPhotoCache((prev) => ({
        ...prev,
        [reg]: photo,
      }));
    } catch (err) {
      setPhotoCache((prev) => ({
        ...prev,
        [reg]: null,
      }));
    }
  };

  const seenIndicator = (count) => {
  if (count >= 10) return " ✦";
  if (count >= 6) return " ••";
  if (count >= 3) return " •";
  return "";
};

const flagUrl = (iso) => {
  if (!iso) return null;
  return `https://flagcdn.com/w20/${iso.toLowerCase()}.png`;
};



  /* -----------------------------
     Filtering
  ------------------------------ */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flights;

    return flights.filter((f) =>
      [
        f.callsign,
        f.reg,
        f.type_code,
        f.model,
        f.origin_iata,
        f.dest_iata,
      ]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [flights, query]);

  /* -----------------------------
     Render
  ------------------------------ */
  return (
    <div className="app">
      <div className="card">
        {/* HEADER */}
        <header className="header">
          <span>FLIGHT INTELLIGENCE</span>
          <nav className="nav">
            <button
              className={view === "live" ? "nav-active" : ""}
              onClick={() => setView("live")}
            >
              LIVE
            </button>
            <button
              className={view === "stats" ? "nav-active" : ""}
              onClick={() => setView("stats")}
            >
              STATS
            </button>
          </nav>
        </header>

        {/* LIVE VIEW */}
        {view === "live" && (
          <>
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
              {filtered.length === 0 && (
                <div className="empty">
                  No flights — try widening your filter.
                </div>
              )}

              {filtered.map((f, i) => {
                const isOpen = expandedId === f.id;

                return (
                  <div key={f.id ?? i}>
                    <div
                      className="row"
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() =>
                        setExpandedId(isOpen ? null : f.id)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setExpandedId(isOpen ? null : f.id);
                        }
                      }}
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
                        {f.altitude_ft === "ground"
                          ? "GND"
                          : `${f.altitude_ft}ft`}
                      </span>

                      <span className="distance">
                        {f.distance_nm?.toFixed(1)}nm
                      </span>
                    </div>

                    {isOpen && (
                      <div className="inspection">
                        <div className="inspection-layout">
                          {/* LEFT */}
                          <div className="inspection-grid">
                            <span className="label">Aircraft</span>
                            <span className="value">
                              {f.model || f.type_code || "—"}
                            </span>

                            <span className="label">Manufacturer</span>
                            <span className="value">
                              {f.manufacturer || "—"}
                            </span>

                            <span className="label">Owner / Operator</span>
                            <span className="value">
                              {f.airline_name || f.owner || "—"}
                            </span>

                            <span className="label">Registration</span>
                            <span className="value value-inline">
                              {f.reg || "—"}
                              {f.country_iso && (
                                <img
                                  src={flagUrl(f.country_iso)}
                                  alt={f.country}
                                  className="flag"
                                  loading="lazy"
                                />
                              )}
                            </span>

                            <span className="spacer" />

                            <span className="label">Origin</span>
                            <span className="value">
                              {f.origin_iata
                                ? `${f.origin_iata} — ${f.origin_name || ""}`
                                : "—"}
                            </span>

                            <span className="label">Destination</span>
                            <span className="value">
                              {f.dest_iata
                                ? `${f.dest_iata} — ${f.dest_name || ""}`
                                : "—"}
                            </span>

                            <span className="spacer" />

                            <span className="label">First Seen</span>
                            <span className="value">{f.first_seen}</span>

                            <span className="label">Last Seen</span>
                            <span className="value">{f.last_seen}</span>

                            <span className="label">Times Seen</span>
                            <span className="value">
                              {f.times_seen}
                              <span className="seen-indicator">
                                {seenIndicator(f.times_seen)}
                              </span>
                            </span>
                          </div>

                          {/* RIGHT */}
                          <div className="photo-column">
                            {!photoCache[f.reg] && (
                              <button
                                className="load-photo"
                                onClick={() =>
                                  loadPhotoForReg(f.reg)
                                }
                              >
                                Load aircraft photo
                              </button>
                            )}

                            {photoCache[f.reg]?.thumbnail_large && (
                              <div className="photo-wrapper">
                                <img
                                  src={
                                    photoCache[f.reg]
                                      .thumbnail_large.src
                                  }
                                  alt={`Aircraft ${f.reg}`}
                                />
                                <a
                                  href={photoCache[f.reg].link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="photo-credit"
                                >
                                  Photo via Planespotters
                                </a>
                              </div>
                            )}

                            {photoCache[f.reg] === null && (
                              <div className="no-photo">
                                No reference photo available
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* STATS VIEW */}
        {view === "stats" && <Stats />}
      </div>
    </div>
  );

}
