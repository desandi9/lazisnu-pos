export const isOwner = (user) => user?.role === 'owner';

export const isAdmin = (user) => user?.role === 'admin';

export const canManageUsers = (user) => isOwner(user);

export const canManageProducts = (user) => isOwner(user);

export const canCreateTransaction = (user) => isOwner(user) || isAdmin(user);

export const canViewReports = (user) => isOwner(user) || isAdmin(user);

export const canManageProfitSharing = (user) => isOwner(user);

export const canSyncSpreadsheet = (user) => isOwner(user) || isAdmin(user);

export const canDeleteUser = (user, targetUser) => {
  if (!canManageUsers(user)) return false;
  if (!targetUser) return true;

  return user?.id !== targetUser.id && user?.username !== targetUser.username;
};

export const canDeleteProduct = (user) => canManageProducts(user);

export const canAccessView = (user, view) => {
  if (!user) return false;

  if (view === 'users') return canManageUsers(user);
  if (view === 'profit-settings') return canManageProfitSharing(user);
  if (view === 'sales') return canCreateTransaction(user);
  if (view === 'reports') return canViewReports(user);
  if (view === 'spreadsheet') return canSyncSpreadsheet(user);

  return ['dashboard', 'products', 'invoice'].includes(view);
};
