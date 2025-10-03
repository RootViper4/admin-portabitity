// src/components/ProtectedRoute.tsx

import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/authContextTypes";

// Define the type for the component's props
interface ProtectedRouteProps {
  allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles = [],
}) => {
  const { user, role, signOut } = useAuth();

  // --- 1. Loading State ---
  if (role === null && user === null) {
    return <div>Loading access...</div>;
  }

  // --- 2. Not Logged In ---
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // --- 3. Logged In, but Checking Role Status ---

  // Type Guard: Since 'user' is guaranteed to be present here,
  // we check if the role is still null (i.e., not found in Firestore).
  if (role === null) {
    console.error("User logged in but has no admin role. Logging out.");
    // This action ensures client users are immediately sent out.
    signOut();
    return <Navigate to="/login" replace />;
  }

  // --- 4. Authorization Check (Role is guaranteed to be a string here) ---

  // We use the 'role' variable which is now guaranteed by the compiler to be a string
  // because the 'role === null' block above would have exited the function.
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    // Logged in with a role, but not authorized for THIS specific path.
    return <Navigate to="/" replace />;
  }

  // --- 5. Authorized ---
  return <Outlet />;
};

export default ProtectedRoute;
