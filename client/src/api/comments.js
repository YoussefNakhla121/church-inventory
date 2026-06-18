import api from './axios';

export const getComments = (requestId) =>
  api.get(`/api/requests/${requestId}/comments`);

export const postComment = (requestId, body) =>
  api.post(`/api/requests/${requestId}/comments`, { body });
