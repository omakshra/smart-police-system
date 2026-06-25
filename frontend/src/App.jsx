// src/App.jsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Hotspot from "./pages/Hotspot";
import Trends from "./pages/Trends";
import Heatmap from "./pages/Heatmap";
import Login from "./pages/Login"; // Combined login/signup
import MainLayout from "./layout/MainLayout";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Router>
      <Routes>
        {/* Login/Signup page */}
        <Route path="/login" element={<Login />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Dashboard />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/hotspot"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Hotspot />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trends"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Trends />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/heatmap"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Heatmap />
              </MainLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
