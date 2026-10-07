import api from './axios';

export const createRequest = (data) => api.post('/api/requests', data);
export const getMyRequests = (params = {}) => api.get('/api/requests/mine', { params });
export const cancelRequest = (id) => api.patch(`/api/requests/${id}/cancel`);
export const getAllRequests = (params = {}) => api.get('/api/requests', { params });
export const getRequestById = (id) => api.get(`/api/requests/${id}`);
export const updateRequestStatus = (id, status) =>
  api.patch(`/api/requests/${id}/status`, { status });
