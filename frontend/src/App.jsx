import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
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
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Search drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [datetimeSearch, setDatetimeSearch] = useState("");
  const [datetimeResults, setDatetimeResults] = useState(null); // null | [] | [flights...]

  // Track when each flight was first seen by the frontend (for fresh indicator)
  const firstSeenRef = useRef({});

  /* -----------------------------
     Fetch flight list
  ------------------------------ */
  useEffect(() => {
    const fetchFlights = () => {
      fetch(`${API_BASE}/api/flights?limit=150`)
        .then((res) => res.json())
        .then((data) => {
          const now = Date.now();
          // Record first-seen time for new flights
          data.forEach((f) => {
            if (f.id && !firstSeenRef.current[f.id]) {
              firstSeenRef.current[f.id] = now;
            }
          });
          // Clean up old entries (flights no longer in list)
          const activeIds = new Set(data.map((f) => f.id));
          Object.keys(firstSeenRef.current).forEach((id) => {
            if (!activeIds.has(Number(id))) {
              delete firstSeenRef.current[id];
            }
          });
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
     Update timer every second
  ------------------------------ */
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  /* -----------------------------
     Keyboard shortcuts
  ------------------------------ */
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Esc to collapse all
      if (e.key === "Escape") {
        setExpandedId(null);
      }

      // / to focus search (prevent default to avoid typing "/")
      if (e.key === "/" && e.target.tagName !== "INPUT") {
        e.preventDefault();
        document.querySelector(".search")?.focus();
      }

      // Arrow keys for navigation (when not in input)
      if (e.target.tagName !== "INPUT" && ["ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        const rows = Array.from(document.querySelectorAll(".row"));
        const currentIndex = rows.findIndex(r => r === document.activeElement);

        if (e.key === "ArrowDown" && currentIndex < rows.length - 1) {
          rows[currentIndex + 1]?.focus();
        } else if (e.key === "ArrowUp" && currentIndex > 0) {
          rows[currentIndex - 1]?.focus();
        } else if (currentIndex === -1 && e.key === "ArrowDown") {
          rows[0]?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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

  const isLocalAirport = (iata) => {
    const localAirports = ["DTW", "DET", "YIP", "PTK", "ARB"];
    return iata && localAirports.includes(iata.toUpperCase());
  };

  /* -----------------------------
     Datetime Search
  ------------------------------ */
  const handleDatetimeSearch = async () => {
    if (!datetimeSearch) {
      setDatetimeResults(null);
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/api/flights/search-by-time?datetime=${encodeURIComponent(datetimeSearch)}`
      );
      const data = await res.json();
      setDatetimeResults(data);
    } catch (err) {
      console.error("Datetime search failed:", err);
      setDatetimeResults([]);
    }
  };

  const clearDatetimeSearch = () => {
    setDatetimeSearch("");
    setDatetimeResults(null);
  };

  /* -----------------------------
     Filtering
  ------------------------------ */
  const filtered = useMemo(() => {
    // If datetime search is active, use those results
    if (datetimeResults !== null) {
      return datetimeResults;
    }

    // Otherwise use text search
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
  }, [flights, query, datetimeResults]);

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
  const secondsSinceSweep = Math.max(0, Math.floor((currentTime - lastFetchMs) / 1000));

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
          <span className="main-title">
            FLIGHT INTELLIGENCE
          </span>

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
              <div className="legend">
              <span className="legend-icon">ⓘ</span>
              <div className="legend-tooltip">
                <div><span className="dot commercial" /> Commercial</div>
                <div><span className="dot private" /> Private</div>
                <div><span className="dot government" /> Government</div>
                <div><span className="dot cargo" /> Cargo</div>
                <div><span className="dot unknown" /> Unknown</div>
              </div>
            </div>
          </nav>
        </header>

        {/* LIVE VIEW */}
        {view === "live" && (
          <>
            {/* Search Drawer */}
            <div className="search-drawer">
              <button
                className="drawer-toggle"
                onClick={() => setDrawerOpen(!drawerOpen)}
              >
                {drawerOpen ? "▼" : "▶"} SEARCH & FILTERS
              </button>

              {drawerOpen && (
                <div className="drawer-content">
                  {/* Text Search */}
                  <div className="search-group">
                    <label>Filter by text</label>
                    <input
                      className="search"
                      placeholder="Callsign, reg, type, origin, dest..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>

                  {/* Datetime Search */}
                  <div className="search-group">
                    <label>Search by datetime</label>
                    <div className="datetime-search-row">
                      <input
                        type="datetime-local"
                        className="datetime-input"
                        value={datetimeSearch}
                        onChange={(e) => setDatetimeSearch(e.target.value)}
                      />
                      <button
                        className="search-button"
                        onClick={handleDatetimeSearch}
                      >
                        Search
                      </button>
                      {datetimeResults !== null && (
                        <button
                          className="clear-button"
                          onClick={clearDatetimeSearch}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {datetimeResults !== null && datetimeResults.length === 0 && (
                      <div className="search-message">No flights found near that time</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="list">
              {filtered.length === 0 && (
                <div className="empty">No flights found.</div>
              )}

              {filtered.map((f, i) => {
                const isOpen = expandedId === "ALL" || expandedId === f.id;

                // row age fade (based on backend last_seen)
                const ageSec =
                  (Date.now() - new Date(f.last_seen).getTime()) / 1000;

                // fresh indicator based on when frontend first saw this flight
                const firstSeenMs = firstSeenRef.current[f.id] || Date.now();
                const isFresh = (Date.now() - firstSeenMs) < 8000;

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

                      <span className={`callsign ${f.classification ? `class-${f.classification}` : ""}`}>
                        {f.callsign || f.reg || "UNKNOWN"}
                      </span>

                      <span className="type">
                        {f.type_code || f.model || "—"}
                      </span>

                      <span className={`route ${isLocalAirport(f.origin_iata) || isLocalAirport(f.dest_iata) ? "local" : ""}`}>
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

                            <span className="label">Classification</span>
                            <span className="value subtle">
                              {(f.classification || "unknown").toUpperCase()}
                            </span>

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
                  <span className="status-label">LAST SWEEP</span>
                  <span className="status-value">{secondsSinceSweep}s ago</span>
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
