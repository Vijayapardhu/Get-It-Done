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
  bio?: string;
  totalJobs?: number;
  completedJobs?: number;
  cancelledJobs?: number;
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
  id: string;
  name: string;
  type: "federation" | "cooperative";
}

// ─────────────────────────────────────────────── Operations ──

export interface BookingRow {
  id: string;
  bookingNumber: string;
  status: string;
  scheduledAt: string | null;
  isEmergency: boolean;
  address: string;
  description: string | null;
  price: number | null;
  createdAt: string;
  service_name: string;
  worker_id: string;
  worker_name: string;
  worker_phone: string;
  customer_name: string;
  customer_phone: string;
}

export interface ActiveJobRow {
  id: string;
  bookingNumber: string;
  startedAt: string | null;
  address: string;
  service_name: string;
  worker_id: string;
  worker_name: string;
  duration_minutes: number;
}

export interface DelayedJobRow {
  id: string;
  bookingNumber: string;
  status: string;
  createdAt: string;
  service_name: string;
  worker_id: string;
  worker_name: string;
  minutes_pending: number;
}

export interface ComplaintRow {
  id: string;
  status: string;
  description: string;
  createdAt: string;
  booking_id: string;
  bookingNumber: string;
  customer_name: string;
  worker_id: string;
  worker_name: string;
}

export interface EmergencyRow {
  id: string;
  bookingNumber: string;
  status: string;
  address: string;
  description: string | null;
  createdAt: string;
  priority: string;
  radiusKm: number;
  escalationLevel: number;
  service_name: string;
  customer_name: string;
  customer_phone: string;
}

export interface OperationsData {
  currentBookings: BookingRow[];
  activeJobs: ActiveJobRow[];
  delayedJobs: DelayedJobRow[];
  complaints: ComplaintRow[];
  emergencyRequests: EmergencyRow[];
}

// ─────────────────────────────────────────────── Analytics ──

export interface ServiceDemandRow {
  id: string;
  name: string;
  category: string;
  demand: string | number;
}

export interface PopularServiceRow {
  id: string;
  name: string;
  category: string;
  total_bookings: string | number;
  completed: string | number;
  avg_rating: string | number | null;
}

export interface WorkerUtilRow {
  id: string;
  name: string;
  rating: number | null;
  current_status: string;
  total_assigned: string | number;
  completed: string | number;
  cancelled: string | number;
  earnings: string | number;
}

export interface AreaDemandRow {
  area: string;
  total_requests: string | number;
  emergency_requests: string | number;
  services_requested: string | number;
  workers_needed: string | number;
  completed: string | number;
  unassigned: string | number;
}

export interface EarningsTrendRow {
  day: string;
  completed_jobs: string | number;
  daily_earnings: string | number;
}

export interface AnalyticsData {
  serviceDemand: ServiceDemandRow[];
  popularServices: PopularServiceRow[];
  workerUtilization: WorkerUtilRow[];
  areaDemand: AreaDemandRow[];
  earningsTrend: EarningsTrendRow[];
}

export interface AreaDemandResponse {
  areaDemand: AreaDemandRow[];
}

// ─────────────────────────────────────────────── Support ──

export interface SupportTicket {
  id: string;
  subject?: string;
  category?: string;
  status: "open" | "in_progress" | "resolved" | "closed" | string;
  priority?: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  user?: { name: string; email: string };
}

// ─────────────────────────────────────────────── Catalogue / Services ──

export interface ServiceFaq {
  question: string;
  answer: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  base_price?: number;
  basePrice?: number;
  emergency_supported?: boolean;
  emergencySupported?: boolean;
  price_per_minute?: number;
  pricePerMinute?: number;
  min_minutes?: number;
  minMinutes?: number;
  max_minutes?: number;
  maxMinutes?: number;
  default_minutes?: number;
  defaultMinutes?: number;
  list_price?: number;
  listPrice?: number;
  hero_image_url?: string;
  heroImageUrl?: string;
  heroImageKey?: string;
  hero_image_key?: string;
  includes?: string[];
  excludes?: string[];
  steps?: string[] | Array<{ title: string; description: string; imageUrl?: string | null }>;
  faqs?: ServiceFaq[];
  imageUrl?: string | null;
  animationUrl?: string | null;
  categoryImageUrl?: string | null;
  categoryAnimationUrl?: string | null;
  categoryAccentColor?: string | null;
  ratingAverage?: number | null;
  ratingCount?: number;
  createdAt?: string;
  created_at?: string;
  updated_at?: string;
  active?: boolean;
  estimatedDurationMinutes?: number;
}

