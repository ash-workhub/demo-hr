// src/app/page.jsx
// Root page. Server component that branches on session:
//   - no session  -> render login form
//   - session     -> render the role-aware app shell (Step 4)
import { getSessionUser, getSessionEmployee } from '@/lib/auth-helpers.js';
import { connectDB } from '@/lib/db/index.js';
import LoginClient from '@/components/LoginClient.jsx';
import AppShell from '@/components/AppShell.jsx';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@feghr.demo' },
  { label: 'HR', email: 'hr@feghr.demo' },
  { label: 'Eng Mgr', email: 'mgr.eng@feghr.demo' },
  { label: 'Sales Mgr', email: 'mgr.sales@feghr.demo' },
  { label: 'Employee', email: 'emp1@feghr.demo' },
];

export default async function Home() {
  const user = await getSessionUser();

  if (!user) {
    return <LoginClient demoAccounts={DEMO_ACCOUNTS} />;
  }

  // Authenticated — render the app shell. Pass a plain-serializable user + employee.
  await connectDB();
  const employee = await getSessionEmployee();

  // Strip non-serializable fields (Mongoose lean returns plain objects, but be safe).
  const safeUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId,
    active: user.active,
    image: user.image,
  };
  const safeEmployee = employee
    ? {
        id: employee._id.toString(),
        employeeId: employee.employeeId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        department: employee.department,
        designation: employee.designation,
        role: employee.role,
        managerId: employee.managerId ? employee.managerId.toString() : null,
        avatarColor: employee.avatarColor,
        joinDate: employee.joinDate ? new Date(employee.joinDate).toISOString() : null,
      }
    : null;

  return <AppShell user={safeUser} employee={safeEmployee} />;
}
