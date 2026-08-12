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
  owner: { name: string; email: string } | null;
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

  listAdmins: async () => (await adminApi.get('/admins')).data.admins as PlatformAdminSummary[],

  inviteAdmin: async (name: string, email: string) =>
    (await adminApi.post('/admins/invite', { name, email })).data,

  acceptInvite: async (token: string, password: string) =>
    (await adminApi.post('/accept-invite', { token, password })).data,
};
