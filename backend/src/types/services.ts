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

/** One thing that happens while the job is being done. */
export type ServiceStep = {
  title: string;
  description: string;
  /** Optional small illustration; the app falls back to a numbered marker. */
  imageUrl?: string | null;
};

export type ServiceFaq = {
  question: string;
  answer: string;
};

/**
 * A service with the editorial content its own page needs.
 *
 * Separate from [Service] because these lists are long and the catalogue
 * endpoint returns every service at once: sending each one's FAQs to render a
 * grid of cards would be several kilobytes nobody reads.
 */
export type ServiceDetail = Service & {
  /** Full-bleed photograph for the top of the page. */
  heroImageUrl: string | null;

  includes: string[];

  /**
   * What this service is NOT. Empty is legitimate but rarely correct: a
   * customer who discovers on the doorstep that something was never included
   * is a dispute and a refund, and saying so here costs nothing.
   */
  excludes: string[];

  steps: ServiceStep[];
  faqs: ServiceFaq[];
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