import ViewPlaceholder from './ViewPlaceholder.jsx';
export default function ApprovalsView({ user }) {
  return (
    <ViewPlaceholder
      title="Approvals"
      step={7}
      description="Manager approves first, then HR finalizes. Admins can see all. Each decision is logged in the audit trail."
      role={user.role}
    />
  );
}
