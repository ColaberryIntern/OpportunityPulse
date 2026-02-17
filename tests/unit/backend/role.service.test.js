// Mock models before importing service
jest.mock('../../../backend/src/models', () => {
  const mockUserRole = {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
  };
  const mockUser = {
    findByPk: jest.fn(),
    count: jest.fn(),
  };
  return { UserRole: mockUserRole, User: mockUser };
});

const { UserRole, User } = require('../../../backend/src/models');
const roleService = require('../../../backend/src/roleManager/role.service');

describe('RoleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listRoles', () => {
    it('should return all roles', async () => {
      const mockRoles = [
        { id: 1, roleName: 'admin', description: 'Full access' },
        { id: 2, roleName: 'consultant', description: 'Standard user' },
        { id: 3, roleName: 'auditor', description: 'Compliance access' },
        { id: 4, roleName: 'devops', description: 'Infrastructure access' },
      ];
      UserRole.findAll.mockResolvedValue(mockRoles);

      const result = await roleService.listRoles();

      expect(result).toEqual(mockRoles);
      expect(UserRole.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no roles exist', async () => {
      UserRole.findAll.mockResolvedValue([]);

      const result = await roleService.listRoles();

      expect(result).toEqual([]);
    });
  });

  describe('assignRole', () => {
    it('should assign a role to a user and return updated user', async () => {
      const mockRole = { id: 3, roleName: 'auditor', description: 'Compliance access' };
      const mockUser = {
        id: 5,
        email: 'user@example.com',
        roleId: 2,
        save: jest.fn(),
        reload: jest.fn(),
        toSafeJSON: jest.fn().mockReturnValue({
          id: 5,
          email: 'user@example.com',
          roleId: 3,
          role: { id: 3, roleName: 'auditor' },
        }),
      };

      UserRole.findByPk.mockResolvedValue(mockRole);
      User.findByPk.mockResolvedValue(mockUser);

      const result = await roleService.assignRole({ userId: 5, roleId: 3 });

      expect(mockUser.roleId).toBe(3);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.reload).toHaveBeenCalled();
      expect(result).toHaveProperty('email', 'user@example.com');
    });

    it('should throw 404 when user not found', async () => {
      UserRole.findByPk.mockResolvedValue({ id: 2, roleName: 'consultant' });
      User.findByPk.mockResolvedValue(null);

      await expect(roleService.assignRole({ userId: 999, roleId: 2 }))
        .rejects.toMatchObject({ statusCode: 404, message: expect.stringContaining('User') });
    });

    it('should throw 404 when role not found', async () => {
      UserRole.findByPk.mockResolvedValue(null);

      await expect(roleService.assignRole({ userId: 1, roleId: 999 }))
        .rejects.toMatchObject({ statusCode: 404, message: expect.stringContaining('Role') });
    });

    it('should prevent removing the last admin', async () => {
      const mockAdminRole = { id: 1, roleName: 'admin', description: 'Full access' };
      const mockUser = {
        id: 1,
        email: 'admin@example.com',
        roleId: 1,
        role: mockAdminRole,
        save: jest.fn(),
        reload: jest.fn(),
        toSafeJSON: jest.fn(),
      };
      const mockNewRole = { id: 2, roleName: 'consultant', description: 'Standard user' };

      // The role being assigned is not admin
      UserRole.findByPk.mockResolvedValue(mockNewRole);
      // The user is currently an admin
      User.findByPk.mockResolvedValue(mockUser);
      // Load user's current role
      UserRole.findOne.mockResolvedValue(mockAdminRole);
      // Only 1 admin left
      User.count.mockResolvedValue(1);

      await expect(roleService.assignRole({ userId: 1, roleId: 2 }))
        .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('last admin') });
    });

    it('should allow reassigning an admin when other admins exist', async () => {
      const mockAdminRole = { id: 1, roleName: 'admin', description: 'Full access' };
      const mockNewRole = { id: 2, roleName: 'consultant', description: 'Standard user' };
      const mockUser = {
        id: 1,
        email: 'admin@example.com',
        roleId: 1,
        role: mockAdminRole,
        save: jest.fn(),
        reload: jest.fn(),
        toSafeJSON: jest.fn().mockReturnValue({
          id: 1,
          email: 'admin@example.com',
          roleId: 2,
          role: { id: 2, roleName: 'consultant' },
        }),
      };

      UserRole.findByPk.mockResolvedValue(mockNewRole);
      User.findByPk.mockResolvedValue(mockUser);
      UserRole.findOne.mockResolvedValue(mockAdminRole);
      // 2 admins exist, safe to reassign
      User.count.mockResolvedValue(2);

      const result = await roleService.assignRole({ userId: 1, roleId: 2 });

      expect(mockUser.save).toHaveBeenCalled();
      expect(result).toHaveProperty('email', 'admin@example.com');
    });

    it('should succeed idempotently when assigning the same role', async () => {
      const mockRole = { id: 2, roleName: 'consultant', description: 'Standard user' };
      const mockUser = {
        id: 5,
        email: 'user@example.com',
        roleId: 2,
        save: jest.fn(),
        reload: jest.fn(),
        toSafeJSON: jest.fn().mockReturnValue({
          id: 5,
          email: 'user@example.com',
          roleId: 2,
        }),
      };

      UserRole.findByPk.mockResolvedValue(mockRole);
      User.findByPk.mockResolvedValue(mockUser);

      const result = await roleService.assignRole({ userId: 5, roleId: 2 });

      // Should still succeed (idempotent)
      expect(result).toHaveProperty('email', 'user@example.com');
    });
  });

  describe('updateRole', () => {
    it('should update role description', async () => {
      const mockRole = {
        id: 2,
        roleName: 'consultant',
        description: 'Old description',
        save: jest.fn(),
        toJSON: jest.fn().mockReturnValue({
          id: 2,
          roleName: 'consultant',
          description: 'Updated description',
        }),
      };
      UserRole.findByPk.mockResolvedValue(mockRole);

      const result = await roleService.updateRole(2, { description: 'Updated description' });

      expect(mockRole.description).toBe('Updated description');
      expect(mockRole.save).toHaveBeenCalled();
      expect(result).toHaveProperty('description', 'Updated description');
    });

    it('should throw 404 when role not found', async () => {
      UserRole.findByPk.mockResolvedValue(null);

      await expect(roleService.updateRole(999, { description: 'New desc' }))
        .rejects.toMatchObject({ statusCode: 404, message: expect.stringContaining('Role') });
    });

    it('should not allow changing the role name', async () => {
      const mockRole = {
        id: 2,
        roleName: 'consultant',
        description: 'Standard user',
        save: jest.fn(),
        toJSON: jest.fn().mockReturnValue({
          id: 2,
          roleName: 'consultant',
          description: 'Standard user',
        }),
      };
      UserRole.findByPk.mockResolvedValue(mockRole);

      const result = await roleService.updateRole(2, { description: 'Updated', roleName: 'hacker' });

      // roleName should NOT change
      expect(mockRole.roleName).toBe('consultant');
      expect(result.roleName).toBe('consultant');
    });
  });
});
