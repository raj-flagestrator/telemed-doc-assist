import type { RoutingEvent } from "../api";

export function RoutingTrail({ history }: { history?: RoutingEvent[] }) {
  if (!history?.length) return null;

  return (
    <div className="panel routing-trail">
      <h3>Pharmacy routing trail</h3>
      <ol className="routing-events">
        {history.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <strong>{e.pharmacyName}</strong>
            <span className="sub"> · {e.type.replace(/_/g, " ")}</span>
            <p className="sub">{e.reason}</p>
            {e.shortageMedications?.length ? (
              <p className="sub">Shortage: {e.shortageMedications.join(", ")}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
