import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { auth } from "../firebaseConfig";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err: unknown) {
      let errorMessage = "Login failed. Please check your credentials.";

      if (typeof err === "object" && err !== null && "code" in err) {
        const authError = err as { code: string }; // Simplified type assertion

        if (
          authError.code === "auth/user-not-found" ||
          authError.code === "auth/invalid-credential"
        ) {
          errorMessage = "Invalid credentials or user not found.";
        } else if (authError.code === "auth/wrong-password") {
          errorMessage = "Invalid password.";
        } else if (authError.code === "auth/invalid-email") {
          errorMessage = "The email address is not valid.";
        }
      } else {
        console.error("An unexpected error occurred:", err);
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    // Outer container (full screen height, centering)
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      {/* Paper/Card container */}
      <div className="w-full max-w-md p-8 space-y-6 bg-white shadow-xl rounded-xl border border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900 text-center">
          **Admin Panel Access**
        </h1>

        <form onSubmit={handleLogin} className="space-y-6">
          {/* Email Input */}
          <div className="relative">
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="Admin Email *"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Password Input */}
          <div className="relative">
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="Password *"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition duration-150"
          >
            {loading ? "Logging In..." : "SIGN IN"}
          </button>

          {/* Error Message */}
          {error && <p className="text-red-600 text-sm text-center">{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
