import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';

// Phase 12 — frontend permission gate.
//
// Usage:
//   <Permitted name="queue.cancel">
//     <button onClick={cancel}>Cancel</button>
//   </Permitted>
//
// Or with a fallback:
//   <Permitted name="approval.approve" fallback={<span className="text-gray-400">view-only</span>}>
//     <button>Approve</button>
//   </Permitted>
//
// IMPORTANT: this hides UI affordances the user isn't authorized for. It is
// NOT a security boundary — every backend handler must enforce its own RBAC
// via the requirePermission middleware. The fail-closed behavior in
// usePermissions guarantees that a user with no permission cache sees only
// the most-restrictive UI.

function Permitted({ name, anyOf, allOf, role, minRoleLevel, fallback = null, children }) {
  const { can, permissions, role: currentRole, role_level: currentLevel, loading } = usePermissions();
  if (loading) return null;

  let allowed = true;
  if (name) allowed = allowed && can(name);
  if (Array.isArray(anyOf) && anyOf.length) {
    allowed = allowed && anyOf.some((p) => can(p));
  }
  if (Array.isArray(allOf) && allOf.length) {
    allowed = allowed && allOf.every((p) => can(p));
  }
  if (role) {
    allowed = allowed && currentRole === role;
  }
  if (minRoleLevel != null) {
    allowed = allowed && Number(currentLevel) >= Number(minRoleLevel);
  }
  if (!allowed) return fallback;
  return <>{children}</>;
}

export default Permitted;
