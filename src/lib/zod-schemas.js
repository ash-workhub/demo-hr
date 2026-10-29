// src/lib/zod-schemas.js
// Shared Zod schemas for server-side input validation.
// Used by every API route that accepts a body — never trust the client.

import { z } from 'zod';

// --- Employee ---
export const EMPLOYEE_ROLES = ['employee', 'manager', 'hr', 'admin'];

export const createEmployeeSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  phone: z.string().trim().max(20).optional().default(''),
  department: z.string().trim().min(1, 'Department is required').max(80),
  designation: z.string().trim().min(1, 'Designation is required').max(80),
  managerId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid manager id').optional().nullable(),
  role: z.enum(EMPLOYEE_ROLES).default('employee'),
  joinDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid join date'),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color').optional().default('#6b7280'),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const updateEmployeeSchema = z.object({
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(20).optional(),
  department: z.string().trim().min(1).max(80).optional(),
  designation: z.string().trim().min(1).max(80).optional(),
  managerId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  role: z.enum(EMPLOYEE_ROLES).optional(),
  joinDate: z.string().refine((v) => !isNaN(Date.parse(v))).optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field is required');

// --- Leave (used in Step 7, defined here for cohesion) ---
export const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid'];

export const createLeaveSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  startDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid start date'),
  endDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid end date'),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
  isHalfDay: z.boolean().optional().default(false),
}).refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
  message: 'End date must be on or after start date',
  path: ['endDate'],
}).refine((data) => !data.isHalfDay || new Date(data.startDate).toDateString() === new Date(data.endDate).toDateString(), {
  message: 'Half-day leave requires start and end date to be the same day',
  path: ['endDate'],
});

export const leaveActionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(500).optional().default(''),
});

// --- Attendance (Step 6) ---
export const attendanceActionSchema = z.object({
  action: z.enum(['check-in', 'check-out']),
  notes: z.string().trim().max(500).optional().default(''),
});

// --- V2 Step 1: Organization reference records ---

export const createBranchSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(20).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1, 'Name is required').max(80),
  address: z.string().trim().max(200).optional().default(''),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const updateBranchSchema = z.object({
  code: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  address: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export const createDepartmentSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(20).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1, 'Name is required').max(80),
  branchId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid branch id').optional().nullable(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const updateDepartmentSchema = z.object({
  code: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  branchId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export const createDesignationSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(20).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1, 'Name is required').max(80),
  departmentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid department id').optional().nullable(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const updateDesignationSchema = z.object({
  code: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  departmentId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field is required');

// --- V2 Step 1: Employee assignment (effective-dated movement) ---
export const createAssignmentSchema = z.object({
  employeeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid employee id'),
  branchId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  departmentId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  designationId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  managerId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  effectiveDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid effective date'),
  reason: z.string().trim().max(500).optional().default(''),
}).refine((data) => data.effectiveDate, { message: 'Effective date is required', path: ['effectiveDate'] });

// --- Helpers ---
/** Validates `body` against a Zod schema; returns { data } or { error }. */
export function validate(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) return { data: result.data };
  // Flatten Zod errors into a { field: message } map.
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    errors[key] = issue.message;
  }
  return { error: errors };
}
