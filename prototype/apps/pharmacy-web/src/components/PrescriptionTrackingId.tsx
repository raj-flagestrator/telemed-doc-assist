import { resolveTrackingId } from "../lib/trackingId";

export function PrescriptionTrackingId({
  prescriptionId,
  trackingId,
  prominent,
  compact,
}: {
  prescriptionId?: string | null;
  trackingId?: string | null;
  prominent?: boolean;
  compact?: boolean;
}) {
  const id = resolveTrackingId(prescriptionId, trackingId);
  if (!id) return null;
  if (compact) {
    return (
      <span
        className="tracking-id tracking-id-inline"
        title={`Prescription UUID: ${prescriptionId ?? ""}`}
      >
        <code>{id}</code>
      </span>
    );
  }
  return (
    <p
      className={prominent ? "tracking-id tracking-id-prominent" : "tracking-id"}
      title={`Prescription UUID: ${prescriptionId ?? ""}`}
    >
      Tracking ID: <code>{id}</code>
    </p>
  );
}
