// src/components/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem("user"); // Check if user is logged in
  if (!user) {
    return <Navigate to="/login" replace />; // Redirect to login if not
  }
  return children; // Render the page if logged in
};

export default ProtectedRoute;
