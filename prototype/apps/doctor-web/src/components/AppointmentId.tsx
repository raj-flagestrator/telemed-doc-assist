export function AppointmentId({
  id,
  compact,
}: {
  id?: string | null;
  compact?: boolean;
}) {
  if (!id) return null;
  if (compact) {
    return (
      <span className="appointment-id appointment-id-inline" title={id}>
        <code>{id}</code>
      </span>
    );
  }
  return (
    <p className="appointment-id" title={id}>
      Appointment ID: <code>{id}</code>
    </p>
  );
}