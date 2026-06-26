import { useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

const Auth = () => {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false); // ✅ ADDED
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (loading) return; // prevent double click

    setLoading(true);
    setError("");

    try {
      const url = isSignup ? "/signup" : "/login";
      const payload = isSignup
        ? { name, email, password }
        : { email, password };

      const res = await api.post(url, payload);

      const data = res.data || {};

      const userData = {
        id: data.id || null,
        name: data.name || "",
        email: data.email || "",
        token: data.token || null,
      };

      localStorage.setItem("user", JSON.stringify(userData));

      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          (isSignup ? "Signup failed" : "Login failed")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex justify-center items-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow w-96">
        <h2 className="text-2xl font-bold mb-4">
          {isSignup ? "Sign Up" : "Login"}
        </h2>

        {error && <p className="text-red-500 mb-2">{error}</p>}

        {isSignup && (
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border p-2 w-full mb-4 rounded"
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 w-full mb-4 rounded"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border p-2 w-full mb-4 rounded"
        />

        {/* ✅ LOADER BUTTON */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className={`w-full px-4 py-2 rounded text-white ${
            loading
              ? "bg-gray-400 cursor-not-allowed"
              : isSignup
              ? "bg-green-600"
              : "bg-blue-600"
          }`}
        >
          {loading
            ? "Processing..."
            : isSignup
            ? "Sign Up"
            : "Login"}
        </button>

        <p className="mt-4 text-center text-sm">
          {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
          <span
            onClick={() => {
              setIsSignup(!isSignup);
              setError("");
            }}
            className="text-blue-500 cursor-pointer underline"
          >
            {isSignup ? "Login" : "Sign Up"}
          </span>
        </p>
      </div>
    </div>
  );
};

export default Auth;