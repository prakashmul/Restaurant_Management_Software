import axios from 'axios';
import { API_ROOT } from '../api/posApi';

// Deliberately its own axios instance with its own token header, entirely
// separate from the tenant `API` instance in posApi.ts — a platform admin
// session must never send (or be confused with) a tenant JWT/X-Location-Id,
// and vice versa.
const adminApi = axios.create({ baseURL: `${API_ROOT}/api/platform-admin` });

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('platformAdminToken');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('platformAdminToken');
      localStorage.removeItem('platformAdminUser');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export interface PageCatalogEntry {
  key: string;
  label: string;
}

export interface TenantRestaurant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  enabledPages: string[];
  planId: string | null;
  planName: string | null;
  owner: { name: string; email: string } | null;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  priceMonthly: number;
  priceAnnual: number;
  perLocationPrice: number;
  pages: string[];
  isActive: boolean;
  sortOrder: number;
  restaurantCount: number;
}

export interface PlanInput {
  name: string;
  slug: string;
  priceMonthly: number;
  priceAnnual: number;
  perLocationPrice?: number;
  pages: string[];
  isActive?: boolean;
  sortOrder?: number;
}

export interface PlatformAdminSummary {
  id: string;
  name: string;
  email: string;
  isSeedAccount: boolean;
  inviteAccepted: boolean;
  createdAt: string;
}

export const platformAdminApi = {
  getMe: async () => (await adminApi.get('/me')).data as { id: string; name: string; email: string },

  getPageCatalog: async () => (await adminApi.get('/page-catalog')).data.pages as PageCatalogEntry[],

  listRestaurants: async () => (await adminApi.get('/restaurants')).data.restaurants as TenantRestaurant[],

  updateRestaurantPages: async (restaurantId: string, pages: string[]) =>
    (await adminApi.patch(`/restaurants/${restaurantId}/pages`, { pages })).data,

  assignRestaurantPlan: async (restaurantId: string, planId: string) =>
    (await adminApi.patch(`/restaurants/${restaurantId}/plan`, { planId })).data as {
      id: string;
      planId: string;
      planName: string;
      enabledPages: string[];
    },

  // Explicit, separate from assign — assign only ever adds a plan's pages,
  // this is the only action that removes any (replaces enabledPages with
  // exactly the restaurant's current plan's page list).
  resetRestaurantPlanDefaults: async (restaurantId: string) =>
    (await adminApi.patch(`/restaurants/${restaurantId}/plan/reset`)).data as {
      id: string;
      planId: string;
      planName: string;
      enabledPages: string[];
    },

  deleteRestaurant: async (restaurantId: string) =>
    (await adminApi.delete(`/restaurants/${restaurantId}`)).data as { message: string },

  listPlans: async () => (await adminApi.get('/plans')).data.plans as Plan[],

  createPlan: async (input: PlanInput) => (await adminApi.post('/plans', input)).data as { id: string },

  updatePlan: async (planId: string, input: Partial<PlanInput>) =>
    (await adminApi.put(`/plans/${planId}`, input)).data as Plan,

  deletePlan: async (planId: string) => (await adminApi.delete(`/plans/${planId}`)).data as { message: string },

  listAdmins: async () => (await adminApi.get('/admins')).data.admins as PlatformAdminSummary[],

  inviteAdmin: async (name: string, email: string) =>
    (await adminApi.post('/admins/invite', { name, email })).data,

  acceptInvite: async (token: string, password: string) =>
    (await adminApi.post('/accept-invite', { token, password })).data,
};
