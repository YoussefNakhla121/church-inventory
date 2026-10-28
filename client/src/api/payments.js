import api from './axios';

export const getPayments = (params = {}) => api.get('/api/payments', { params });

export const getPendingPaymentsCount = () => api.get('/api/payments/pending-count');

export const getPayment = (id) => api.get(`/api/payments/${id}`);

export const decidePayment = (id, decision, note) =>
  api.patch(`/api/payments/${id}/decision`, { decision, note });
