import { randomUUID } from "node:crypto";
import type { BookingUrgency, MatchingCandidate } from "../types.js";
import type { Service } from "../types/services.js";
import { scoreCandidate } from "../services/matching.js";

export const demoIds = {
  customerId: "00000000-0000-0000-0000-000000000301",
  plumbingServiceId: "00000000-0000-0000-0000-000000000201",
  electricalServiceId: "00000000-0000-0000-0000-000000000202"
};

export const demoServices: Service[] = [
  {
    id: demoIds.plumbingServiceId,
    name: "Plumbing",
    category: "Home Repair",
    description: "Leak fixes, pipe repairs, taps and fittings",
    basePrice: 299,
    emergencySupported: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: demoIds.electricalServiceId,
    name: "Electrical",
    category: "Home Repair",
    description: "Switches, wiring, power failures and fixtures",
    basePrice: 349,
    emergencySupported: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  }
];

const workersByService: Record<string, MatchingCandidate[]> = {
  [demoIds.plumbingServiceId]: [
    {
      workerId: "00000000-0000-0000-0000-000000000601",
      name: "Ravi Kumar",
      distanceKm: 1.4,
      rating: 4.8,
      jobsToday: 2,
      hasCertification: true,
      isAvailable: true
    },
    {
      workerId: "00000000-0000-0000-0000-000000000602",
      name: "Sita Devi",
      distanceKm: 2.6,
      rating: 4.6,
      jobsToday: 1,
      hasCertification: true,
      isAvailable: true
    }
  ],
  [demoIds.electricalServiceId]: [
    {
      workerId: "00000000-0000-0000-0000-000000000601",
      name: "Ravi Kumar",
      distanceKm: 1.7,
      rating: 4.8,
      jobsToday: 2,
      hasCertification: true,
      isAvailable: true
    }
  ]
};

const bookings = new Map<string, Record<string, unknown>>();

export function findDemoMatches(serviceId: string, urgency: BookingUrgency) {
  return (workersByService[serviceId] ?? [])
    .map((candidate) => scoreCandidate(candidate, urgency))
    .sort((a, b) => b.score - a.score);
}

export function createDemoBooking(input: {
  customerId: string;
  workerId?: string;
  serviceId: string;
  isEmergency: boolean;
  address: string;
  description: string;
}) {
  const booking = {
    id: randomUUID(),
    customerId: input.customerId,
    workerId: input.workerId ?? null,
    serviceId: input.serviceId,
    status: "requested",
    isEmergency: input.isEmergency,
    address: input.address,
    description: input.description,
    createdAt: new Date().toISOString()
  };

  bookings.set(booking.id, booking);
  return booking;
}

export function getDemoBooking(id: string) {
  return bookings.get(id);
}

export function updateDemoBookingStatus(id: string, status: string) {
  const booking = bookings.get(id);
  if (!booking) {
    return null;
  }

  const updated = { ...booking, status, updatedAt: new Date().toISOString() };
  bookings.set(id, updated);
  return updated;
}

export function getDemoDashboard() {
  const allBookings = Array.from(bookings.values());

  return {
    totalWorkers: 2,
    totalBookings: allBookings.length,
    activeEmergencyRequests: allBookings.filter(
      (booking) => booking.isEmergency === true && !["completed", "cancelled"].includes(String(booking.status))
    ).length
  };
}

