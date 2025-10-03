// src/context/AuthContext.tsx

import React, { useState, useEffect, useCallback } from "react"; // ADD useCallback
import type { ReactNode } from "react";
import { AuthContext } from "./authContextTypes";
import type { AuthContextType } from "./authContextTypes";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

// Define the props for the Provider component
interface AuthProviderProps {
  children: ReactNode;
}

// Export the component as the primary export
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthContextType["user"]>(null);
  const [role, setRole] = useState<AuthContextType["role"]>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Use useCallback to memoize the function, though not strictly required here
  const fetchUserRole = useCallback(
    async (uid: string): Promise<string | null> => {
      try {
        const docRef = doc(db, "admin_roles", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const roleData = docSnap.data().role;
          return typeof roleData === "string" ? roleData : null;
        }
        // Log if the document is NOT found
        console.warn(
          `Firestore: Admin role document not found for UID: ${uid}`
        );
        return null;
      } catch (e) {
        console.error("Error fetching user role:", e);
        return null;
      }
    },
    []
  ); // Empty dependency array means this function definition is stable

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Only fetch the role if a user is present
        const userRole = await fetchUserRole(currentUser.uid);
        setRole(userRole);
        // FINAL DEBUGGING LINE: This will show what the ProtectedRoute sees
        console.log(
          `[AUTH] Final Check: User logged in. Role found: ${userRole}`
        );
      } else {
        setUser(null);
        setRole(null);
        console.log("[AUTH] User logged out.");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserRole]); // Dependency added for stability

  const signOut = () => firebaseSignOut(auth);

  const value: AuthContextType = { user, role, loading, signOut };

  if (loading) return <div>Loading Admin Panel...</div>;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
