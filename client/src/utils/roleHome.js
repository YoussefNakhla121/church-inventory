export const getRoleHome = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'manager') return '/manager';
  return '/';
};
