// src/context/authContextTypes.ts
import { createContext, useContext } from "react";
import type { User } from "firebase/auth";

// Define the type for the Context value
export interface AuthContextType {
  user: User | null;
  role: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// Create the context instance here
// We assert the type here, as it will be initialized in the Provider component
export const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType
);

// Define and export the hook separately
export const useAuth = () => useContext(AuthContext);
