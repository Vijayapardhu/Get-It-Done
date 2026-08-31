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

  /**
   * What a minute of this service costs.
   *
   * Null for a service an operator has not rated yet; the app then falls back
   * to advertising basePrice as a flat figure rather than showing nothing.
   */
  pricePerMinute: number | null;

  /** The bounds an operator set. The app offers nothing outside them. */
  minMinutes: number;
  maxMinutes: number;
  defaultMinutes: number;
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

/** The rate and duration bounds an operator controls. */
export type ServicePricing = {
  pricePerMinute?: number | null;
  minMinutes?: number;
  maxMinutes?: number;
  defaultMinutes?: number;
};

export type CreateService = {
  name: string;
  category: string;
  description?: string;
  basePrice: number;
  emergencySupported?: boolean;
  imageUrl?: string | null;
  animationUrl?: string | null;
  heroImageKey?: string | null;
  includes?: string[];
  excludes?: string[];
  steps?: string[];
  faqs?: Array<{ question: string; answer: string }>;
};

/// Everything a create takes, plus the rate and duration bounds an operator
/// tunes after the fact.
export type UpdateService = Partial<CreateService> & ServicePricing;

export type ServiceListParams = {
  category?: string;
  emergencyOnly?: boolean;
  search?: string;
};