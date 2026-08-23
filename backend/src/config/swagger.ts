import swaggerJSDoc from "swagger-jsdoc";
import { env } from "./env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const routesPath = path.resolve(process.cwd(), "src/routes/*.ts");

const swaggerDefinition = {
  openapi: "3.0.3",
  info: {
    title: "GET IT NOW API",
    version: "1.0.0",
    description: "On-demand service marketplace API for connecting customers with verified workers",
    contact: {
      name: "API Support",
      email: "support@getitnow.example"
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT"
    }
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}`,
      description: "Development server"
    },
    {
      url: "https://api.getitnow.example",
      description: "Production server"
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object" }
        }
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok"] },
          database: { type: "string", enum: ["ok", "mock"] }
        }
      },
      AuthRequestOtp: {
        type: "object",
        required: ["phone"],
        properties: {
          phone: { type: "string", format: "phone", example: "+919876543210" }
        }
      },
      AuthVerifyOtp: {
        type: "object",
        required: ["phone", "otp"],
        properties: {
          phone: { type: "string", format: "phone", example: "+919876543210" },
          otp: { type: "string", pattern: "^\\d{6}$", example: "123456" },
          role: { type: "string", enum: ["customer", "worker"], default: "customer" }
        }
      },
      AuthResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              phone: { type: "string" },
              role: { type: "string", enum: ["customer", "worker", "society_admin", "federation_admin", "system_admin", "support_staff"] }
            }
          }
        }
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "user@example.com" },
          password: { type: "string", format: "password", minLength: 6 }
        }
      },
      GoogleAuthResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              email: { type: "string", format: "email" },
              name: { type: "string" },
              role: { type: "string", enum: ["customer", "worker", "society_admin", "federation_admin", "system_admin", "support_staff"] }
            }
          }
        }
      },
      ForgotPasswordRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email", example: "user@example.com" }
        }
      },
      ForgotPasswordResponse: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          message: { type: "string" }
        }
      },
      ResetPasswordRequest: {
        type: "object",
        required: ["token", "password"],
        properties: {
          token: { type: "string" },
          password: { type: "string", format: "password", minLength: 6 }
        }
      },
      ResetPasswordResponse: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          message: { type: "string" }
        }
      },
      NearbyQuery: {
        type: "object",
        required: ["serviceId", "latitude", "longitude"],
        properties: {
          serviceId: { type: "string", format: "uuid" },
          latitude: { type: "number", format: "double", minimum: -90, maximum: 90 },
          longitude: { type: "number", format: "double", minimum: -180, maximum: 180 },
          urgency: { type: "string", enum: ["regular", "emergency"], default: "regular" }
        }
      },
      WorkerMatch: {
        type: "object",
        properties: {
          workerId: { type: "string", format: "uuid" },
          name: { type: "string" },
          distanceKm: { type: "number", format: "double" },
          rating: { type: "number", format: "double" },
          jobsToday: { type: "integer" },
          hasCertification: { type: "boolean" },
          isAvailable: { type: "boolean" },
          score: { type: "number", format: "double" },
          reasons: { type: "array", items: { type: "string" } }
        }
      },
      NearbyResponse: {
        type: "object",
        properties: {
          matches: { type: "array", items: { $ref: "#/components/schemas/WorkerMatch" } }
        }
      },
      AvailabilityUpdate: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["available", "busy", "offline"] }
        }
      },
      CreateBooking: {
        type: "object",
        required: ["customerId", "serviceId", "description", "latitude", "longitude", "address"],
        properties: {
          customerId: { type: "string", format: "uuid" },
          serviceId: { type: "string", format: "uuid" },
          description: { type: "string", minLength: 3 },
          latitude: { type: "number", format: "double", minimum: -90, maximum: 90 },
          longitude: { type: "number", format: "double", minimum: -180, maximum: 180 },
          address: { type: "string", minLength: 3 },
          scheduledAt: { type: "string", format: "date-time" },
          isEmergency: { type: "boolean", default: false }
        }
      },
      BookingResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          customerId: { type: "string", format: "uuid" },
          workerId: { type: "string", format: "uuid", nullable: true },
          serviceId: { type: "string", format: "uuid" },
          status: { type: "string" },
          isEmergency: { type: "boolean" },
          address: { type: "string" },
          description: { type: "string" },
          price: { type: "number", format: "double", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time", nullable: true }
        }
      },
      CreateBookingResponse: {
        type: "object",
        properties: {
          booking: { $ref: "#/components/schemas/BookingResponse" },
          recommendedWorker: { $ref: "#/components/schemas/WorkerMatch", nullable: true },
          alternatives: { type: "array", items: { $ref: "#/components/schemas/WorkerMatch" } }
        }
      },
      UpdateBookingStatus: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["requested", "accepted", "en_route", "arrived", "in_progress", "completed", "cancelled"] },
          actorId: { type: "string", format: "uuid" }
        }
      },
      AdminDashboard: {
        type: "object",
        properties: {
          totalWorkers: { type: "integer" },
          totalBookings: { type: "integer" },
          activeEmergencyRequests: { type: "integer" }
        }
      },
      WorkerVerify: {
        type: "object",
        properties: {
          worker: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              verificationStatus: { type: "string", enum: ["pending", "verified", "rejected"] }
            }
          }
        }
      },
      AIDemandForecast: {
        type: "object",
        properties: {
          predictions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", format: "date" },
                serviceId: { type: "string", format: "uuid" },
                expectedDemand: { type: "integer" }
              }
            }
          }
        }
      },
      AIWorkforceAllocation: {
        type: "object",
        properties: {
          recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                serviceId: { type: "string", format: "uuid" },
                recommendedWorkers: { type: "integer" },
                reasoning: { type: "string" }
              }
            }
          }
        }
      },
      Service: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          category: { type: "string" },
          description: { type: "string", nullable: true },
          basePrice: { type: "number", format: "double" },
          emergencySupported: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      ServiceCategory: {
        type: "object",
        properties: {
          category: { type: "string" },
          services: { type: "array", items: { $ref: "#/components/schemas/Service" } }
        }
      },
      CreateService: {
        type: "object",
        required: ["name", "category", "basePrice"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          category: { type: "string", minLength: 1, maxLength: 50 },
          description: { type: "string", maxLength: 500 },
          basePrice: { type: "number", format: "double", minimum: 0 },
          emergencySupported: { type: "boolean", default: false }
        }
      },
      UpdateService: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          category: { type: "string", minLength: 1, maxLength: 50 },
          description: { type: "string", maxLength: 500 },
          basePrice: { type: "number", format: "double", minimum: 0 },
          emergencySupported: { type: "boolean" }
        }
      }
    },
    parameters: {
      NearbyQueryParam: {
        name: "query",
        in: "query",
        required: true,
        schema: {
          $ref: "#/components/schemas/NearbyQuery"
        }
      }
    }
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Health", description: "Health check endpoints" },
    { name: "Authentication", description: "Authentication methods including phone OTP, email/password, and Google OAuth" },
    { name: "Workers", description: "Worker discovery and availability" },
    { name: "Bookings", description: "Booking management" },
    { name: "Admin", description: "Admin dashboard and management" },
    { name: "AI", description: "AI-powered forecasting and allocation" },
    { name: "Services", description: "Service catalog and categories" }
  ]
};

const options = {
  definition: swaggerDefinition,
  apis: [routesPath]
};

const spec = swaggerJSDoc(options);
export const swaggerSpec = spec;