// src/pages/AdminDashboard.tsx

import React, { useState, useEffect, useCallback } from "react";

// --- Imports from data.ts ---
import { fetchAllRequests, fetchProviderRequests } from "../utils/data";
import type { PortabilityRequest } from "../utils/data";

// --- FIX: Import useAuth from the new types file ---
import { useAuth } from "../context/authContextTypes";

import RequestsTable from "../components/RequestsTable";
import {
  Container,
  CircularProgress,
  Typography,
  Box,
  Button,
} from "@mui/material";

// Define the initial state for the requests array using the PortabilityRequest interface
const INITIAL_REQUESTS: PortabilityRequest[] = [];

function AdminDashboard() {
  const { role, signOut } = useAuth(); // role is string | null

  // Explicitly set the state type to PortabilityRequest[]
  const [requests, setRequests] =
    useState<PortabilityRequest[]>(INITIAL_REQUESTS);

  const [loading, setLoading] = useState<boolean>(true);

  // Explicitly set the state type for error to string | null
  const [error, setError] = useState<string | null>(null);

  // --- Role Determination ---
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isAdmin = role !== null && role.endsWith("_ADMIN");

  const providerName = isSuperAdmin
    ? "All Providers"
    : role
    ? role.replace("_ADMIN", "")
    : "Unauthorized";

  const fetchData = useCallback(async () => {
    if (!role) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let data: PortabilityRequest[] = [];

      if (isSuperAdmin) {
        data = await fetchAllRequests();
      } else if (isAdmin) {
        data = await fetchProviderRequests(role as string);
      }

      setRequests(data);
    } catch (err) {
      let errorMessage = "Failed to fetch requests.";
      if (err instanceof Error) {
        errorMessage = `Failed to fetch requests: ${err.message}`;
      }
      setError(errorMessage);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [role, isSuperAdmin, isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!role) {
    return (
      <Box display="flex" justifyContent="center" mt={5}>
        <Typography>Checking access...</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" mt={5}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        my={4}
      >
        <Typography variant="h4">
          {providerName} Portability Dashboard
        </Typography>
        <Button onClick={signOut} variant="outlined" color="error">
          Sign Out
        </Button>
      </Box>

      {error && <Typography color="error">{error}</Typography>}

      <RequestsTable
        title={`Pending Requests for ${providerName}`}
        requests={requests.filter((r) => r.status === "PENDING")}
        onUpdate={fetchData}
      />

      {isSuperAdmin && (
        <RequestsTable
          title="Completed Requests (Validated/Rejected)"
          requests={requests.filter((r) => r.status !== "PENDING")}
          onUpdate={fetchData}
        />
      )}
    </Container>
  );
}

export default AdminDashboard;
