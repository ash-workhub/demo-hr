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

// --- V2 Step 2: Attendance policy ---
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createPolicySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  effectiveDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid effective date'),
  workdays: z.array(z.number().int().min(0).max(6)).min(1, 'At least one workday required').default([1, 2, 3, 4, 5]),
  startTime: z.string().regex(TIME_REGEX, 'Invalid start time (HH:mm)').default('09:00'),
  endTime: z.string().regex(TIME_REGEX, 'Invalid end time (HH:mm)').default('17:00'),
  graceMinutes: z.number().int().min(0).max(120).default(15),
  halfDayMinMinutes: z.number().int().min(0).max(600).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
}).refine((d) => d.startTime < d.endTime, { message: 'Start time must be before end time', path: ['endTime'] });

export const updatePolicySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  workdays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  startTime: z.string().regex(TIME_REGEX).optional(),
  endTime: z.string().regex(TIME_REGEX).optional(),
  graceMinutes: z.number().int().min(0).max(120).optional(),
  halfDayMinMinutes: z.number().int().min(0).max(600).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine((d) => Object.keys(d).length > 0, 'At least one field is required');

// --- V2 Step 2: Holiday ---
export const createHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
  name: z.string().trim().min(1, 'Name is required').max(100),
  type: z.enum(['national', 'religious', 'company']).optional().default('company'),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const updateHolidaySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  type: z.enum(['national', 'religious', 'company']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine((d) => Object.keys(d).length > 0, 'At least one field is required');

// --- V2 Step 2: Employee schedule ---
export const createScheduleSchema = z.object({
  employeeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid employee id'),
  effectiveDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid effective date'),
  policyId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  customStartTime: z.string().regex(TIME_REGEX).optional().nullable(),
  customEndTime: z.string().regex(TIME_REGEX).optional().nullable(),
  customWorkdays: z.array(z.number().int().min(0).max(6)).optional().default([]),
  reason: z.string().trim().max(500).optional().default(''),
});

// --- V2 Step 2: Attendance correction ---
export const createCorrectionSchema = z.object({
  attendanceId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid attendance id'),
  field: z.enum(['checkInTime', 'checkOutTime', 'status']),
  correctedValue: z.string().min(1, 'Corrected value is required'),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500),
});

export const correctionActionSchema = z.object({
  action: z.enum(['confirm', 'reject', 'apply']),
  rejectReason: z.string().trim().max(500).optional().default(''),
});

// --- V2 Step 2: Attendance review ---
export const createReviewSchema = z.object({
  attendanceId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid attendance id'),
  flagReason: z.string().trim().min(1, 'Flag reason is required').max(200),
  flagSeverity: z.enum(['low', 'medium', 'high']).optional().default('medium'),
});

export const reviewActionSchema = z.object({
  verdict: z.enum(['acknowledged', 'dismissed', 'upheld']),
  note: z.string().trim().max(500).optional().default(''),
});

// --- V2 Step 3: Leave type configuration ---
export const createLeaveTypeSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(20).transform((s) => s.toLowerCase()),
  name: z.string().trim().min(1, 'Name is required').max(80),
  isUnlimited: z.boolean().optional().default(false),
  defaultQuota: z.number().int().min(0).max(365).optional().default(0),
  requiresDocumentation: z.boolean().optional().default(false),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const updateLeaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isUnlimited: z.boolean().optional(),
  defaultQuota: z.number().int().min(0).max(365).optional(),
  requiresDocumentation: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine((d) => Object.keys(d).length > 0, 'At least one field is required');

// --- V2 Step 3: Leave adjustment (audited ledger entry) ---
export const createAdjustmentSchema = z.object({
  employeeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid employee id'),
  leaveTypeCode: z.string().trim().min(1, 'Leave type code is required').max(20).transform((s) => s.toLowerCase()),
  year: z.number().int().min(2000).max(2100),
  amount: z.number().refine((v) => v !== 0, 'Amount must be non-zero (signed)'),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500),
});

// --- V2 Step 3: HR apply-on-behalf (extends createLeaveSchema) ---
export const createLeaveOnBehalfSchema = z.object({
  onBehalfOf: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid employee id'),
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
