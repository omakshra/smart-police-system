import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet.heat";
import axios from "axios";

import districtCoords from "../data/districtsCoords.json"; // All districts with lat/lng

// Heatmap Layer component
const HeatmapLayer = ({ points }) => {
  const map = useMap();
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (!points || points.length === 0 || !map) return;

    const validPoints = points
  .filter(
    p =>
      typeof p.lat === "number" &&
      typeof p.lng === "number" &&
      !isNaN(p.lat) &&
      !isNaN(p.lng) &&
      p.lat !== 0 &&
      p.lng !== 0
  )
  .map(p => [
    Number(p.lat),
    Number(p.lng),
    Number(p.total_predicted_crimes || 1),
  ]);

if (validPoints.length === 0) {
  console.log("No valid heatmap points");
  return;
}

    if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);

    heatLayerRef.current = L.heatLayer(validPoints, {
      radius: 25,
      blur: 15,
      maxZoom: 10,
    }).addTo(map);
  }, [points, map]);

  return null;
};

const Heatmap = () => {
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchHotspots = async () => {
      setError("");
      setLoading(true);

      try {
        // Prepare batch payload for all districts
        const records = Object.keys(districtCoords).map(district => ({
          state: districtCoords[district].state,
          district,
          year: new Date().getFullYear(),
        }));

        // Send batch request
        const res = await axios.post(
          "http://127.0.0.1:8000/predict_crimes_combined",
          { records }
        );

        if (res.data.predictions) {
          // Map districts to their lat/lng
          const mapped = res.data.predictions.map(p => {
            const coords = districtCoords[p.district];
            return {
              ...p,
              lat: coords?.lat || 0,
              lng: coords?.lng || 0,
            };
          });

          // Progressive rendering: add 20 districts at a time
          const batchSize = 20;
          for (let i = 0; i < mapped.length; i += batchSize) {
            setHotspots(prev => [...prev, ...mapped.slice(i, i + batchSize)]);
            await new Promise(r => setTimeout(r, 50)); // tiny delay for smoother loading
          }
        }
      } catch (err) {
        console.error(err);
        setError("Failed to fetch predicted hotspots");
      }

      setLoading(false);
    };

    fetchHotspots();
  }, []);

  return (
    <div className="bg-white shadow rounded p-4 h-[80vh]">
      <h3 className="mb-2 font-semibold text-gray-700">
        India Crime Hotspots Map
      </h3>

      {loading && <p>Loading hotspots...</p>}
      {error && <p className="text-red-600">{error}</p>}

      <MapContainer
        center={[22.5937, 78.9629]}
        zoom={5}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {hotspots.length > 0 && <HeatmapLayer points={hotspots} />}
      </MapContainer>
    </div>
  );
};

export default Heatmap;
