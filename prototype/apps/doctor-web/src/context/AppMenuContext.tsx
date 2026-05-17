import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { FilterPanel } from "../components/FilterPanel";
import { MenuPreferences } from "../components/MenuPreferences";
import { MenuProfileDoctor } from "../components/MenuProfileDoctor";

type FilterRegistration = {
  content: ReactNode;
  isActive: boolean;
};

type AppMenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
  filters: FilterRegistration | null;
  registerFilters: (reg: FilterRegistration | null) => void;
  showBadge: boolean;
};

const AppMenuContext = createContext<AppMenuContextValue | null>(null);

export function AppMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<FilterRegistration | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const registerFilters = useCallback((reg: FilterRegistration | null) => {
    setFilters(reg);
  }, []);

  const showBadge = Boolean(filters?.isActive);

  const value = useMemo(
    () => ({ open, setOpen, toggle, close, filters, registerFilters, showBadge }),
    [open, filters, close, toggle, registerFilters, showBadge]
  );

  return <AppMenuContext.Provider value={value}>{children}</AppMenuContext.Provider>;
}

export function useAppMenu() {
  const ctx = useContext(AppMenuContext);
  if (!ctx) throw new Error("useAppMenu must be used within AppMenuProvider");
  return ctx;
}

export function useRegisterMenuFilters(
  content: ReactNode | null,
  isActive: boolean,
  enabled = true
) {
  const { registerFilters } = useAppMenu();

  useEffect(() => {
    if (!enabled || !content) {
      registerFilters(null);
      return () => registerFilters(null);
    }
    registerFilters({ content, isActive });
    return () => registerFilters(null);
  }, [content, isActive, enabled, registerFilters]);
}

export function AppMenuHeaderButton({ onBeforeOpen }: { onBeforeOpen?: () => void }) {
  const { open, toggle, showBadge } = useAppMenu();

  return (
    <button
      type="button"
      className={`btn-filter-menu ${open ? "open" : ""}`}
      aria-label="Menu"
      aria-expanded={open}
      onClick={() => {
        onBeforeOpen?.();
        toggle();
      }}
    >
      <span className="filter-menu-icon" aria-hidden />
      {showBadge ? <span className="filter-menu-badge" aria-hidden /> : null}
    </button>
  );
}

export function AppMenuDrawer() {
  const { open, close, filters } = useAppMenu();

  return (
    <FilterPanel open={open} onClose={close} title="Menu">
      <MenuProfileDoctor onNavigate={close} />
      <MenuPreferences />
      {filters ? (
        <section className="menu-section menu-section-filters">
          <h3 className="menu-section-title">Filters</h3>
          {filters.content}
        </section>
      ) : null}
    </FilterPanel>
  );
}
