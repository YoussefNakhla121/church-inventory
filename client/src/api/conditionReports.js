import api from './axios';

export const submitConditionReports = (requestId, reports) =>
  api.post(`/api/requests/${requestId}/condition-reports`, { reports });

export const getConditionReports = (requestId) =>
  api.get(`/api/requests/${requestId}/condition-reports`);
