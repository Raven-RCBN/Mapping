// Stable keys are persisted in MappingUser.permissions[estateId][menu].
export const accessMenus = [
  ['imports','Document & data imports',['view','add']],
  ['map','Map workspace',['view','add','edit']],
  ['monthly','Monthly production',['view','add','edit']],
  ['names','Block names & parameters',['view','add','edit']],
  ['yearly','Yearly production',['view','add','edit']],
  ['wages','Wages',['view','add','edit']],
  ['vehicles','Vehicle details',['view']],
  ['materials','Material net issues',['view']],
  ['ledger','Block ledger',['view']],
  ['crop-receipts','Crop receipts',['view']],
  ['trial-balance','Trial balance',['view']],
  ['blocks','Block details',['view','edit']],
  ['harvesting','Harvesting',['view','add','edit']],
  ['field','Field activity',['view','add','edit']],
  ['comments','Block comments',['view','add','edit']],
  ['storage','Image storage',['view','edit','delete']],
  ['archive','Archive inventory',['view']],
  ['history','Map history',['view']],
  ['sources','Map sources',['view','add','edit']],
  ['decisions','Decision support & analytics',['view']],
  ['geospatial','Geospatial Analysis',['view','add']],
];
export const dataMenus = ['materials','ledger','crop-receipts','imports','blocks','harvesting','field','monthly','names','yearly','wages','vehicles','trial-balance','comments'];
export const isSuperuser = access => access?.isSuperuser === true;
export function permitted(access, estateId, menu, action = 'view') {
  if (isSuperuser(access)) return true;
  if (!access?.permissions) return false;
  const actions = access.permissions[estateId]?.[menu];
  return access.estateIds?.includes(estateId) && Array.isArray(actions) && actions.includes('view') && actions.includes(action);
}
export function publicAccess(access) {
  return { subject: access.subject, role: access.role, isSuperuser: isSuperuser(access),
    estateIds: access.estateIds, permissions: access.permissions || {}, revision: access.revision || 0 };
}
