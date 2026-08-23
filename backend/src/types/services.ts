export type Service = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  basePrice: number;
  emergencySupported: boolean;
  createdAt: string;
};

export type ServiceCategory = {
  category: string;
  services: Service[];
};

export type CreateService = {
  name: string;
  category: string;
  description?: string;
  basePrice: number;
  emergencySupported?: boolean;
};

export type UpdateService = Partial<CreateService>;

export type ServiceListParams = {
  category?: string;
  emergencyOnly?: boolean;
  search?: string;
};