export interface ServiceCategory {
  category: string;
  services: Service[];
  imageUrl: string | null;
  imageKey?: string | null;
  animationUrl: string | null;
  accentColor: string | null;
}

// ─────────────────────────────────────────────── Cooperatives / Federation ──

export interface Cooperative {
  id: string;
  name: string;
  district?: string;
  state?: string;
  code?: string;
  memberCount?: number;
  verifiedWorkers?: number;
}

// ─────────────────────────────────────────────── Pricing ──

export interface PricingRule {
  id?: string;
  name?: string;
  serviceCategory?: string;
  basePrice?: number;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  [key: string]: unknown;
}

export interface SurgeRule {
  id?: string;
  name?: string;
  multiplier?: number;
  condition?: string;
  [key: string]: unknown;
}

export interface TravelFee {
  id?: string;
  name?: string;
  perKm?: number;
  minFee?: number;
  [key: string]: unknown;
}

export interface TaxRule {
  id?: string;
  name?: string;
  rate?: number;
  appliesTo?: string;
  [key: string]: unknown;
}

export interface Zone {
  id: string;
  name: string;
  polygon: { type: "Polygon"; coordinates: number[][][] };
  base_price: number;
  basePrice: number;
  demand_multiplier: number;
  demandMultiplier: number;
  status: string;
  geometry?: { type: "Polygon"; coordinates: number[][][] };
  cooperative_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ZonePricing {
  id: string;
  cooperative_id: string;
  cooperativeId: string;
  zone_id: string;
  zoneId: string;
  price_override: number | null;
  priceOverride: number | null;
  demand_multiplier: number;
  demandMultiplier: number;
  enabled: boolean;
  zone_name?: string;
  zoneName?: string;
  federation_base_price?: number;
  federationBasePrice?: number;
  geometry?: { type: "Polygon"; coordinates: number[][][] };
}

// ─────────────────────────────────────────────── System / Admin ──

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: AdminRole;
  status: string;
  lastLoginAt?: string;
}

export interface RoleRow {
  id: string;
  name: string;
  description?: string;
  permissions?: string[];
}

