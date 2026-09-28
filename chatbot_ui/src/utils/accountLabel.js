// What a signed-in person is, for display. users.role alone can't say it:
// every workspace owner carries role RESELLER — a real Reseller, an End User
// (DIRECT_CUSTOMER) and a reseller's customer (RESELLER_CUSTOMER) alike. The
// workspace's account type tells them apart.
export function accountKind(user) {
  if (!user) return 'TEAM_MEMBER';
  if (user.role === 'ADMIN') return 'SUPER_ADMIN';
  if (user.role === 'USER') return 'TEAM_MEMBER';
  if (user.accountType === 'RESELLER') return 'RESELLER';
  return 'END_USER';
}

export const ACCOUNT_KIND_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  RESELLER: 'Reseller',
  END_USER: 'End User',
  RESELLER_CUSTOMER: 'End User',
  TEAM_MEMBER: 'Team Member',
};

export const accountLabel = (user) => ACCOUNT_KIND_LABELS[accountKind(user)];
