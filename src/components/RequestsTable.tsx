// src/components/RequestsTable.tsx

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Typography,
} from "@mui/material";

// --- FIX 1: Use regular import for the runtime function ---
import { updateRequestStatus } from "../utils/data";

// --- FIX 1: Use 'import type' for the PortabilityRequest interface ---
import type { PortabilityRequest } from "../utils/data";

// Define the props type
interface RequestsTableProps {
  title: string;
  requests: PortabilityRequest[];
  // onUpdate is a function that takes no arguments and returns nothing (void)
  onUpdate: () => void;
}

// Use React.FC and the defined props type
const RequestsTable: React.FC<RequestsTableProps> = ({
  title,
  requests,
  onUpdate,
}) => {
  // Define the type for the request object and the new status
  const handleUpdate = async (
    request: PortabilityRequest,
    newStatus: PortabilityRequest["status"]
  ) => {
    try {
      await updateRequestStatus(request.refPath, newStatus);
      alert(`Request ${request.id} updated to ${newStatus}`);
      // Refresh data in the parent component
      onUpdate();

      // --- FIX 2: Safely handle the error without using 'any' ---
    } catch (error: unknown) {
      // Use 'unknown' type
      let errorMessage = "An unknown error occurred during status update.";

      if (error instanceof Error) {
        errorMessage = `Error updating request: ${error.message}`;
      }

      alert(errorMessage);
      console.error("Update error:", error);
    }
  };

  return (
    <Paper style={{ padding: "20px", margin: "20px auto", maxWidth: "1200px" }}>
      <Typography variant="h5" gutterBottom>
        {title}
      </Typography>

      {requests.length === 0 ? (
        <Typography color="textSecondary">
          No requests found in this view.
        </Typography>
      ) : (
        <TableContainer>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Phone Number</TableCell>
                <TableCell>Source Provider</TableCell>
                <TableCell>Target Provider</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Submitted At</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>{request.fullNumber}</TableCell>
                  <TableCell>{request.sourceProvider}</TableCell>
                  <TableCell>{request.targetProvider}</TableCell>
                  <TableCell>{request.status}</TableCell>
                  <TableCell>{request.submittedAt}</TableCell>
                  <TableCell align="right">
                    {request.status === "PENDING" ? (
                      <>
                        <Button
                          variant="contained"
                          color="success"
                          size="small"
                          onClick={() => handleUpdate(request, "Validated")}
                          style={{ marginRight: "8px" }}
                        >
                          Validate
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleUpdate(request, "Rejected")}
                        >
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Typography color="primary">{request.status}</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

export default RequestsTable;
