import { useEffect, useState, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./RouteMap.css";

export default function RouteMap({ apiBase }) {
  const [routes, setRoutes] = useState([]);
  const [timeRange, setTimeRange] = useState("all");
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

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

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [39.8283, -98.5795],
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

    // Ensure tiles render correctly after mount
    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update routes on map
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    layerGroupRef.current.clearLayers();

    if (routes.length === 0) return;

    const bounds = [];

    routes.forEach(route => {
      const positions = [
        [route.origin_lat, route.origin_lon],
        [route.dest_lat, route.dest_lon]
      ];

      bounds.push(...positions);

      const getRouteColor = (classifications) => {
        if (!classifications) return "#9aa4b2";
        const cls = classifications.toLowerCase();
        if (cls.includes("government")) return "rgba(220, 80, 80, 0.85)";
        if (cls.includes("cargo")) return "rgba(139, 92, 246, 0.85)";
        if (cls.includes("commercial")) return "rgba(100, 140, 255, 0.85)";
        if (cls.includes("private")) return "rgba(234, 179, 8, 0.85)";
        return "#9aa4b2";
      };

      const getRouteWeight = (count) => {
        return Math.min(1 + Math.log(count + 1) * 0.5, 3);
      };

      const color = getRouteColor(route.classifications);

      // Subtle glow layer underneath
      const glowLine = L.polyline(positions, {
        color: color,
        weight: getRouteWeight(route.flight_count) + 3,
        opacity: 0.1,
        interactive: false
      });
      layerGroupRef.current.addLayer(glowLine);

      // Main route line
      const polyline = L.polyline(positions, {
        color: color,
        weight: getRouteWeight(route.flight_count),
        opacity: 0.75,
        dashArray: '6 3'
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

    if (bounds.length > 0) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [routes]);

  return (
    <div className="route-map-container">
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
        className="route-map-canvas"
        style={{ display: loading && routes.length === 0 ? 'none' : 'block' }}
      />

      {routes.length > 0 && (
        <div className="route-map-legend">
          <div className="legend-item">
            <div className="legend-line" style={{ backgroundColor: "rgba(100, 140, 255, 0.85)" }}></div>
            <span>Commercial</span>
          </div>
          <div className="legend-item">
            <div className="legend-line" style={{ backgroundColor: "rgba(234, 179, 8, 0.85)" }}></div>
            <span>Private</span>
          </div>
          <div className="legend-item">
            <div className="legend-line" style={{ backgroundColor: "rgba(220, 80, 80, 0.85)" }}></div>
            <span>Government</span>
          </div>
          <div className="legend-item">
            <div className="legend-line" style={{ backgroundColor: "rgba(139, 92, 246, 0.85)" }}></div>
            <span>Cargo</span>
          </div>
        </div>
      )}
    </div>
  );
}
