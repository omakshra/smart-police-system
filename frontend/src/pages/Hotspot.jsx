import React, { useState, useEffect } from "react";
import axios from "axios";
import "./Hotspot.css";
import CrimeChart from "../components/CrimeChart.jsx";

const Hotspot = () => {
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [prediction, setPrediction] = useState(null);
  const [chartUrl, setChartUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch states
  useEffect(() => {
    axios
      .get("http://127.0.0.1:8000/states")
      .then((res) => setStates(Array.isArray(res.data.states) ? res.data.states : []))
      .catch(() => setError("Failed to fetch states"));
  }, []);

  // Fetch districts when a state is selected
  useEffect(() => {
    if (!selectedState) return setDistricts([]);
    axios
      .get(`http://127.0.0.1:8000/districts/${selectedState}`)
      .then((res) => setDistricts(Array.isArray(res.data.districts) ? res.data.districts : []))
      .catch(() => setError("Failed to fetch districts"));
  }, [selectedState]);

  // Fetch prediction from backend
  const fetchPrediction = async () => {
    if (!selectedState || !selectedDistrict) {
      setError("Please select state and district");
      return;
    }

    setLoading(true);
    setError("");
    setPrediction(null);
    setChartUrl("");

    try {
      const res = await axios.post("http://127.0.0.1:8000/predict_crimes_combined", {
        records: [
          {
            state: selectedState,
            district: selectedDistrict,
            year: parseInt(year),
          },
        ],
      });

      const pred = res.data.predictions?.[0] || null;

      if (pred) {
        // Ensure all crime types exist, fallback to 0
        const safeCounts = {};
        const safePercentages = {};
        const total = pred.total_predicted_crimes || 0;
        
        Object.keys(pred.predicted_counts || {}).forEach((key) => {
          safeCounts[key] = pred.predicted_counts[key] || 0;
          // Calculate percentage from count and total
          safePercentages[key] = total > 0 ? ((safeCounts[key] / total) * 100).toFixed(2) : 0;
        });

        setPrediction({
          ...pred,
          predicted_counts: safeCounts,
          percentages: safePercentages,
        });
      }

      if (res.data.chart_base64) {
        setChartUrl(`data:image/png;base64,${res.data.chart_base64}`);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch prediction");
    }

    setLoading(false);
  };

  return (
    <div className="hotspot-container p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Crime Hotspot Prediction</h2>

      <div className="selectors flex flex-wrap gap-4 mb-4">
        <select
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="">Select State</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={selectedDistrict}
          onChange={(e) => setSelectedDistrict(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="">Select District</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          min="2000"
          max="2030"
          className="border p-2 rounded w-24"
        />

        <button
          onClick={fetchPrediction}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Predict
        </button>
      </div>

      {loading && <p>Loading prediction...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {prediction && (
        <div className="prediction-result mt-4">
          <h3 className="text-xl font-semibold">
            {prediction.state} - {prediction.district} ({prediction.year})
          </h3>
          <p>
            Hotspot: <strong>{prediction.hotspot ? "🔥 Yes" : "No"}</strong> | Total Crimes:{" "}
            {prediction.total_predicted_crimes}
          </p>

          <table className="table-auto border-collapse border border-gray-400 mt-2 w-full">
            <thead>
              <tr className="bg-gray-200">
                <th className="border px-2 py-1">Crime Type</th>
                <th className="border px-2 py-1">Count</th>
                <th className="border px-2 py-1">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(prediction.predicted_counts || {})
                .filter((key) => (prediction.predicted_counts[key] || 0) > 0)
                .map((key) => (
                  <tr key={key}>
                    <td className="border px-2 py-1">{key.replace(/_/g, " ")}</td>
                    <td className="border px-2 py-1">{prediction.predicted_counts[key]}</td>
                    <td className="border px-2 py-1">{prediction.percentages?.[key] || 0}%</td>
                  </tr>
                ))}
            </tbody>
          </table>

          {chartUrl && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2">Crime Distribution Chart</h4>
              <CrimeChart prediction={prediction} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Hotspot;
