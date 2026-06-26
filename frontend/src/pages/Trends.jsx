import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const Trends = () => {
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [trends, setTrends] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch states
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/states`)
      .then((res) => setStates(res.data.states))
      .catch(() => setError("Failed to fetch states"));
  }, []);

  // Fetch districts
  useEffect(() => {
    if (!selectedState) return;
    axios
      .get(`${API_BASE_URL}/districts/${encodeURIComponent(selectedState)}`)
      .then((res) => setDistricts(res.data.districts))
      .catch(() => setError("Failed to fetch districts"));
  }, [selectedState]);

  // Fetch trends (batch endpoint, query params)
  // Fetch trends
const fetchTrends = async () => {
  if (!selectedState || !selectedDistrict) {
    setError("Please select both state and district");
    return;
  }

  setError("");
  setLoading(true);

  try {
    // Encode state & district for URL (handles spaces, &, etc.)
    const encodedState = encodeURIComponent(selectedState);
    const encodedDistrict = encodeURIComponent(selectedDistrict);

    // Call backend
    const res = await axios.get(
      `${API_BASE_URL}/hotspot_trends_batch/${encodedState}/${encodedDistrict}`
    );

    // Check if trends exist
    if (res.data && res.data.trends) {
      setTrends(res.data.trends);
    } else {
      setTrends([]);
      setError("No trends data available for selected state/district");
    }

  } catch (err) {
    console.error("Axios Error:", err);
    if (err.response) {
      // Backend returned an error
      setError(`Failed to fetch trends: ${err.response.status} ${err.response.statusText}`);
    } else if (err.request) {
      // Request made but no response
      setError("Failed to fetch trends: No response from backend");
    } else {
      // Other errors
      setError(`Failed to fetch trends: ${err.message}`);
    }
    setTrends([]);
  } finally {
    setLoading(false);
  }
};

  // Chart data
  const chartData = {
    labels: trends.map((t) => t.year),
    datasets: [
      {
        label: "Total Crimes",
        data: trends.map((t) => t.total_crimes),
        borderColor: "rgba(255,0,0,0.8)",
        backgroundColor: "rgba(255,0,0,0.2)",
        tension: 0.3,
      },
      {
        label: "Hotspot Probability",
        data: trends.map((t) => t.hotspot_probability),
        borderColor: "rgba(0,0,255,0.8)",
        backgroundColor: "rgba(0,0,255,0.2)",
        tension: 0.3,
        yAxisID: "y1",
      },
    ],
  };

  // Chart options
  const chartOptions = {
    responsive: true,
    interaction: { mode: "index", intersect: false },
    stacked: false,
    plugins: {
      tooltip: {
        callbacks: {
          afterBody: function (context) {
            const idx = context[0].dataIndex;
            const t = trends[idx] || {};
            const topCrimes = Object.entries(t)
              .filter(
                ([k]) =>
                  k !== "year" &&
                  k !== "total_crimes" &&
                  k !== "hotspot_probability"
              )
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5); // top 5 crimes
            return topCrimes.map(([crime, count]) => `${crime}: ${count}`);
          },
        },
      },
      title: {
        display: true,
        text: `Crime Trends for ${selectedDistrict}, ${selectedState}`,
      },
    },
    scales: {
      y: {
        type: "linear",
        display: true,
        position: "left",
        title: { display: true, text: "Total Crimes" },
      },
      y1: {
        type: "linear",
        display: true,
        position: "right",
        grid: { drawOnChartArea: false },
        title: { display: true, text: "Hotspot Probability" },
        min: 0,
        max: 1,
      },
    },
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Crime Trends</h1>

      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
        <div>
          <label className="mr-2">State: </label>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="border p-1 rounded"
          >
            <option value="">Select State</option>
            {states.map((s, i) => (
              <option key={i} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mr-2">District: </label>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="border p-1 rounded"
          >
            <option value="">Select District</option>
            {districts.map((d, i) => (
              <option key={i} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={fetchTrends}
          className="ml-2 bg-blue-600 text-white px-4 py-1 rounded mt-2 md:mt-0"
        >
          Show Trends
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {loading && <p className="text-blue-600 font-semibold">Loading trends... ⏳</p>}

      {!loading && trends.length > 0 && (
        <div className="mt-4">
          <Line data={chartData} options={chartOptions} />
        </div>
      )}
    </div>
  );
};

export default Trends;
