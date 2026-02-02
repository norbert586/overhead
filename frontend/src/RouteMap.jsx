import { useEffect, useState, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./RouteMap.css";

export default function RouteMap({ apiBase }) {
  const [routes, setRoutes] = useState([]);
  const [timeRange, setTimeRange] = useState("all"); // "all" or "week"
  const [loading, setLoading] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  useEffect(() => {
    if (!mapVisible) return; // Don't fetch until user expands map

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
  }, [apiBase, timeRange, mapVisible]);

  // Initialize map
  useEffect(() => {
    if (!mapVisible || !mapRef.current || mapInstanceRef.current) return;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [39.8283, -98.5795], // Center of US
        zoom: 4,
        zoomControl: true
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      mapInstanceRef.current = map;
      layerGroupRef.current = L.layerGroup().addTo(map);
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, [mapVisible]);

  // Update routes on map
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    // Clear existing routes
    layerGroupRef.current.clearLayers();

    if (routes.length === 0) return;

    const bounds = [];

    routes.forEach(route => {
      const positions = [
        [route.origin_lat, route.origin_lon],
        [route.dest_lat, route.dest_lon]
      ];

      bounds.push(...positions);

      // Determine line color based on classification
      const getRouteColor = (classifications) => {
        if (!classifications) return "#9aa4b2";
        const cls = classifications.toLowerCase();
        if (cls.includes("government")) return "rgba(220, 80, 80, 0.8)";
        if (cls.includes("cargo")) return "rgba(139, 92, 246, 0.8)";
        if (cls.includes("commercial")) return "rgba(100, 140, 255, 0.8)";
        if (cls.includes("private")) return "rgba(234, 179, 8, 0.8)";
        return "#9aa4b2";
      };

      // Calculate line thickness based on flight count
      const getRouteWeight = (count) => {
        return Math.min(Math.log(count + 1) * 2, 8);
      };

      const polyline = L.polyline(positions, {
        color: getRouteColor(route.classifications),
        weight: getRouteWeight(route.flight_count),
        opacity: 0.7
      });

      const popupContent = `
        <div class="route-popup">
          <div class="route-popup-title">
            <strong>${route.origin_iata}</strong> → <strong>${route.dest_iata}</strong>
          </div>
          <div class="route-popup-details">
            <div>${route.origin_city}, ${route.origin_country}</div>
            <div>to</div>
            <div>${route.dest_city}, ${route.dest_country}</div>
          </div>
          <div class="route-popup-count">
            ${route.flight_count} flights
          </div>
        </div>
      `;

      polyline.bindPopup(popupContent);
      layerGroupRef.current.addLayer(polyline);
    });

    // Fit map to bounds
    if (bounds.length > 0) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [routes]);

  return (
    <div className="route-map-container">
      <div className="route-map-header">
        <h3>FLIGHT ROUTES</h3>
        <button
          className="route-map-show-btn"
          onClick={() => setMapVisible(!mapVisible)}
        >
          {mapVisible ? "▼ HIDE MAP" : "▶ SHOW MAP"}
        </button>
      </div>

      {mapVisible && (
        <>
          <div className="route-map-controls">
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

          <div
            ref={mapRef}
            style={{
              height: routes.length > 0 ? "500px" : "0px",
              width: "100%",
              display: routes.length > 0 ? "block" : "none"
            }}
          />

          {routes.length > 0 && (
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
          )}
        </>
      )}
    </div>
  );
}
