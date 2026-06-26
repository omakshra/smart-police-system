import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import CrimeTable from "../components/CrimeTable";
import { API_BASE_URL } from "../api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

// Helper to get ISO week number
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [crimes, setCrimes] = useState([]);
  const navigate = useNavigate();

  // ── 1. Auth effect: runs once on mount ──────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) {
      navigate("/login");
      return;
    }

    try {
      const userData = JSON.parse(raw);
      if (!userData?.token) {
        navigate("/login");
        return;
      }
      setUser(userData);
    } catch {
      navigate("/login");
    }
  }, [navigate]);

  // ── 2. Logout ────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  }, [navigate]);

  // ── 3. Fetch crimes (depends only on token + handleLogout) ──────────────────
  const fetchCrimes = useCallback(async (token) => {
    try {
      const res = await fetch(`${API_BASE_URL}/crimes`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        handleLogout();
        return;
      }

      const data = await res.json();
      if (Array.isArray(data)) setCrimes(data);
    } catch (err) {
      console.error("Fetch failed:", err);
    }
  }, [handleLogout]);

  // ── 4. Data effect: runs whenever user changes ──────────────────────────────
  useEffect(() => {
    if (user?.token) {
      fetchCrimes(user.token);
    }
  }, [user, fetchCrimes]);

  // ── 5. Derived chart data ────────────────────────────────────────────────────
  const trendData = [];
  const categoryData = {};

  crimes.forEach((c) => {
    const week = `Week ${getWeekNumber(new Date(c.date))}`;
    const cat = c.category;

    const weekObj = trendData.find((w) => w.week === week);
    if (weekObj) {
      weekObj[cat] = (weekObj[cat] || 0) + 1;
    } else {
      trendData.push({ week, [cat]: 1 });
    }

    categoryData[cat] = (categoryData[cat] || 0) + 1;
  });

  const barChartData = Object.keys(categoryData).map((key) => ({
    category: key,
    count: categoryData[key],
  }));

  const kpis = [
    { title: "Total Incidents", value: crimes.length },
    {
      title: "Top Categories",
      value: Object.keys(categoryData).join(", ") || "-",
    },
    {
      title: "Top 5 Hotspots",
      value: crimes.slice(0, 5).map((c) => c.grid_id).join(", ") || "-",
    },
  ];

  // ── 6. Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="bg-white shadow p-4 rounded flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-700">
            {user ? `👋 Welcome Officer ${user.name}` : "👋 Welcome"}
          </h2>
          <p className="text-gray-500">Smart Crime Monitoring Dashboard</p>
        </div>
        {user && (
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-3 py-1 rounded"
          >
            Logout
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <Card key={idx} title={kpi.title} value={kpi.value} />
        ))}
      </div>

      {/* Trend Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white shadow rounded p-4 h-64">
          <h3 className="mb-2 font-semibold text-gray-700">Weekly Crime Trend</h3>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip />
              <Legend />
              {Object.keys(categoryData).map((cat, idx) => (
                <Line
                  key={idx}
                  type="monotone"
                  dataKey={cat}
                  stroke={["#8884d8", "#82ca9d", "#ffc658", "#ff8042"][idx % 4]}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white shadow rounded p-4 h-64">
          <h3 className="mb-2 font-semibold text-gray-700">Category Distribution</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={barChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Crime Table */}
      {user && (
        <CrimeTable
          token={user.token}
          refreshCrimes={() => fetchCrimes(user.token)}
        />
      )}
    </div>
  );
};

export default Dashboard;