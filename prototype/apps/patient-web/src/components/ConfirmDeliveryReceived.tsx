import { useState } from "react";
import { api } from "../api";

type Props = {
  token: string;
  deliveryId: string;
  prescriptionId?: string;
  alreadyComplete?: boolean;
  onConfirmed?: () => void;
  onError?: (message: string) => void;
};

export function ConfirmDeliveryReceived({
  token,
  deliveryId,
  alreadyComplete,
  onConfirmed,
  onError,
}: Props) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(!!alreadyComplete);

  async function confirm() {
    if (!checked || busy || done) return;
    setBusy(true);
    try {
      await api.confirmDeliveryReceived(token, deliveryId);
      setDone(true);
      onConfirmed?.();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not confirm delivery");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="care-meta confirm-delivery-done">
        You confirmed this prescription was delivered. This visit is complete.
      </p>
    );
  }

  return (
    <div className="confirm-delivery-panel">
      <label className="confirm-delivery-label">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          disabled={busy}
        />
        <span>I confirm I have received my medicines</span>
      </label>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!checked || busy}
        onClick={() => void confirm()}
      >
        {busy ? "Saving…" : "Mark prescription complete"}
      </button>
    </div>
  );
}
