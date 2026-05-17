import { AppointmentId } from "./AppointmentId";
import { PrescriptionTrackingId } from "./PrescriptionTrackingId";

/** Appointment + prescription tracking IDs shown together for pharmacy and care records. */
export function VisitReferenceIds({
  appointmentId,
  prescriptionId,
  trackingId,
  prominent,
}: {
  appointmentId?: string | null;
  prescriptionId?: string | null;
  trackingId?: string | null;
  prominent?: boolean;
}) {
  const hasAppointment = Boolean(appointmentId);
  const hasRx = Boolean(prescriptionId || trackingId);
  if (!hasAppointment && !hasRx) return null;

  return (
    <div className={prominent ? "visit-refs visit-refs-prominent" : "visit-refs"}>
      {hasAppointment ? <AppointmentId id={appointmentId} /> : null}
      {hasRx ? (
        <PrescriptionTrackingId
          prescriptionId={prescriptionId}
          trackingId={trackingId}
          prominent={prominent}
        />
      ) : null}
    </div>
  );
}
