import { useApp } from "./context/AppContext";
import { StepLogin } from "./steps/StepLogin";
import { StepDashboard } from "./steps/StepDashboard";
import { StepOrder } from "./steps/StepOrder";
import { StepDone } from "./steps/StepDone";
import { StepProfile } from "./steps/StepProfile";
import { AppMenuDrawer, AppMenuHeaderButton, useAppMenu } from "./context/AppMenuContext";
import {
  NotificationBellHeaderButton,
  NotificationsProvider,
  useNotifications,
} from "./context/NotificationsContext";
import { PharmacyNotificationsPanel } from "./components/PharmacyNotifications";
import { SignOutIconButton } from "./components/SignOutIconButton";

const STEPS = ["login", "dashboard", "profile", "order", "done"] as const;
const PATH_STEPS = STEPS.filter((s) => s !== "login" && s !== "profile");

function PharmacyAppContent() {
  const { config, step, token, setStep, staffName, pharmacyName, signOut } = useApp();
  const brandGoesHome = step !== "login" && !!token;
  const menu = useAppMenu();
  const notifications = useNotifications();

  const stepIndex = PATH_STEPS.indexOf(step as (typeof PATH_STEPS)[number]);

  return (
    <div className="app-shell pharmacy-shell">
      <header className="brand">
        <div className="brand-row">
          <div className="brand-title-wrap">
            <p className="portal-badge">Pharmacy portal</p>
            {brandGoesHome ? (
              <button
                type="button"
                className="brand-home"
                onClick={() => setStep("dashboard")}
                aria-label="Go to dashboard"
              >
                <h1>{config?.name ?? "MediSphere AI"}</h1>
                {staffName ? (
                  <p className="sub">
                    {staffName}
                    {pharmacyName ? ` · ${pharmacyName}` : ""}
                  </p>
                ) : (
                  <p className="sub">{config?.tagline ?? "Fulfillment & dispatch"}</p>
                )}
              </button>
            ) : (
              <>
                <h1>{config?.name ?? "MediSphere AI"}</h1>
                {staffName && step !== "login" ? (
                  <p className="sub">
                    {staffName}
                    {pharmacyName ? ` · ${pharmacyName}` : ""}
                  </p>
                ) : (
                  <p className="sub">{config?.tagline ?? "Fulfillment & dispatch"}</p>
                )}
              </>
            )}
          </div>
          {step !== "login" && (
            <div className="header-actions">
              {token ? (
                <NotificationBellHeaderButton onBeforeOpen={menu.close} />
              ) : null}
              {token ? (
                <AppMenuHeaderButton onBeforeOpen={notifications.close} />
              ) : null}
              <SignOutIconButton onClick={signOut} />
            </div>
          )}
        </div>
      </header>

      <div className="stepper" aria-hidden>
        {PATH_STEPS.map((s) => {
          const idx = PATH_STEPS.indexOf(s);
          return (
            <div
              key={s}
              className={`step-dot ${idx < stepIndex ? "done" : ""} ${idx === stepIndex ? "active" : ""}`}
            />
          );
        })}
      </div>

      {step === "login" && <StepLogin />}
      {step === "dashboard" && <StepDashboard />}
      {step === "profile" && <StepProfile />}
      {step === "order" && <StepOrder />}
      {step === "done" && <StepDone />}
      {token ? <AppMenuDrawer /> : null}
    </div>
  );
}

export default function App() {
  const { loading, token } = useApp();

  if (loading) {
    return (
      <div className="app-shell pharmacy-shell">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <NotificationsProvider
      token={token}
      panel={
        token ? (
          <PharmacyNotificationsPanel token={token} />
        ) : (
          <p className="sub">Sign in to view notifications.</p>
        )
      }
    >
      <PharmacyAppContent />
    </NotificationsProvider>
  );
}
