export type KpiTileProps = {
  id: string;
  label: string;
  value: number;
  selected?: boolean;
  onClick?: () => void;
};

export function KpiStrip({ tiles }: { tiles: KpiTileProps[] }) {
  return (
    <div className="kpi-strip" role="list" aria-label="Summary">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          role="listitem"
          className={`kpi-tile${tile.selected ? " kpi-tile--selected" : ""}`}
          aria-pressed={tile.selected ?? false}
          onClick={tile.onClick}
          disabled={!tile.onClick}
        >
          <span className="kpi-tile__value">{tile.value}</span>
          <span className="kpi-tile__label">{tile.label}</span>
        </button>
      ))}
    </div>
  );
}
