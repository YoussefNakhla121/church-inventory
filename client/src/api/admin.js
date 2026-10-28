import api from './axios';

export const getAdminSummary = (start, end) =>
  api.get('/api/admin/summary', { params: { start, end } });

export const getAdminRequests = (start, end, page, pageSize) =>
  api.get('/api/admin/requests', { params: { start, end, page, pageSize } });

export const requestPayment = (start, end) =>
  api.post('/api/admin/payments', { start, end });

export const getMyPayments = (page, pageSize) =>
  api.get('/api/admin/payments', { params: { page, pageSize } });
