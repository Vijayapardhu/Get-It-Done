export type BookingUrgency = "regular" | "emergency";

export type MatchingCandidate = {
  workerId: string;
  name: string;
  distanceKm: number;
  rating: number;
  jobsToday: number;
  hasCertification: boolean;
  isAvailable: boolean;
  currentStatus?: string;
};

export type WorkerMatch = MatchingCandidate & {
  score: number;
  reasons: string[];
};

export interface MatchingCriteria {
  serviceId: string;
  latitude: number;
  longitude: number;
  urgency: BookingUrgency;
  radiusKm?: number;
  maxDistanceKm?: number;
  minRating?: number;
  excludeWorkerIds?: string[];
  requiredSkills?: string[];
}

export interface MatchingResult {
  workers: WorkerMatch[];
  totalCandidates: number;
  searchRadiusKm: number;
  searchTimeMs: number;
}