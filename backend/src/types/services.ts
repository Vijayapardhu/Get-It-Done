export type Service = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  basePrice: number;
  emergencySupported: boolean;
  createdAt: string;

  /** Raster artwork (PNG/WebP). Null means the client falls back to its glyph. */
  imageUrl: string | null;

  /** Lottie JSON. Only set where motion is worth the weight. */
  animationUrl: string | null;

  /** Inherited from the service's category when the service has none of its own. */
  categoryImageUrl: string | null;
  categoryAnimationUrl: string | null;
  categoryAccentColor: string | null;
};

export type ServiceCategory = {
  category: string;
  services: Service[];

  /** Category-level artwork, so a category tile can render without picking a
   *  representative service. */
  imageUrl: string | null;
  animationUrl: string | null;
  accentColor: string | null;
};

export type CreateService = {
  name: string;
  category: string;
  description?: string;
  basePrice: number;
  emergencySupported?: boolean;
  imageUrl?: string | null;
  animationUrl?: string | null;
};

export type UpdateService = Partial<CreateService>;

export type ServiceListParams = {
  category?: string;
  emergencyOnly?: boolean;
  search?: string;
};