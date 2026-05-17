import { resolveTrackingId } from "../lib/trackingId";

export function PrescriptionTrackingId({
  prescriptionId,
  trackingId,
  prominent,
}: {
  prescriptionId?: string | null;
  trackingId?: string | null;
  prominent?: boolean;
}) {
  const id = resolveTrackingId(prescriptionId, trackingId);
  if (!id) return null;
  return (
    <p
      className={prominent ? "tracking-id tracking-id-prominent" : "tracking-id"}
      title={`Full prescription ID: ${prescriptionId ?? ""}`}
    >
      Prescription tracking ID: <code>{id}</code>
      <span className="tracking-hint"> — patient quotes this at the pharmacy</span>
    </p>
  );
}
