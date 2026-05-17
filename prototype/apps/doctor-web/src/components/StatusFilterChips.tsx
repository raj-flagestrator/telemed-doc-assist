export interface StatusChipOption {
  id: string;
  label: string;
  count: number;
}

export function StatusFilterChips({
  chips,
  value,
  onChange,
  ariaLabel,
}: {
  chips: StatusChipOption[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="status-chips" role="tablist" aria-label={ariaLabel}>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="tab"
          aria-selected={value === chip.id}
          className={`status-chip status-chip-${chip.id} ${value === chip.id ? "active" : ""}`}
          onClick={() => onChange(chip.id)}
        >
          {chip.label} <span className="chip-count">{chip.count}</span>
        </button>
      ))}
    </div>
  );
}
