import ViewPlaceholder from './ViewPlaceholder.jsx';
export default function AttendanceView({ user }) {
  return (
    <ViewPlaceholder
      title="Daily Attendance"
      step={6}
      description="Check-in / check-out, daily status, and a team view for managers. One record per employee per day (Asia/Dhaka)."
      role={user.role}
    />
  );
}