export interface AuditEvent {
  id: string;
  actorId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────── Federation ──

export interface FederationOverview {
  totalSocieties: number;
  totalWorkers: number;
  totalCustomers: number;
  totalBookings: number;
  totalEarnings: number;
  activeEmergencyRequests: number;
  workerUtilization: {
    total_verified: number;
    workers_with_jobs: number;
    avg_jobs_per_worker: string;
    stddev_jobs: string;
  };
  welfare: {
    total_workers: number;
    insured_workers: number;
    trained_workers: number;
    critical_incidents: number;
  };
}

export interface RegionalDemandRow {
  cooperative_id: string;
  cooperative_name: string;
  district: string;
  state: string;
  total_bookings: number;
  emergency_bookings: number;
  completed: number;
  unassigned: number;
  total_workers: number;
  verified_workers: number;
  available_workers: number;
  earnings: number;
}

export interface SocietyPerformanceRow {
  id: string;
  name: string;
  code: string;
  district: string;
  state: string;
  commission_rate: number;
  total_workers: number;
  verified_workers: number;
  available_workers: number;
  bookings_last_30d: number;
  completed_last_30d: number;
  earnings_last_30d: number;
  avg_worker_rating: string;
  negative_reviews: number;
  admin_count: number;
}

export interface AiRecommendation {
  id: string;
  service_id?: string;
  service_name?: string;
  cooperative_name?: string;
  district?: string;
  state?: string;
  status: "pending" | "approved" | "rejected" | "applied";
  type?: string;
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  created_at?: string;
  approved_by?: string;
}

export interface FederationAiForecasts {
  recommendations: AiRecommendation[];
  forecasts: Array<{
    date?: string;
    area?: string;
    service?: string;
    predicted_requests?: number;
    confidence?: number;
  }>;
}

export interface AdminCooperative {
  id: string;
  name: string;
  code: string;
  district: string;
  state: string;
  status?: SocietyStatus;
  federation_id?: string;
  federation_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  commission_rate?: number;
  min_workers?: number;
  max_workers?: number;
  created_at?: string;
  logo_key?: string;
}

export interface LiveOperations {
  activeBookings: Array<{
    id: string;
    booking_number: string;
    status: string;
    is_emergency: boolean;
    address: string;
    description?: string;
    price?: number;
    created_at: string;
    service_name: string;
    customer_name: string;
    worker_id?: string;
    worker_name?: string;
  }>;
  activeEmergencies: Array<{
    id: string;
    booking_number: string;
    status: string;
    priority: string;
    escalation_level?: number;
    address: string;
    description?: string;
    created_at: string;
    service_name: string;
    customer_name?: string;
  }>;
  availableWorkers: Array<{
    id: string;
    current_status: string;
    rating: number;
    name: string;
  }>;
  timestamp: string;
}

export interface EmergencyBooking {
  id: string;
  booking_number?: string;
  status: string;
  priority: string;
  radius_km?: number;
  max_response_minutes?: number;
  escalation_level?: number;
  escalated_at?: string;
  address: string;
  description?: string;
  created_at: string;
  service_name: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface RevenueAnalytics {
  total_revenue?: number;
  total_bookings?: number;
  completed_bookings?: number;
  average_order_value?: number;
  by_society?: Array<{
    cooperative_id: string;
    cooperative_name: string;
    revenue: number;
    bookings: number;
  }>;
  trend?: Array<{
    date: string;
    revenue: number;
    bookings: number;
  }>;
}

export interface BookingAnalytics {
  total_bookings?: number;
  completed?: number;
  cancelled?: number;
  pending?: number;
  by_status?: Array<{ status: string; count: number }>;
  by_service?: Array<{ service_name: string; count: number }>;
  trend?: Array<{ date: string; bookings: number }>;
}

export interface WorkerAnalytics {
  total_workers?: number;
  verified?: number;
  available?: number;
  utilization_rate?: number;
  by_cooperative?: Array<{ cooperative_name: string; workers: number; verified: number }>;
}

export interface Settlement {
  id: string;
  cooperative_id?: string;
  cooperative_name?: string;
  period_start?: string;
  period_end?: string;
  total_amount?: number;
  status?: string;
  created_at?: string;
}

export interface Refund {
  id: string;
  payment_order_id?: string;
  booking_id?: string;
  provider?: string;
  amount?: number;
  status?: string;
  created_at?: string;
  customer_name?: string;
}

export interface SecurityEvent {
  id: string;
  user_id?: string;
  event_type?: string;
  target_type?: string;
  target_id?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationTemplate {
  id: string;
  name?: string;
  type?: string;
  title_template?: string;
  body_template?: string;
  channels?: string[];
  language?: string;
  is_active?: boolean;
  created_at?: string;
}

// ─────────────────────────────────────────────── Territory & Onboarding ──

export interface Territory {
  id: string;
  cooperative_id: string;
  cooperative_name?: string;
  status: string;
  version: number;
  geometry: { type: "Polygon"; coordinates: number[][][] };
  area_km2: number;
  center_lat: number;
  center_lng: number;
  created_at: string;
  updated_at: string;
  validated_at?: string;
}

export interface TerritoryGap {
  geometry: { type: "Polygon"; coordinates: number[][][] };
  area_km2: number;
  center_lat: number;
  center_lng: number;
}

export interface SocietyAdmin {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  last_login_at?: string;
  temporary_password: boolean;
  created_at: string;
}

export type SocietyStatus = "draft" | "territory_pending" | "admin_pending" | "active" | "suspended";

// ═══════════════════════════════════════════════════════════════════
// WORKER APP TYPES
// ═══════════════════════════════════════════════════════════════════

export interface WorkerDocument {
  id: string;
  workerId: string;
  type: "aadhar" | "pan" | "driving_license" | "other";
  fileUrl: string;
  status: "pending" | "verified" | "rejected";
  createdAt: string;
  rejectionReason?: string;
}

export interface PayoutAccount {
  id: string;
  workerId: string;
  provider: "bank" | "upi";
  accountHolder: string;
  accountNumber?: string;
  ifscCode?: string;
  upiId?: string;
  verifiedAt?: string;
  createdAt: string;
}

export interface WorkerEarnings {
  id: string;
  workerId: string;
  bookingId?: string;
  entryType: "earning" | "adjustment" | "payout" | "refund";
  amount: number;
  reference?: string;
  createdAt: string;
}

export interface WorkerWallet {
  balance: number;
  totalEarnings: number;
  pendingPayout: number;
}

export interface WorkerJob {
  id: string;
  serviceName: string;
  address: string;
  scheduledAt: string;
  status: "assigned" | "started" | "completed" | "cancelled";
  price?: number;
  customerName?: string;
}

export interface WorkerRegistration {
  name: string;
  phone: string;
  address: string;
  latitude?: number;
  longitude?: number;
  aadharKey?: string | null;
  panKey?: string | null;
}