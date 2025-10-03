import React, { useState, useEffect, useMemo, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  signInWithCustomToken,
} from "firebase/auth";
import type { User as AuthUser, Auth } from "firebase/auth";
import {
  getFirestore,
  collectionGroup,
  query,
  onSnapshot,
  Timestamp,
  updateDoc,
  doc,
  Query,
  setLogLevel,
} from "firebase/firestore";
// Import types
import type {
  DocumentData,
  FirestoreDataConverter,
  Firestore,
} from "firebase/firestore";

// --- CONFIGURATION GLOBALE FIREBASE (Fournie par Canvas ou Fallback) ---
// Global variables provided by the canvas environment
declare const __app_id: string;
declare const __firebase_config: string;
declare const __initial_auth_token: string;

// NOTE: The appId fallback value was corrected to ensure the document path is valid.
const appId =
  typeof __app_id !== "undefined"
    ? __app_id
    : "1:547040634453:web:707ac2e44f60d4021556dc";
const firebaseConfig = (() => {
  try {
    if (typeof __firebase_config !== "undefined" && __firebase_config) {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {
    console.error("Erreur de parsing de __firebase_config:", e);
  }
  // Fallback config (using placeholder values)
  return {
    apiKey: "AIzaSyDGl9FT1MuumiwervsEkrqUVOgaPBNXrAI",
    authDomain: "portabilite-rdc.firebaseapp.com",
    projectId: "portabilite-rdc",
    storageBucket: "portabilite-rdc.firebasestorage.app",
    messagingSenderId: "547040634453",
    appId: "1:547040634453:web:707ac2e44f60d4021556dc",
    measurementId: "G-S084RSGTC3",
  };
})();

// Global instance declarations
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

// Initialize Firebase
try {
  const app = initializeApp(firebaseConfig);
  dbInstance = getFirestore(app);
  authInstance = getAuth(app);
  // Enable debug mode for Firestore logs
  setLogLevel("debug");
} catch (e) {
  console.error("Échec de l'initialisation de Firebase.", e);
}

// --- DATA TYPES & CONSTANTS ---

type AdminRole = "SuperAdmin" | "ProviderAdmin" | "Guest";
type OperatorId = "ORANGE" | "AIRTEL" | "VODACOM" | "AFRICELL";
type RequestStatus = "PENDING" | "Validated" | "Rejected";

const OPERATORS: OperatorId[] = ["ORANGE", "AIRTEL", "VODACOM", "AFRICELL"];

interface AdminState {
  isAuthReady: boolean;
  user: AuthUser | null;
  role: AdminRole;
  operator: OperatorId | null; // The operator this admin manages (for ProviderAdmin)
  isLoading: boolean;
}

interface PortabilityRequest {
  id: string; // Document ID
  fullNumber: string; // Full phone number (e.g., +243...)
  sourceProvider: OperatorId; // Current operator (Source)
  targetProvider: OperatorId; // Target operator (Cible)
  status: RequestStatus;
  submittedAt: Timestamp;
  email: string; // Added for display
  firstName: string; // Added for display
}

interface CategorizedRequests {
  // For ProviderAdmin: simple arrays (already filtered)
  outgoing: PortabilityRequest[];
  incoming: PortabilityRequest[];
  validatedIncoming: PortabilityRequest[];

  // NEW: For SuperAdmin: requests grouped by provider
  superAdmin: {
    [provider in OperatorId]?: {
      outgoing: PortabilityRequest[]; // PENDING where provider is source (Actionable/Monitor)
      validated: PortabilityRequest[]; // VALIDATED where provider is source (Monitor)
    };
  };
}

interface OperatorAnalytics {
  entries: number;
  exits: number;
  net: number; // entries - exits
}

type AnnualData = {
  [year: number]: {
    [operator in OperatorId]?: OperatorAnalytics;
  };
};

// --- FIRESTORE CONVERTER ---

const requestConverter: FirestoreDataConverter<PortabilityRequest> = {
  toFirestore: (request: PortabilityRequest): DocumentData => {
    const { id: _, ...data } = request;
    return data as DocumentData;
  },
  fromFirestore: (snapshot, options) => {
    const data = snapshot.data(options)!;
    return {
      id: snapshot.id,
      fullNumber: data.fullNumber,
      sourceProvider: data.sourceProvider as OperatorId,
      targetProvider: data.targetProvider as OperatorId,
      status: data.status as RequestStatus,
      submittedAt: data.submittedAt,
      // NOTE: These fields must exist on the Portability Request document
      email: data.email || "N/A",
      firstName: data.firstName || "N/A",
    } as PortabilityRequest;
  },
};

// --- UTILITY HOOKS ---

/**
 * Hook to track if the component is mounted, preventing state updates on unmounted components.
 */
const useIsMounted = () => {
  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  return isMounted;
};

// --- AUTHENTICATION & GLOBAL STATE HOOK ---

const ROLE_KEY = "adminRole";
const OPERATOR_KEY = "adminOperator";

const useAdminAuth = () => {
  const [adminState, setAdminState] = useState<AdminState>({
    isAuthReady: false,
    user: null,
    role: "Guest",
    operator: null,
    isLoading: true,
  });

  useEffect(() => {
    if (!authInstance) {
      setAdminState((s) => ({ ...s, isLoading: false }));
      return;
    }

    // --- PERSISTENCE LOAD ---
    const storedRole = localStorage.getItem(ROLE_KEY) as AdminRole | null;
    const storedOperator = localStorage.getItem(
      OPERATOR_KEY
    ) as OperatorId | null;

    // Load persisted state only if stored data exists
    if (storedRole && storedRole !== "Guest") {
      setAdminState((s) => ({
        ...s,
        role: storedRole,
        operator: storedOperator,
      }));
    }
    // --- END PERSISTENCE LOAD ---

    const authenticateUser = async () => {
      const initialToken =
        typeof __initial_auth_token !== "undefined"
          ? __initial_auth_token
          : null;

      const authPromise = initialToken
        ? signInWithCustomToken(authInstance, initialToken)
        : signInAnonymously(authInstance);

      try {
        await authPromise;
      } catch (e) {
        console.warn("[Auth] Primary sign-in failed, ensuring anonymous:", e);
        if (!authInstance.currentUser) {
          try {
            await signInAnonymously(authInstance);
          } catch (error) {
            console.error("[Auth] Anonymous sign-in failed:", error);
          }
        }
      }
    };

    const unsubscribe = onAuthStateChanged(authInstance, (user) => {
      setAdminState((s) => ({
        ...s,
        user: user as AuthUser | null,
        isAuthReady: true,
        isLoading: false,
      }));
      if (!user) {
        authenticateUser();
      }
    });

    if (!authInstance.currentUser) {
      authenticateUser();
    }

    return () => unsubscribe();
  }, []);

  // Simulates role assignment for the demo (SAVES TO LOCAL STORAGE)
  const handleMockLogin = (role: AdminRole, operator: OperatorId | null) => {
    if (!adminState.user) return;

    // --- SAVE TO LOCAL STORAGE ---
    localStorage.setItem(ROLE_KEY, role);
    if (operator) {
      localStorage.setItem(OPERATOR_KEY, operator);
    } else {
      localStorage.removeItem(OPERATOR_KEY);
    }
    // --- END SAVE ---

    setAdminState((s) => ({
      ...s,
      role,
      operator,
      isLoading: false,
    }));
  };

  // Logout handler (CLEARS LOCAL STORAGE AND FORCES RELOAD)
  const handleLogout = async () => {
    if (authInstance) {
      await signOut(authInstance);
    }

    // --- CLEAR LOCAL STORAGE AND RELOAD ---
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(OPERATOR_KEY);
    window.location.reload(); // Force a full page reload to reset all state
    // --- END LOGOUT ---

    // This state update is technically redundant due to reload, but kept for logic clarity.
    setAdminState({
      isAuthReady: true,
      user: null,
      role: "Guest",
      operator: null,
      isLoading: false,
    });
  };

  return { adminState, handleMockLogin, handleLogout };
};

// --- DATA LOADING HOOK (ALL REQUESTS) ---

/**
 * Loads ALL requests from the collection group, regardless of status.
 */
const useAllPortabilityRequests = () => {
  const [allRequests, setAllRequests] = useState<PortabilityRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dbInstance) {
      setAllRequests([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetching all documents from the collection group 'portability_requests'
      const requestsQuery: Query<PortabilityRequest> = query(
        collectionGroup(dbInstance, "portability_requests")
      ).withConverter(requestConverter) as Query<PortabilityRequest>;

      const unsubscribe = onSnapshot(
        requestsQuery,
        (snapshot) => {
          const newRequests: PortabilityRequest[] = [];
          snapshot.forEach((doc) => {
            newRequests.push(doc.data());
          });
          setAllRequests(newRequests);
          setError(null);
          setLoading(false);
          console.log(
            `[Firestore] onSnapshot received ${newRequests.length} total requests.`
          );
        },
        (e) => {
          console.error("Erreur onSnapshot (Admin - All Fetch):", e);
          setError(
            "Erreur de chargement des données d'analyse. Vérifiez les permissions Firestore pour lire la collectionGroup 'portability_requests'."
          );
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (e) {
      console.error("Erreur fatale de construction de la requête Admin:", e);
      setError("Erreur fatale de construction de la requête.");
      setLoading(false);
    }
  }, []);

  return { allRequests, loading, error };
};

// --- CATEGORIZED REQUESTS HOOK (Filtered for Admin View) ---

const useCategorizedRequests = (
  adminState: AdminState,
  allRequests: PortabilityRequest[]
) => {
  const categorizedRequests: CategorizedRequests = useMemo(() => {
    if (adminState.role === "Guest" || !adminState.isAuthReady) {
      return {
        outgoing: [],
        incoming: [],
        validatedIncoming: [],
        superAdmin: {},
      };
    }

    const outgoing: PortabilityRequest[] = [];
    const incoming: PortabilityRequest[] = [];
    const validatedIncoming: PortabilityRequest[] = [];
    const superAdmin: CategorizedRequests["superAdmin"] = {};

    // Initialize SuperAdmin grouping structure
    if (adminState.role === "SuperAdmin") {
      OPERATORS.forEach((op) => {
        superAdmin[op] = { outgoing: [], validated: [] };
      });
    }

    allRequests.forEach((request) => {
      // SuperAdmin Logic: Group PENDING and VALIDATED by Source Provider
      if (adminState.role === "SuperAdmin") {
        const sourceOp = request.sourceProvider;

        if (superAdmin[sourceOp]) {
          if (request.status === "PENDING") {
            superAdmin[sourceOp]!.outgoing.push(request);
          } else if (request.status === "Validated") {
            superAdmin[sourceOp]!.validated.push(request);
          }
        }

        // This flat list is maintained for the action table (Toutes les Requêtes en Attente) if you want to keep it.
        // If not needed, remove the push here:
        if (request.status === "PENDING") {
          outgoing.push(request);
        }
        return;
      }

      // Provider Admin Logic (remains unchanged)
      if (adminState.role === "ProviderAdmin" && adminState.operator) {
        const adminOperator = adminState.operator;

        // 1. OUTGOING (ACTION REQUIRED): Admin's operator is the SOURCE & PENDING
        if (
          request.sourceProvider === adminOperator &&
          request.status === "PENDING"
        ) {
          outgoing.push(request);
          return;
        }

        // 2. INCOMING (MONITORING): Admin's operator is the TARGET & PENDING
        if (
          request.targetProvider === adminOperator &&
          request.status === "PENDING"
        ) {
          incoming.push(request);
          return;
        }

        // 3. VALIDATED INCOMING (SUCCESSFUL TRANSFERS): Admin's operator is the TARGET & Validated
        if (
          request.targetProvider === adminOperator &&
          request.status === "Validated"
        ) {
          validatedIncoming.push(request);
          return;
        }
      }
    });

    // Sort all lists by submittedAt DESC (most recent first)
    const sorter = (a: PortabilityRequest, b: PortabilityRequest) => {
      const timeA = a.submittedAt?.toMillis() || 0;
      const timeB = b.submittedAt?.toMillis() || 0;
      return timeB - timeA;
    };

    outgoing.sort(sorter);
    incoming.sort(sorter);
    validatedIncoming.sort(sorter);

    // Sort SuperAdmin groups
    OPERATORS.forEach((op) => {
      if (superAdmin[op]) {
        superAdmin[op]!.outgoing.sort(sorter);
        superAdmin[op]!.validated.sort(sorter);
      }
    });

    return { outgoing, incoming, validatedIncoming, superAdmin };
  }, [
    allRequests,
    adminState.role,
    adminState.operator,
    adminState.isAuthReady,
  ]);

  return { categorizedRequests };
};

// --- ANALYTICS HOOK (Data Processing) ---

const useAnalytics = (
  allRequests: PortabilityRequest[],
  operatorFilter: OperatorId | null,
  role: AdminRole
) => {
  const analytics = useMemo(() => {
    const annualData: AnnualData = {};

    // Determine which operators to track/display based on the role/filter
    const operatorsToTrack =
      role === "SuperAdmin"
        ? OPERATORS
        : operatorFilter
        ? [operatorFilter]
        : [];

    // --- 1. Annual Calculation (Counting ALL submitted requests) ---
    allRequests.forEach((request) => {
      if (!(request.submittedAt instanceof Timestamp)) {
        console.warn(
          "Skipping request due to invalid submittedAt timestamp:",
          request.id
        );
        return;
      }

      const year = request.submittedAt.toDate().getFullYear();

      if (!annualData[year]) {
        annualData[year] = {};
      }

      // Initialize data for all operators, but only process entries/exits if the operator is in the track list
      OPERATORS.forEach((operator) => {
        if (!annualData[year][operator]) {
          annualData[year][operator] = { entries: 0, exits: 0, net: 0 };
        }
      });

      const sourceOp = request.sourceProvider;
      const targetOp = request.targetProvider;

      // Increment Exits for Source Provider (A number is leaving)
      // Check if the source operator is one we are interested in (or if we are SuperAdmin)
      if (operatorsToTrack.includes(sourceOp) || role === "SuperAdmin") {
        if (annualData[year][sourceOp]) {
          annualData[year][sourceOp]!.exits += 1;
        }
      }

      // Increment Entries for Target Provider (A number is joining)
      // Check if the target operator is one we are interested in (or if we are SuperAdmin)
      if (operatorsToTrack.includes(targetOp) || role === "SuperAdmin") {
        if (annualData[year][targetOp]) {
          annualData[year][targetOp]!.entries += 1;
        }
      }
    });

    // --- 2. Calculate Net and filter for display based on role ---
    const years = Object.keys(annualData)
      .map(Number)
      .sort((a, b) => b - a);

    years.forEach((year) => {
      operatorsToTrack.forEach((operator) => {
        const data = annualData[year][operator];
        if (data) {
          data.net = data.entries - data.exits;
        }
      });
    });

    // --- 3. Overall Totals ---
    const overallTotals: Record<OperatorId, OperatorAnalytics> =
      OPERATORS.reduce(
        (acc, op) => ({
          ...acc,
          [op]: { entries: 0, exits: 0, net: 0 },
        }),
        {} as Record<OperatorId, OperatorAnalytics>
      );

    years.forEach((year) => {
      operatorsToTrack.forEach((operator) => {
        const data = annualData[year][operator];
        if (data) {
          overallTotals[operator].entries += data.entries;
          overallTotals[operator].exits += data.exits;
          overallTotals[operator].net += data.net;
        }
      });
    });

    // Filter annualData and overallTotals to include only tracked operators for ProviderAdmin
    if (role === "ProviderAdmin" && operatorFilter) {
      // Keep only the current operator's data in overallTotals
      const filteredTotals: Record<OperatorId, OperatorAnalytics> = {
        [operatorFilter]: overallTotals[operatorFilter],
      } as Record<OperatorId, OperatorAnalytics>;

      return { annualData, overallTotals: filteredTotals, years: [] };
    }

    return { annualData, overallTotals, years };
  }, [allRequests, operatorFilter, role]);

  return analytics;
};

// --- UPDATE HOOK (ACTION) ---

/**
 * Hook to handle the administrative action (Valider/Rejeter).
 */
const useRequestAction = (
  db: Firestore | null,
  currentAdminId: string | undefined
) => {
  // Path: artifacts/{appId}/users/{userId}/portability_requests/{requestId}
  const handleAction = async (
    requestId: string,
    fullNumber: string,
    newStatus: RequestStatus
  ): Promise<string> => {
    if (!db) return "Erreur: Base de données non initialisée.";

    // The ID of the user in the path is the full phone number, including the '+'.
    const userIdFromFullNumber = fullNumber;

    // Construct the full Firestore path
    const firestorePath = `artifacts/${appId}/users/${userIdFromFullNumber}/portability_requests/${requestId}`;

    try {
      console.log(
        `[Action] Admin ${
          currentAdminId || "ANONYMOUS"
        } attempting to update request ID: ${requestId} for user ID (Path Segment): ${userIdFromFullNumber} (Path: ${firestorePath}) to status: ${newStatus}`
      );

      // CORRECTION: Use the correct path construction with doc()
      const requestRef = doc(db as Firestore, firestorePath);

      // Met à jour le statut et ajoute un champ 'processedAt'
      await updateDoc(requestRef, {
        status: newStatus,
        processedAt: Timestamp.now(),
      });

      console.log(
        `[Action] SUCCESSFULLY updated document at path: ${firestorePath}. Firestore listener should now trigger...`
      );

      return `Demande de ${fullNumber} ${
        newStatus === "Validated" ? "validée" : "rejetée"
      } avec succès. Le document utilisateur a été mis à jour.`;
    } catch (e: any) {
      console.error(
        `[Action] FAILED to update document at path: ${firestorePath}. Error details:`,
        e
      );
      let errorMessage = `Erreur lors de la mise à jour : ${e.message}`;

      if (e.code === "permission-denied") {
        errorMessage = `Erreur de permission (Code: ${
          e.code
        }) : L'Admin (UID: ${
          currentAdminId || "ANONYMOUS"
        }) n'est pas autorisé à mettre à jour le document à ce chemin. 
        Vérifiez vos règles de sécurité Firestore. Le chemin ciblé était: ${firestorePath}.`;
      } else if (e.code === "not-found") {
        errorMessage = `Erreur (Code: ${e.code}) : Document non trouvé. Le chemin: ${firestorePath} est invalide ou n'existe pas. VÉRIFIEZ LE CHEMIN ET L'APP ID.`;
      }

      return errorMessage;
    }
  };

  return { handleAction };
};

// --- COMPOSANT DE LIGNE DE TABLEAU (ACTION) ---

const RequestRow: React.FC<{
  request: PortabilityRequest;
  onAction: (
    id: string,
    fullNumber: string,
    newStatus: RequestStatus
  ) => Promise<string>;
  setFeedback: (msg: string, type: "success" | "error") => void;
  isActionRequired: boolean; // Prop to control button visibility
}> = ({ request, onAction, setFeedback, isActionRequired }) => {
  const isPending = request.status === "PENDING";
  const [isProcessing, setIsProcessing] = useState(false);
  const isMounted = useIsMounted(); // Hook de sécurité anti-crash

  const statusClass = {
    PENDING: isActionRequired
      ? "bg-red-100 text-red-800"
      : "bg-yellow-100 text-yellow-800",
    Validated: "bg-green-100 text-green-800",
    Rejected: "bg-red-100 text-red-800",
  }[request.status];

  // Logic to determine the display label for the status column
  let statusLabel = request.status;
  if (isActionRequired && isPending) {
    statusLabel = "ACTION REQUISE";
  } else if (!isActionRequired && isPending) {
    statusLabel = "EN ATTENTE";
  }

  const handleStatusChange = async (newStatus: RequestStatus) => {
    setIsProcessing(true);

    const resultMsg = await onAction(request.id, request.fullNumber, newStatus);

    // SÉCURITÉ: S'assurer que le composant est toujours monté avant de mettre à jour l'état
    if (isMounted.current) {
      const type = resultMsg.startsWith("Erreur") ? "error" : "success";
      setFeedback(resultMsg, type);
      setIsProcessing(false);
    } else {
      // If unmounted, only the global feedback remains, preventing a crash.
    }
  };

  return (
    <tr className="border-b hover:bg-gray-50 transition duration-100">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        <span className="font-semibold">{request.fullNumber}</span>
        <div className="text-xs text-gray-400 mt-1">
          {request.firstName} - {request.email}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
        <span className="font-medium text-red-600">
          {request.sourceProvider}
        </span>{" "}
        &rarr;{" "}
        <span className="font-medium text-indigo-600">
          {request.targetProvider}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span
          className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass} transition duration-150 ease-in-out`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {request.submittedAt?.toDate().toLocaleDateString("fr-FR", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }) || "Date inconnue"}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        {isPending && isActionRequired ? (
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => handleStatusChange("Validated")}
              disabled={isProcessing}
              className={`text-white bg-green-500 hover:bg-green-600 px-3 py-1 rounded-full shadow-lg transition duration-150 ease-in-out font-medium transform hover:scale-105 ${
                isProcessing ? "opacity-50 cursor-not-allowed" : ""
              }`}
              aria-label={`Valider la demande de ${request.fullNumber}`}
            >
              {isProcessing ? "Traitement..." : "Valider"}
            </button>
            <button
              onClick={() => handleStatusChange("Rejected")}
              disabled={isProcessing}
              className={`text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-full shadow-lg transition duration-150 ease-in-out font-medium transform hover:scale-105 ${
                isProcessing ? "opacity-50 cursor-not-allowed" : ""
              }`}
              aria-label={`Rejeter la demande de ${request.fullNumber}`}
            >
              {isProcessing ? "Traitement..." : "Rejeter"}
            </button>
          </div>
        ) : isPending && !isActionRequired ? (
          <span className="text-gray-500 italic text-xs">
            En attente de {request.sourceProvider}
          </span>
        ) : (
          <span className="text-gray-500 italic text-xs">Traitée</span>
        )}
      </td>
    </tr>
  );
};

// --- COMPOSANT TABLEAU DES ANALYSES ---

const AnalyticsSection: React.FC<{
  analytics: ReturnType<typeof useAnalytics>;
  loading: boolean;
  dataAvailable: boolean;
  role: AdminRole;
  operatorFilter: OperatorId | null;
}> = ({ analytics, loading, dataAvailable, role, operatorFilter }) => {
  const { overallTotals, years, annualData } = analytics;

  // Determine which operators to display
  const sortedOperators =
    role === "SuperAdmin"
      ? OPERATORS.slice().sort()
      : operatorFilter
      ? [operatorFilter]
      : [];

  // Check if we have data for the filtered view
  const dataAvailableForView =
    dataAvailable &&
    sortedOperators.some(
      (op) =>
        overallTotals[op] &&
        (overallTotals[op].entries > 0 || overallTotals[op].exits > 0)
    );

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        Chargement des données d'analyse...
      </div>
    );
  }

  if (!dataAvailableForView) {
    return (
      <div className="text-center py-8 bg-white rounded-xl shadow-lg mt-6 border border-gray-200">
        <p className="text-lg font-semibold text-gray-600">
          {role === "SuperAdmin"
            ? "Aucune donnée de portabilité soumise n'a été trouvée pour l'analyse globale."
            : `Aucune donnée de portabilité soumise ou pertinente trouvée pour ${operatorFilter}.`}
        </p>
        <p className="text-gray-500 mt-2 text-sm">
          Soumettez quelques demandes pour voir les statistiques apparaître ici.
        </p>
      </div>
    );
  }

  const renderTable = (
    data: Record<OperatorId, OperatorAnalytics>,
    title: string,
    currentOperators: OperatorId[]
  ) => (
    <div className="shadow-2xl overflow-x-auto border border-gray-200 rounded-xl mb-8">
      <h3 className="text-xl font-bold p-4 bg-indigo-50 text-indigo-800 rounded-t-xl">
        {title}
      </h3>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-indigo-100">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-indigo-700 uppercase tracking-wider">
              Opérateur
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-indigo-700 uppercase tracking-wider">
              Entrées (Target)
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-indigo-700 uppercase tracking-wider">
              Sorties (Source)
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-indigo-700 uppercase tracking-wider">
              Net (Gain/Perte)
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {currentOperators.map((operator) => {
            const stats = data[operator] || { entries: 0, exits: 0, net: 0 };
            const netClass =
              stats.net > 0
                ? "text-green-600 font-bold"
                : stats.net < 0
                ? "text-red-600 font-bold"
                : "text-gray-500";
            return (
              <tr
                key={operator}
                className="hover:bg-indigo-50 transition duration-100"
              >
                <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {operator}
                </td>
                <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                  {stats.entries}
                </td>
                <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                  {stats.exits}
                </td>
                <td className="px-6 py-3 whitespace-nowrap text-sm text-right">
                  <span className={netClass}>
                    {stats.net >= 0 ? `+${stats.net}` : stats.net}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mt-12 p-6 bg-white rounded-xl shadow-2xl">
      <h2 className="text-3xl font-extrabold text-indigo-700 mb-6 border-b pb-2">
        Analyse de la Portabilité (Total des Soumissions)
      </h2>

      {/* 1. Overall Totals Table - Shared View */}
      <div className="text-lg font-semibold text-gray-700 mb-4">
        {role === "SuperAdmin"
          ? "Bilan Général de tous les Opérateurs"
          : `Bilan consolidé de l'Opérateur ${operatorFilter}`}
      </div>
      {renderTable(
        overallTotals,
        "1. Bilan Total (Entrées vs Sorties)",
        sortedOperators
      )}

      {/* 2. Annual Breakdown - SuperAdmin Only */}
      {role === "SuperAdmin" && years.length > 0 && (
        <>
          <h3 className="text-xl font-bold mt-8 mb-4 text-gray-800">
            2. Ventilation Annuelle (Tous Opérateurs)
          </h3>
          {years.map((year) => (
            <div key={year} className="mb-8">
              {/* Rendu pour tous les opérateurs pour le Super Admin */}
              {renderTable(
                annualData[year] as Record<OperatorId, OperatorAnalytics>,
                `Statistiques Détaillées pour l'Année ${year}`,
                OPERATORS.slice().sort()
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

// --- COMPOSANT ADMIN PRINCIPAL ---

const App: React.FC = () => {
  const { adminState, handleMockLogin, handleLogout } = useAdminAuth();

  // Data loading (All requests)
  const {
    allRequests,
    loading: allDataLoading,
    error: dataError,
  } = useAllPortabilityRequests();

  // Get the current Admin's UID for logging and permissions check
  const currentAdminId = adminState.user?.uid;

  // Filtering for PENDING admin view
  const { categorizedRequests } = useCategorizedRequests(
    adminState,
    allRequests
  );

  // Data analysis (Total and Annual breakdown)
  const analytics = useAnalytics(
    allRequests,
    adminState.operator,
    adminState.role
  );

  // Pass the current Admin's UID to the action hook for better logging and context
  const { handleAction } = useRequestAction(dbInstance, currentAdminId);

  const [actionMessage, setActionMessage] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const setFeedback = (msg: string, type: "success" | "error") => {
    setActionMessage({ msg, type });
    setTimeout(() => setActionMessage(null), 10000); // 10 seconds for detailed error message
  };

  // Map for mock login buttons
  const loginOptions: {
    role: AdminRole;
    operator: OperatorId | null;
    label: string;
  }[] = useMemo(
    () => [
      {
        role: "SuperAdmin",
        operator: null,
        label: "Super Administrateur (Tous)",
      },
      // Mise à jour des libellés des boutons pour refléter les MAJUSCULES
      { role: "ProviderAdmin", operator: "ORANGE", label: "Admin ORANGE" },
      { role: "ProviderAdmin", operator: "AIRTEL", label: "Admin AIRTEL" },
      { role: "ProviderAdmin", operator: "VODACOM", label: "Admin VODACOM" },
      { role: "ProviderAdmin", operator: "AFRICELL", label: "Admin AFRICELL" },
    ],
    []
  );

  // Reusable table renderer component (for PENDING requests)
  const RequestTableSection: React.FC<{
    title: string;
    subtitle: string;
    requests: PortabilityRequest[];
    isActionRequired: boolean;
    operatorName: string;
    colorClass: string;
  }> = ({
    title,
    subtitle,
    requests,
    isActionRequired,
    operatorName,
    colorClass,
  }) => (
    <section className="mb-10">
      <h2
        className={`text-2xl font-bold text-gray-800 mb-4 pb-2 border-b-2 ${colorClass}`}
      >
        {title} ({requests.length})
      </h2>
      <p className="text-gray-600 mb-4">
        {subtitle.replace("{operator}", operatorName)}
      </p>

      {requests.length > 0 ? (
        <div className="shadow-2xl overflow-x-auto border border-gray-200 rounded-xl">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
                >
                  Numéro & Détails
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
                >
                  De &rarr; Vers
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
                >
                  Statut
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
                >
                  Soumise le
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Action
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {requests.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  onAction={handleAction}
                  setFeedback={setFeedback}
                  isActionRequired={isActionRequired}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-6 bg-white rounded-xl shadow-lg mt-6 border border-gray-200">
          <p className="text-lg font-semibold text-gray-600">
            {isActionRequired
              ? `Aucune action requise pour ${operatorName}.`
              : `Aucune nouvelle demande pour ${operatorName}.`}
          </p>
          <p className="text-gray-500 mt-2 text-sm">
            {isActionRequired
              ? "Les demandes en attente de traitement apparaissent ici."
              : "Les demandes traitées ou entrantes apparaissent ici."}
          </p>
        </div>
      )}
    </section>
  );

  // --- Initial Loading/Auth Check ---
  if (adminState.isLoading || !adminState.isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-lg font-semibold text-blue-600 animate-pulse">
          Initialisation de l'environnement Firebase...
        </p>
      </div>
    );
  }

  // --- Login Screen (Role Simulation) ---
  if (adminState.role === "Guest") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
          <h1 className="text-3xl font-extrabold text-gray-800 mb-6 text-center">
            Portabilité RDC - Admin
          </h1>
          <p className="text-gray-600 mb-8 text-center">
            Sélectionnez votre rôle pour accéder au tableau de bord.
          </p>
          {loginOptions.map((option) => (
            <button
              key={option.label}
              onClick={() => handleMockLogin(option.role, option.operator)}
              className={`w-full py-3 mb-4 rounded-xl font-semibold transition duration-300 ease-in-out transform hover:-translate-y-0.5 
                                ${
                                  option.role === "SuperAdmin"
                                    ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-200/50"
                                    : "bg-gray-200 text-gray-700 hover:bg-gray-300 shadow-md"
                                }
                            `}
            >
              {option.label}
            </button>
          ))}
          <p className="text-xs text-gray-500 mt-6 text-center border-t pt-4">
            Connecté anonymement:{" "}
            <span className="font-mono text-gray-600 break-all">
              {currentAdminId}
            </span>
          </p>
        </div>
      </div>
    );
  }

  // --- Admin Dashboard ---
  const operatorName = adminState.operator || "Tous";

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-gray-200 mb-6">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-3xl font-extrabold text-gray-900">
            Tableau de bord{" "}
            <span className="text-indigo-600">
              {adminState.role === "SuperAdmin"
                ? "Super Admin"
                : `Admin ${operatorName}`}
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Visualisation et analyse des demandes de portabilité.
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg hover:bg-red-600 transition duration-150 ease-in-out text-sm font-semibold transform hover:scale-105"
        >
          Déconnexion
        </button>
      </header>

      {/* Affichage des messages de feedback */}
      {actionMessage && (
        <div
          className={`p-4 mb-6 rounded-xl shadow-lg text-sm font-medium transition duration-300 ease-in-out 
            ${
              actionMessage.type === "success"
                ? "bg-green-100 text-green-800 border border-green-300"
                : "bg-red-100 text-red-800 border border-red-300"
            }`}
          role="alert"
        >
          <strong className="font-bold">
            {actionMessage.type === "error"
              ? "Échec de l'Action: "
              : "Succès: "}
          </strong>
          <span className="block mt-1">{actionMessage.msg}</span>
          {actionMessage.type === "error" && (
            <p className="text-xs mt-2 font-normal text-red-600 bg-red-100 p-2 rounded-lg border border-red-300">
              <strong className="font-bold">
                ACTION REQUISE (RÈGLES DE SÉCURITÉ) :
              </strong>{" "}
              Pour autoriser l'Admin à traiter les demandes d'autres
              utilisateurs, vos règles Firestore doivent permettre l'écriture
              pour n'importe quel utilisateur authentifié sur le chemin privé
              des utilisateurs.
              <br />
              Vérifiez et modifiez votre règle pour qu'elle inclue
              l'autorisation d'écriture :
              <code className="block bg-red-200 p-2 mt-1 rounded text-gray-900">
                match
                /artifacts/$(appId)/users/$(userId)/portability_requests/$(docId)
                &#123; <br />
                &nbsp;&nbsp;allow update: if
                (request.resource.data.keys().hasOnly(['status', 'processedAt'])
                &amp;&amp; resource.data.status == 'PENDING') ||
                (resource.data.firebaseUid == request.auth.uid); <br />
                &#125;
              </code>
            </p>
          )}
        </div>
      )}

      {/* Affichage du chargement / Erreurs générales */}
      {(allDataLoading || dataError) && (
        <div className="flex justify-center items-center h-48 bg-white rounded-xl shadow-md mb-6">
          {allDataLoading && (
            <p className="text-lg text-blue-600 font-medium">
              Chargement des données...
            </p>
          )}
          {dataError && (
            <div
              className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 w-full"
              role="alert"
            >
              <strong className="font-bold">Erreur de données : </strong>
              <span className="block sm:inline">{dataError}</span>
            </div>
          )}
        </div>
      )}

      {/* SECTION ANALYSE (Visible pour tous les administrateurs) */}
      {!allDataLoading && !dataError && adminState.role !== "Guest" && (
        <AnalyticsSection
          analytics={analytics}
          loading={allDataLoading}
          dataAvailable={allRequests.length > 0}
          role={adminState.role}
          operatorFilter={adminState.operator}
        />
      )}

      <hr className="my-10 border-t-2 border-gray-200" />

      {/* SECTION TRAITEMENT (PENDING REQUESTS) */}
      <h2 className="text-3xl font-extrabold text-gray-900 mb-6">
        Gestion des Demandes
      </h2>

      {!allDataLoading && !dataError && (
        <>
          {adminState.role === "SuperAdmin" ? (
            // --- SUPER ADMIN GROUPED VIEW ---
            <>
              <p className="text-gray-600 mb-6">
                Visualisation détaillée des demandes par Opérateur Source.
              </p>
              {OPERATORS.map((op) => {
                const group = categorizedRequests.superAdmin[op];
                if (!group) return null;

                const hasData =
                  group.outgoing.length > 0 || group.validated.length > 0;

                if (!hasData) return null; // Skip if the provider has no outgoing or validated requests

                return (
                  <div
                    key={op}
                    className="border-2 border-gray-300 p-6 mb-10 rounded-xl bg-white shadow-xl"
                  >
                    <h3 className="text-2xl font-bold text-gray-900 mb-6 border-b pb-3 text-center">
                      Opérateur Source :{" "}
                      <span className="text-indigo-600">{op}</span>
                    </h3>

                    {/* PENDING / OUTGOING (ACTION REQUIRED) */}
                    <RequestTableSection
                      title={`Requêtes Sortantes - En Attente (${op})`}
                      subtitle={`Ces numéros sont en attente de traitement et doivent quitter ${op}.`}
                      requests={group.outgoing}
                      isActionRequired={true}
                      operatorName={op}
                      colorClass="border-red-500"
                    />

                    {/* VALIDATED TRANSFERS */}
                    <hr className="my-8 border-t border-gray-100" />
                    <RequestTableSection
                      title={`Transferts Validés - Sortants (${op})`}
                      subtitle={`Ces numéros ont été Validés par ${op} et ont quitté son réseau.`}
                      requests={group.validated}
                      isActionRequired={false}
                      operatorName={op}
                      colorClass="border-green-500"
                    />
                  </div>
                );
              })}

              {/* Fallback for SuperAdmin if no requests found */}
              {allRequests.length === 0 && (
                <div className="text-center py-12 bg-white rounded-xl shadow-lg mt-6 border border-gray-200">
                  <p className="text-xl font-semibold text-gray-600">
                    Aucune demande de portabilité n'a été trouvée dans la base
                    de données.
                  </p>
                </div>
              )}
            </>
          ) : (
            // --- PROVIDER ADMIN VIEW (Unchanged) ---
            <>
              {/* 1. OUTGOING/ALL PENDING REQUESTS (ACTION REQUIRED) */}
              <RequestTableSection
                title={"Requêtes Sortantes (Action Requise)"}
                subtitle={
                  "Ces numéros quittent {operator}. Vous devez Approuver ou Rejeter la demande."
                }
                requests={categorizedRequests.outgoing}
                isActionRequired={true}
                operatorName={operatorName}
                colorClass="border-red-500"
              />

              {adminState.role === "ProviderAdmin" &&
                operatorName !== "Tous" && (
                  <>
                    <hr className="my-10 border-t-2 border-gray-100" />
                    {/* 2. INCOMING REQUESTS (MONITORING ONLY) - PENDING */}
                    <RequestTableSection
                      title="Requêtes Entrantes (En Attente de Source)"
                      subtitle="Ces numéros souhaitent rejoindre {operator}. Elles sont en attente d'approbation par leur fournisseur source."
                      requests={categorizedRequests.incoming}
                      isActionRequired={false}
                      operatorName={operatorName}
                      colorClass="border-yellow-500"
                    />

                    <hr className="my-10 border-t-2 border-green-500" />
                    {/* 3. VALIDATED INCOMING (SUCCESSFUL TRANSFERS) */}
                    <RequestTableSection
                      title="Transferts Validés (Entrants)"
                      subtitle="Ces numéros ont été Validés par leur fournisseur source et ont rejoint {operator}."
                      requests={categorizedRequests.validatedIncoming}
                      isActionRequired={false}
                      operatorName={operatorName}
                      colorClass="border-indigo-500"
                    />
                  </>
                )}

              {/* Fallback for ProviderAdmin if no requests found */}
              {categorizedRequests.outgoing.length === 0 &&
                categorizedRequests.incoming.length === 0 &&
                categorizedRequests.validatedIncoming.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-xl shadow-lg mt-6 border border-gray-200">
                    <p className="text-xl font-semibold text-gray-600">
                      Aucune demande **en attente** ou **validée** n'est à
                      traiter ou à surveiller pour {operatorName}.
                    </p>
                  </div>
                )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default App;
