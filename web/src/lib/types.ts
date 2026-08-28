export type AdminRole = "system_admin" | "federation_admin" | "society_admin" | "support_staff";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: AdminRole;
  language: string;
  status: "active" | "inactive" | "suspended";
  avatarUrl?: string;
  lastLoginAt?: string;
  cooperativeId?: string;
  federationId?: string;
}

export interface ScopeOption {
  id: string;
  name: string;
  type: "federation" | "cooperative";
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Worker {
  id: string;
  workerCode: string;
  verificationStatus: "draft" | "submitted" | "under_review" | "verified" | "rejected" | "suspended" | "expired";
  rating: number | null;
  currentStatus: "available" | "busy" | "offline";
  experienceYears: number | null;
  serviceRadiusKm: number | null;
  name: string;
  phone: string;
  email: string;
  avatarUrl?: string;
  cooperativeName?: string;
  cooperativeId?: string;
  district?: string;
  state?: string;
  skills?: WorkerSkill[];
  serviceAreas?: WorkerServiceArea[];
  activeJobs?: number;
  jobsLast30Days?: number;
}

export interface WorkerSkill {
  skillId: string;
  name: string;
  category: string;
  level: string;
  verified: boolean;
  yearsExperience?: number;
}

export interface WorkerServiceArea {
  serviceId: string;
  name: string;
  radiusKm: number;
}

export interface WorkersListParams {
  page?: number;
  limit?: number;
  search?: string;
  serviceId?: string;
  cooperativeId?: string;
  verificationStatus?: Worker["verificationStatus"];
  availability?: Worker["currentStatus"];
  minRating?: number;
}

export interface WorkersListResponse {
  workers: Worker[];
  total: number;
  page: number;
  limit: number;
}

export interface VerificationAction {
  reason: string;
}

export interface BulkStatusAction {
  workerIds: string[];
  status: "available" | "busy" | "offline" | "verified" | "rejected" | "suspended";
  reason?: string;
}

export interface ApiError {
  error: string;
  message?: string;
  details?: unknown;
}

export interface DashboardOverview {
  totalWorkers: number;
  verifiedWorkers: number;
  activeWorkers: number;
  totalBookings: number;
  completedJobs: number;
  pendingJobs: number;
  activeEmergencyRequests: number;
  totalEarnings: number;
  averageRating: number;
}

export interface AdminScope {
  cooperativeId?: string;
  federationId?: string;
}