// src/utils/data.ts

import { db } from "../firebaseConfig";
import {
  collectionGroup,
  query,
  getDocs,
  where,
  updateDoc,
  doc,
  Timestamp,
} from "firebase/firestore";

// Define the TypeScript Interface for a Portability Request
export interface PortabilityRequest {
  id: string;
  refPath: string; // The full Firestore document path (crucial for updating)
  firebaseUid: string;
  fullNumber: string;
  sourceProvider: "AIRTEL" | "AFRICELL" | "ORANGE" | "VODACOM";
  targetProvider: "AIRTEL" | "AFRICELL" | "ORANGE" | "VODACOM";
  status: "PENDING" | "Validated" | "Rejected";
  submittedAt: string; // We convert the Timestamp to a string for display
  // The original timestamp field from Firestore
  submittedAtRaw: Timestamp;
}

// Maps the admin role to the targetProvider field value
const getTargetProviderFromRole = (
  role: string
): PortabilityRequest["targetProvider"] | null => {
  switch (role) {
    case "AIRTEL_ADMIN":
      return "AIRTEL";
    case "ORANGE_ADMIN":
      return "ORANGE";
    case "AFRICELL_ADMIN":
      return "AFRICELL";
    case "VODACOM_ADMIN":
      return "VODACOM";
    default:
      return null;
  }
};

/**
 * Fetches all portability requests (for Super Admin).
 */
export const fetchAllRequests = async (): Promise<PortabilityRequest[]> => {
  const q = query(collectionGroup(db, "portability_requests"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      refPath: doc.ref.path,
      ...data,
      // Asserting the Timestamp type before calling toDate()
      submittedAtRaw: data.submittedAt as Timestamp,
      submittedAt: (data.submittedAt as Timestamp).toDate().toLocaleString(),
    } as PortabilityRequest; // Final type assertion
  });
};

/**
 * Fetches requests filtered by targetProvider (for Provider Admins).
 */
export const fetchProviderRequests = async (
  adminRole: string
): Promise<PortabilityRequest[]> => {
  const targetProvider = getTargetProviderFromRole(adminRole);
  if (!targetProvider) {
    throw new Error("Invalid admin role or target provider not found.");
  }

  const q = query(
    collectionGroup(db, "portability_requests"),
    where("targetProvider", "==", targetProvider),
    where("status", "==", "PENDING")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      refPath: doc.ref.path,
      ...data,
      submittedAtRaw: data.submittedAt as Timestamp,
      submittedAt: (data.submittedAt as Timestamp).toDate().toLocaleString(),
    } as PortabilityRequest;
  });
};

/**
 * Updates the status of a portability request.
 */
export const updateRequestStatus = async (
  refPath: string,
  newStatus: PortabilityRequest["status"]
): Promise<void> => {
  if (!["Validated", "Rejected"].includes(newStatus)) {
    throw new Error(
      "Only 'Validated' or 'Rejected' status updates are allowed."
    );
  }

  const docRef = doc(db, refPath);

  await updateDoc(docRef, {
    status: newStatus,
  });
};
