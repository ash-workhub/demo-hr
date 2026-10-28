import ViewPlaceholder from './ViewPlaceholder.jsx';
export default function NotificationsView({ user }) {
  return (
    <ViewPlaceholder
      title="Notifications"
      step={8}
      description="In-app notifications for leave submissions, approvals, rejections, and reminders. Mark-as-read and deep links."
      role={user.role}
    />
  );
}
