import api from './axios';

export const getItems = () => api.get('/api/items');
export const getItemsAll = () => api.get('/api/items', { params: { include_inactive: true } });

export const getItemAvailability = (id, start, end) =>
  api.get(`/api/items/${id}/availability`, { params: { start, end } });

export const getItemsAvailability = (start, end) =>
  api.get('/api/items/availability', { params: { start, end } });

export const getItemConditionHistory = (id) =>
  api.get(`/api/items/${id}/condition-history`);

export const createItem = (formData) => api.post('/api/items', formData);

export const updateItem = (id, formData) => api.patch(`/api/items/${id}`, formData);

export const deactivateItem = (id) => api.patch(`/api/items/${id}/deactivate`);
export const reactivateItem = (id) => api.patch(`/api/items/${id}/reactivate`);
