import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  geocodeAddress,
  reverseGeocode,
  getDistanceMatrix,
  searchPlaces,
  getPlaceDetails,
  getDirections,
  getStaticMapUrl,
  getEmbedMapUrl,
  getNavigationUrl,
  calculateDistance,
} from "../services/googleMaps.js";

export const googleMapsRouter = Router();

const geocodeSchema = z.object({ address: z.string().min(3).max(500) });
const reverseGeocodeSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const distanceMatrixSchema = z.object({
  origins: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(1).max(25),
  destinations: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(1).max(25),
  mode: z.enum(["driving", "walking", "bicycling", "transit"]).optional(),
  departureTime: z.number().int().optional(),
  trafficModel: z.enum(["best_guess", "pessimistic", "optimistic"]).optional(),
});
const placesSearchSchema = z.object({
  query: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radius: z.number().int().positive().max(50000).optional(),
});
const directionsSchema = z.object({
  origin: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  destination: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  mode: z.enum(["driving", "walking", "bicycling", "transit"]).optional(),
  departureTime: z.number().int().optional(),
  avoid: z.array(z.string()).optional(),
});
const staticMapSchema = z.object({
  center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  zoom: z.number().int().min(1).max(21).optional(),
  size: z.string().regex(/^\d+x\d+$/).optional(),
  markers: z.array(z.object({ lat: z.number(), lng: z.number(), label: z.string().optional(), color: z.string().optional() })).optional(),
});

/**
 * @openapi
 * /maps/geocode:
 *   post:
 *     summary: Convert address to coordinates
 *     tags: [Google Maps]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address: { type: string }
 *     responses:
 *       200:
 *         description: Geocoded results
 */
