export function AppointmentId({ id }: { id?: string | null }) {
  if (!id) return null;
  return (
    <p className="appointment-id" title={id}>
      Appointment ID: <code>{id}</code>
    </p>
  );
}
