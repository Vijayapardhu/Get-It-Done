import { config } from "dotenv";
import { AppError } from "../core/errors.js";
config();

const GOOGLE_MAPS_API_KEY = "AIzaSyAVbIGwEi4GeLFmQefqrOcV3Md8bK1Qtoc";
const BASE_URL = "https://maps.googleapis.com/maps/api";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  formattedAddress: string;
  location: Coordinates;
  placeId: string;
  addressComponents: AddressComponent[];
}

export interface AddressComponent {
  longName: string;
  shortName: string;
  types: string[];
}

export interface DistanceMatrixResult {
  origin: Coordinates;
  destination: Coordinates;
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  durationInTraffic?: { text: string; value: number };
}

export interface PlaceSearchResult {
  placeId: string;
  name: string;
  formattedAddress: string;
  location: Coordinates;
  rating?: number;
  types: string[];
  vicinity: string;
}

export interface DirectionsResult {
  routes: Array<{
    legs: Array<{
      distance: { text: string; value: number };
      duration: { text: string; value: number };
      startAddress: string;
      endAddress: string;
      startLocation: Coordinates;
      endLocation: Coordinates;
      steps: Array<{
        htmlInstructions: string;
        distance: { text: string; value: number };
        duration: { text: string; value: number };
        startLocation: Coordinates;
        endLocation: Coordinates;
        travelMode: string;
      }>;
    }>;
    overviewPolyline: { points: string };
    bounds: {
      northeast: Coordinates;
      southwest: Coordinates;
    };
  }>;
}

async function request<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.append(k, v);
  }

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (networkError) {
    throw AppError.serviceUnavailable("Google Maps");
  }
  const data = await response.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw AppError.validationError(`Google Maps API error: ${data.status} - ${data.error_message}`);
  }
  return data;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult[]> {
  const data = await request<{ results: any[] }>("geocode/json", { address });
  return data.results.map((r) => ({
    formattedAddress: r.formatted_address,
    location: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
    placeId: r.place_id,
    addressComponents: r.address_components.map((c: any) => ({
      longName: c.long_name,
      shortName: c.short_name,
      types: c.types,
    })),
  }));
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult[]> {
  const data = await request<{ results: any[] }>("geocode/json", { latlng: `${lat},${lng}` });
  return data.results.map((r) => ({
    formattedAddress: r.formatted_address,
    location: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
    placeId: r.place_id,
    addressComponents: r.address_components.map((c: any) => ({
      longName: c.long_name,
      shortName: c.short_name,
      types: c.types,
    })),
  }));
}

export async function getDistanceMatrix(
  origins: Coordinates[],
  destinations: Coordinates[],
  options: { mode?: "driving" | "walking" | "bicycling" | "transit"; departureTime?: number; trafficModel?: "best_guess" | "pessimistic" | "optimistic" } = {}
): Promise<DistanceMatrixResult[]> {
  const originStr = origins.map((o) => `${o.lat},${o.lng}`).join("|");
  const destStr = destinations.map((d) => `${d.lat},${d.lng}`).join("|");

  const params: Record<string, string> = {
    origins: originStr,
    destinations: destStr,
    mode: options.mode || "driving",
    units: "metric",
  };

  if (options.departureTime && options.departureTime > Math.floor(Date.now() / 1000)) params.departure_time = String(options.departureTime);
  if (options.trafficModel) params.traffic_model = options.trafficModel;

  const data = await request<{ rows: any[] }>("distancematrix/json", params);

  const results: DistanceMatrixResult[] = [];
  data.rows.forEach((row, i) => {
    row.elements.forEach((element: any, j: number) => {
      if (element.status === "OK") {
        results.push({
          origin: origins[i],
          destination: destinations[j],
          distance: element.distance,
          duration: element.duration,
          durationInTraffic: element.duration_in_traffic,
        });
      }
    });
  });
  return results;
}

export async function searchPlaces(query: string, location?: Coordinates, radius = 5000): Promise<PlaceSearchResult[]> {
  const params: Record<string, string> = {
    query,
    key: GOOGLE_MAPS_API_KEY,
  };
  if (location) {
    params.location = `${location.lat},${location.lng}`;
    params.radius = String(radius);
  }

  const url = new URL(`${BASE_URL}/place/textsearch/json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (networkError) {
    throw AppError.serviceUnavailable("Google Places");
  }
  const data = await response.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw AppError.validationError(`Places API error: ${data.status} - ${data.error_message}`);
  }

  return data.results.map((r: any) => ({
    placeId: r.place_id,
    name: r.name,
    formattedAddress: r.formatted_address,
    location: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
    rating: r.rating,
    types: r.types,
    vicinity: r.vicinity,
  }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceSearchResult | null> {
  const data = await request<{ result: any }>("place/details/json", {
    place_id: placeId,
    fields: "name,formatted_address,geometry,rating,types,vicinity,place_id",
  });

  if (!data.result) return null;

  return {
    placeId: data.result.place_id,
    name: data.result.name,
    formattedAddress: data.result.formatted_address,
    location: { lat: data.result.geometry.location.lat, lng: data.result.geometry.location.lng },
    rating: data.result.rating,
    types: data.result.types,
    vicinity: data.result.vicinity,
  };
}

export async function getDirections(
  origin: Coordinates,
  destination: Coordinates,
  options: { mode?: "driving" | "walking" | "bicycling" | "transit"; departureTime?: number; avoid?: string[] } = {}
): Promise<DirectionsResult> {
  const params: Record<string, string> = {
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    mode: options.mode || "driving",
    alternatives: "true",
  };

  if (options.departureTime) params.departure_time = String(options.departureTime);
  if (options.avoid?.length) params.avoid = options.avoid.join("|");

  return request<DirectionsResult>("directions/json", params);
}

interface StaticMapMarker {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}

export function getStaticMapUrl(
  center: Coordinates,
  zoom = 15,
  size = "600x400",
  markers: Array<StaticMapMarker> = []
): string {
  const params = new URLSearchParams({
    center: `${center.lat},${center.lng}`,
    zoom: String(zoom),
    size,
    key: GOOGLE_MAPS_API_KEY,
  });

  if (markers.length > 0) {
    const markerStr = markers.map((m) => `${m.lat},${m.lng}`).join("|");
    params.append("markers", markerStr);
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function getEmbedMapUrl(origin: Coordinates, destination: Coordinates, mode = "driving"): string {
  return `https://www.google.com/maps/embed/v1/directions?key=${GOOGLE_MAPS_API_KEY}&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=${mode}`;
}

export function getNavigationUrl(destination: Coordinates): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`;
}

export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}