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

  /**
   * The "was" price a promotion is struck through against, or null when the
   * service is simply priced at basePrice. Null is the normal case: a
   * struck-through figure that was never charged is a lie printed on the card.
   */
  listPrice: number | null;

  /**
   * Mean of real reviews of real jobs for this service, to one decimal, or null
   * when it has never been reviewed. Never a default like 4.5 — an invented
   * rating is the one number on a card nobody can check.
   */
  ratingAverage: number | null;
  ratingCount: number;
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