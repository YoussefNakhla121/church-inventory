import api from './axios';

export const register = (data) => api.post('/api/auth/register', data);
export const registerManager = (data) => api.post('/api/auth/register-manager', data);
export const login = (data) => api.post('/api/auth/login', data);
export const updateProfile = (data) => api.put('/api/auth/profile', data);
export const getGradeGroups = () => api.get('/api/gradegroups');
