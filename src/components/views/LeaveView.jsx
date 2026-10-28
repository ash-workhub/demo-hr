import ViewPlaceholder from './ViewPlaceholder.jsx';
export default function LeaveView({ user }) {
  return (
    <ViewPlaceholder
      title="Leave Requests"
      step={7}
      description="Apply for leave, view your requests and balance, and track status through the Manager → HR approval chain."
      role={user.role}
    />
  );
}