googleMapsRouter.post("/geocode", requireAuth, async (req, res, next) => {
  try {
    const { address } = geocodeSchema.parse(req.body);
    const results = await geocodeAddress(address);
    res.json({ results });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /maps/reverse-geocode:
 *   post:
 *     summary: Convert coordinates to address
 *     tags: [Google Maps]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lat, lng]
 *             properties:
 *               lat: { type: number }
 *               lng: { type: number }
 *     responses:
 *       200:
 *         description: Reverse geocoded results
 */
googleMapsRouter.post("/reverse-geocode", requireAuth, async (req, res, next) => {
  try {
    const { lat, lng } = reverseGeocodeSchema.parse(req.body);
    const results = await reverseGeocode(lat, lng);
    res.json({ results });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /maps/distance-matrix:
 *   post:
 *     summary: Get distance and duration between multiple origins and destinations
 *     tags: [Google Maps]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [origins, destinations]
 *             properties:
 *               origins: { type: array, items: { type: object, properties: { lat: { type: number }, lng: { type: number } } } }
 *               destinations: { type: array, items: { type: object, properties: { lat: { type: number }, lng: { type: number } } } }
 *               mode: { type: string, enum: [driving, walking, bicycling, transit] }
 *               departureTime: { type: integer }
 *               trafficModel: { type: string, enum: [best_guess, pessimistic, optimistic] }
 *     responses:
 *       200:
 *         description: Distance matrix results
 */
googleMapsRouter.post("/distance-matrix", requireAuth, async (req, res, next) => {
  try {
    const input = distanceMatrixSchema.parse(req.body);
    const results = await getDistanceMatrix(input.origins, input.destinations, {
      mode: input.mode,
      departureTime: input.departureTime,
      trafficModel: input.trafficModel,
    });
    res.json({ results });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /maps/places/search:
 *   post:
 *     summary: Search for places
 *     tags: [Google Maps]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query: { type: string }
 *               lat: { type: number }
 *               lng: { type: number }
 *               radius: { type: integer }
 *     responses:
 *       200:
 *         description: Place search results
 */
googleMapsRouter.post("/places/search", requireAuth, async (req, res, next) => {
  try {
    const { query, lat, lng, radius } = placesSearchSchema.parse(req.body);
    const location = lat && lng ? { lat, lng } : undefined;
    const results = await searchPlaces(query, location, radius);
    res.json({ results });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /maps/places/{placeId}:
 *   get:
 *     summary: Get place details
 *     tags: [Google Maps]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: placeId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Place details
 */
googleMapsRouter.get("/places/:placeId", requireAuth, async (req, res, next) => {
  try {
    const placeId = Array.isArray(req.params.placeId) ? req.params.placeId[0] : req.params.placeId;
    let result;
    try {
      result = await getPlaceDetails(placeId);
    } catch (mapsError) {
      if (String((mapsError as Error).message).includes("Google Maps API error")) {
        res.status(400).json({ error: (mapsError as Error).message });
        return;
      }
      throw mapsError;
    }
    if (!result) { res.status(404).json({ error: "Place not found" }); return; }
    res.json({ place: result });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /maps/directions:
 *   post:
 *     summary: Get directions between two points
 *     tags: [Google Maps]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [origin, destination]
 *             properties:
 *               origin: { type: object, properties: { lat: { type: number }, lng: { type: number } } }
 *               destination: { type: object, properties: { lat: { type: number }, lng: { type: number } } }
 *               mode: { type: string, enum: [driving, walking, bicycling, transit] }
 *               departureTime: { type: integer }
 *               avoid: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Directions result
 */
googleMapsRouter.post("/directions", requireAuth, async (req, res, next) => {
  try {
    const input = directionsSchema.parse(req.body);
    const result = await getDirections(input.origin, input.destination, {
      mode: input.mode,
      departureTime: input.departureTime,
      avoid: input.avoid,
    });
    res.json({ directions: result });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /maps/static-map:
 *   post:
 *     summary: Get static map image URL
 *     tags: [Google Maps]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [center]
 *             properties:
 *               center: { type: object, properties: { lat: { type: number }, lng: { type: number } } }
 *               zoom: { type: integer }
 *               size: { type: string }
 *               markers: { type: array, items: { type: object, properties: { lat: { type: number }, lng: { type: number }, label: { type: string }, color: { type: string } } } }
 *     responses:
 *       200:
 *         description: Static map URL
 */
googleMapsRouter.post("/static-map", requireAuth, async (req, res, next) => {
  try {
    const input = staticMapSchema.parse(req.body);
    const url = getStaticMapUrl(input.center, input.zoom, input.size, input.markers);
    res.json({ url });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /maps/embed:
 *   post:
 *     summary: Get embed map URL for directions
 *     tags: [Google Maps]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [origin, destination]
 *             properties:
 *               origin: { type: object, properties: { lat: { type: number }, lng: { type: number } } }
 *               destination: { type: object, properties: { lat: { type: number }, lng: { type: number } } }
 *               mode: { type: string, enum: [driving, walking, bicycling, transit] }
 *     responses:
 *       200:
 *         description: Embed map URL
 */
googleMapsRouter.post("/embed", requireAuth, async (req, res, next) => {
  try {
    const { origin, destination, mode } = directionsSchema.parse(req.body);
    const url = getEmbedMapUrl(origin, destination, mode);
    res.json({ url });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /maps/navigation:
 *   post:
 *     summary: Get navigation URL
 *     tags: [Google Maps]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [destination]
 *             properties:
 *               destination: { type: object, properties: { lat: { type: number }, lng: { type: number } } }
 *     responses:
 *       200:
 *         description: Navigation URL
 */
googleMapsRouter.post("/navigation", requireAuth, async (req, res, next) => {
  try {
    const { destination } = z.object({ destination: z.object({ lat: z.number(), lng: z.number() }) }).parse(req.body);
    const url = getNavigationUrl(destination);
    res.json({ url });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /maps/distance:
 *   post:
 *     summary: Calculate straight-line distance between two points
 *     tags: [Google Maps]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lat1, lng1, lat2, lng2]
 *             properties:
 *               lat1: { type: number }
 *               lng1: { type: number }
 *               lat2: { type: number }
 *               lng2: { type: number }
 *     responses:
 *       200:
 *         description: Distance in kilometers
 */
googleMapsRouter.post("/distance", requireAuth, async (req, res, next) => {
  try {
    const { lat1, lng1, lat2, lng2 } = z.object({ lat1: z.number(), lng1: z.number(), lat2: z.number(), lng2: z.number() }).parse(req.body);
    const distance = calculateDistance(lat1, lng1, lat2, lng2);
    res.json({ distanceKm: distance });
  } catch (error) { next(error); }
});

export default googleMapsRouter;