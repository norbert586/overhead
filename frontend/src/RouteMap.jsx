import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Polyline, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./RouteMap.css";

// Component to fit bounds when routes change
function FitBounds({ routes }) {
  const map = useMap();

  useEffect(() => {
    if (routes.length === 0) return;

    const bounds = [];
    routes.forEach(route => {
      bounds.push([route.origin_lat, route.origin_lon]);
      bounds.push([route.dest_lat, route.dest_lon]);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [routes, map]);

  return null;
}

export default function RouteMap({ apiBase }) {
  const [routes, setRoutes] = useState([]);
  const [timeRange, setTimeRange] = useState("all"); // "all" or "week"
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoutes = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/api/stats/routes-map?range=${timeRange}`);
        const data = await res.json();
        setRoutes(data);
      } catch (err) {
        console.error("Error fetching routes:", err);
        setRoutes([]);
      }
      setLoading(false);
    };

    fetchRoutes();
  }, [apiBase, timeRange]);

  // Determine line color based on classification
  const getRouteColor = (classifications) => {
    if (!classifications) return "#9aa4b2"; // muted gray

    const cls = classifications.toLowerCase();
    if (cls.includes("government")) return "rgba(220, 80, 80, 0.8)";
    if (cls.includes("cargo")) return "rgba(139, 92, 246, 0.8)";
    if (cls.includes("commercial")) return "rgba(100, 140, 255, 0.8)";
    if (cls.includes("private")) return "rgba(234, 179, 8, 0.8)";
    return "#9aa4b2";
  };

  // Calculate line thickness based on flight count (logarithmic scale)
  const getRouteWeight = (count) => {
    return Math.min(Math.log(count + 1) * 2, 8);
  };

  return (
    <div className="route-map-container">
      <div className="route-map-header">
        <h3>FLIGHT ROUTES</h3>
        <div className="route-map-toggle">
          <button
            className={timeRange === "all" ? "active" : ""}
            onClick={() => setTimeRange("all")}
          >
            ALL TIME
          </button>
          <button
            className={timeRange === "week" ? "active" : ""}
            onClick={() => setTimeRange("week")}
          >
            THIS WEEK
          </button>
        </div>
      </div>

      {loading && <div className="route-map-loading">Loading routes...</div>}

      {!loading && routes.length === 0 && (
        <div className="route-map-empty">
          No route data available. Routes require both origin and destination airports.
        </div>
      )}

      {!loading && routes.length > 0 && (
        <MapContainer
          center={[39.8283, -98.5795]} // Center of US
          zoom={4}
          style={{ height: "500px", width: "100%" }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />

          <FitBounds routes={routes} />

          {routes.map((route, idx) => {
            const positions = [
              [route.origin_lat, route.origin_lon],
              [route.dest_lat, route.dest_lon]
            ];

            return (
              <Polyline
                key={`${route.origin_iata}-${route.dest_iata}-${idx}`}
                positions={positions}
                color={getRouteColor(route.classifications)}
                weight={getRouteWeight(route.flight_count)}
                opacity={0.7}
              >
                <Popup>
                  <div className="route-popup">
                    <div className="route-popup-title">
                      <strong>{route.origin_iata}</strong> → <strong>{route.dest_iata}</strong>
                    </div>
                    <div className="route-popup-details">
                      <div>{route.origin_city}, {route.origin_country}</div>
                      <div>to</div>
                      <div>{route.dest_city}, {route.dest_country}</div>
                    </div>
                    <div className="route-popup-count">
                      {route.flight_count} flights
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}
        </MapContainer>
      )}

      <div className="route-map-legend">
        <div className="legend-item">
          <div className="legend-line" style={{ backgroundColor: "rgba(100, 140, 255, 0.8)" }}></div>
          <span>Commercial</span>
        </div>
        <div className="legend-item">
          <div className="legend-line" style={{ backgroundColor: "rgba(234, 179, 8, 0.8)" }}></div>
          <span>Private</span>
        </div>
        <div className="legend-item">
          <div className="legend-line" style={{ backgroundColor: "rgba(220, 80, 80, 0.8)" }}></div>
          <span>Government</span>
        </div>
        <div className="legend-item">
          <div className="legend-line" style={{ backgroundColor: "rgba(139, 92, 246, 0.8)" }}></div>
          <span>Cargo</span>
        </div>
      </div>
    </div>
  );
}
