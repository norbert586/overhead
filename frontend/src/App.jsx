import { useEffect, useMemo, useState } from "react";
import "./app.css";
import Stats from "./Stats";

const API_BASE = "http://192.168.86.234:8080"; // your LAN IP

export default function App() {
  const [flights, setFlights] = useState([]);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null); // null | "ALL" | flight.id
  const [photoCache, setPhotoCache] = useState({});   // reg -> photo | null
  const [view, setView] = useState("live");           // "live" | "stats"
  const [lastFetchMs, setLastFetchMs] = useState(Date.now());
  const [expandingAll, setExpandingAll] = useState(false);

  /* -----------------------------
     Fetch flight list
  ------------------------------ */
  useEffect(() => {
    const fetchFlights = () => {
      fetch(`${API_BASE}/api/flights?limit=150`)
        .then((res) => res.json())
        .then((data) => {
          setFlights(data);
          setLastFetchMs(Date.now());
        })
        .catch(console.error);
    };

    fetchFlights();
    const interval = setInterval(fetchFlights, 5000);
    return () => clearInterval(interval);
  }, []);

  /* -----------------------------
     Helpers
  ------------------------------ */
  const seenIndicator = (count) => {
    if (count >= 10) return " ✦";
    if (count >= 6) return " ••";
    if (count >= 3) return " •";
    return "";
  };

  const flagUrl = (iso) =>
    iso ? `https://flagcdn.com/w20/${iso.toLowerCase()}.png` : null;

  const isGov = (f) => {
    const blob = `${f.owner || ""} ${f.airline_name || ""} ${f.callsign || ""}`;
    return (
      /air force|navy|army|government|usaf|state|homeland/i.test(blob) ||
      /^(RCH|MC|AF|NAVY)/i.test(f.callsign || "")
    );
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
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [flights, query]);

  /* -----------------------------
     Lazy aircraft photo loader
  ------------------------------ */
  const loadPhotoForReg = async (reg) => {
    if (!reg) return;
    if (Object.prototype.hasOwnProperty.call(photoCache, reg)) return; // already fetched

    try {
      const res = await fetch(`https://api.planespotters.net/pub/photos/reg/${reg}`);
      const data = await res.json();
      const photo = data?.photos?.length ? data.photos[0] : null;

      setPhotoCache((prev) => ({ ...prev, [reg]: photo }));
    } catch {
      setPhotoCache((prev) => ({ ...prev, [reg]: null }));
    }
  };

  /* -----------------------------
     Expand / Collapse All (glyph)
  ------------------------------ */
  const toggleExpandAll = async () => {
    // collapse
    if (expandedId === "ALL") {
      setExpandedId(null);
      return;
    }

    // expand
    setExpandedId("ALL");
    setExpandingAll(true);

    // Use current filtered list at click-time (safe)
    const regs = filtered
      .map((f) => f.reg)
      .filter(Boolean);

    // sequential load with a tiny delay (prevents hammering the API)
    for (const reg of regs) {
      if (!Object.prototype.hasOwnProperty.call(photoCache, reg)) {
        await loadPhotoForReg(reg);
        await new Promise((r) => setTimeout(r, 220));
      }
    }

    setExpandingAll(false);
  };

  /* -----------------------------
     Ops Metrics (footer)
  ------------------------------ */
  const secondsSinceSweep = Math.max(0, Math.floor((Date.now() - lastFetchMs) / 1000));

  const status =
    filtered.length === 0
      ? "NO TARGETS"
      : filtered.length < 5
      ? "LOW TRAFFIC"
      : filtered.length < 15
      ? "ACTIVE"
      : "HIGH DENSITY";

  const density =
    filtered.length < 4
      ? "▢▢▢"
      : filtered.length < 9
      ? "▣▢▢"
      : filtered.length < 16
      ? "▣▣▢"
      : "▣▣▣";

  // Lightweight “most observed” (from current list). Later we can make this a true “today” backend stat.
  const mostObserved = useMemo(() => {
    if (!filtered.length) return null;
    return [...filtered].sort((a, b) => (b.times_seen || 0) - (a.times_seen || 0))[0];
  }, [filtered]);

  /* -----------------------------
     Row click behavior
  ------------------------------ */
  const onRowClick = (id) => {
    // If we're in ALL mode, clicking a row should focus that row (not collapse everything)
    if (expandedId === "ALL") {
      setExpandedId(id);
      return;
    }
    setExpandedId(expandedId === id ? null : id);
  };

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

            {/* Expand / collapse glyph */}
            <button
              className="expand-glyph"
              onClick={toggleExpandAll}
              aria-label={expandedId === "ALL" ? "Collapse all flights" : "Expand all flights"}
              title={expandedId === "ALL" ? "Collapse all flights" : "Expand all flights"}
            >
              {expandedId === "ALL" ? "−" : "+"}
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
              />
            </div>

            <div className="list">
              {filtered.length === 0 && (
                <div className="empty">No flights found.</div>
              )}

              {filtered.map((f, i) => {
                const isOpen = expandedId === "ALL" || expandedId === f.id;

                // row age fade
                const ageSec =
                  (Date.now() - new Date(f.last_seen).getTime()) / 1000;

                const isFresh = ageSec < 8;

                const opacity =
                  ageSec < 30 ? 1 :
                  ageSec < 120 ? 0.86 :
                  ageSec < 300 ? 0.68 :
                  0.48;

                return (
                  <div key={f.id ?? i}>
                    <div
                      className={`row ${isFresh ? "fresh" : ""}`}
                      tabIndex={0}
                      style={{ opacity }}
                      onClick={() => onRowClick(f.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onRowClick(f.id);
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
                        {isGov(f) && <span className="badge-gov">GOV</span>}
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
                      <div className={`inspection class-${f.classification || "unknown"}`}>
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

                            <span className="label">Operator</span>
                            <span className="value">
                              {f.airline_name || f.owner || "—"}
                            </span>

                            <span className="label">Registration</span>
                            <span className="value value-inline">
                              {f.reg || "—"}
                              {f.country_iso && (
                                <img
                                  src={flagUrl(f.country_iso)}
                                  alt={f.country || f.country_iso}
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
                            {!Object.prototype.hasOwnProperty.call(photoCache, f.reg) && (
                              <button
                                className="load-photo"
                                onClick={() => loadPhotoForReg(f.reg)}
                              >
                                Load aircraft photo
                              </button>
                            )}

                            {photoCache[f.reg]?.thumbnail_large && (
                              <div className="photo-wrapper">
                                <img
                                  src={photoCache[f.reg].thumbnail_large.src}
                                  alt={`Aircraft ${f.reg}`}
                                  loading="lazy"
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
                                No photo available
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

            {/* OPS FOOTER */}
                <div className="status-bar">
                  <span className="status-dot high" />
                  <span className="status-label">AIRSPACE</span>
                  <span className="status-value">HIGH</span>

                  <span className="status-sep" />

                  <span className="load-label">LOAD</span>
                  <span className="load-bars">
                    <span className="bar on" />
                    <span className="bar on" />
                    <span className="bar on" />
                    <span className="bar on" />
                    <span className="bar" />
                  </span>
                </div>
          </>
        )}

        {/* STATS VIEW */}
        {view === "stats" && <Stats apiBase={API_BASE} />
}
      </div>
    </div>
  );
}
