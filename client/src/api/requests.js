import api from './axios';

export const createRequest = (data) => api.post('/api/requests', data);
export const getMyRequests = () => api.get('/api/requests/mine');
export const cancelRequest = (id) => api.patch(`/api/requests/${id}/cancel`);
export const getAllRequests = (status) =>
  api.get('/api/requests', { params: status ? { status } : {} });
export const getRequestById = (id) => api.get(`/api/requests/${id}`);
export const updateRequestStatus = (id, status) =>
  api.patch(`/api/requests/${id}/status`, { status });
