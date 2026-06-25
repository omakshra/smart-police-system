import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const Auth = () => {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async () => {
    try {
      const url = isSignup ? "http://127.0.0.1:8000/signup" : "http://127.0.0.1:8000/login";
      const payload = isSignup ? { name, email, password } : { email, password };
      const res = await axios.post(url, payload);

      // Extract token and user info from response (backend returns top-level fields)
      const data = res.data || {};
      const token = data.token || data.access_token || null;
      const userData = {
        id: data.id || null,
        name: data.name || data.user?.name || "",
        email: data.email || data.user?.email || "",
        token,
      };

      // Save token and user info in localStorage
      localStorage.setItem("user", JSON.stringify(userData));

      navigate("/"); // redirect to dashboard
    } catch (err) {
      setError(
        err.response?.data?.detail || (isSignup ? "Signup failed" : "Login failed")
      );
    }
  };

  return (
    <div className="h-screen flex justify-center items-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow w-96">
        <h2 className="text-2xl font-bold mb-4">{isSignup ? "Sign Up" : "Login"}</h2>
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
        <button
          onClick={handleSubmit}
          className={`w-full px-4 py-2 rounded ${isSignup ? "bg-green-600" : "bg-blue-600"} text-white`}
        >
          {isSignup ? "Sign Up" : "Login"}
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
