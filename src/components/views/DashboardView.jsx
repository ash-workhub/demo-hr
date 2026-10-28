import ViewPlaceholder from './ViewPlaceholder.jsx';
export default function DashboardView({ user }) {
  return (
    <ViewPlaceholder
      title="Dashboard"
      step={9}
      description="Role-aware KPIs and charts: attendance rate, pending approvals, leave usage, team status. Recharts visualizations."
      role={user.role}
    />
  );
}
