import { useApp } from "./context/AppContext";

import { StepLogin } from "./steps/StepLogin";

import { StepDashboard } from "./steps/StepDashboard";

import { StepVisit } from "./steps/StepVisit";

import { StepConsult } from "./steps/StepConsult";

import { StepPrescribe } from "./steps/StepPrescribe";

import { StepDone } from "./steps/StepDone";

import { StepProfile } from "./steps/StepProfile";

import { AppMenuDrawer, AppMenuHeaderButton, useAppMenu } from "./context/AppMenuContext";

import {

  NotificationBellHeaderButton,

  NotificationsProvider,

  useNotifications,

} from "./context/NotificationsContext";

import { ShortageAlertsPanel } from "./components/ShortageAlerts";
import { SignOutIconButton } from "./components/SignOutIconButton";



const STEPS = ["login", "dashboard", "profile", "visit", "consult", "prescribe", "done"] as const;

const PATH_STEPS = STEPS.filter((s) => s !== "login" && s !== "profile");



function DoctorAppContent() {

  const { config, step, token, setStep, doctorName, specialty, signOut } = useApp();
  const brandGoesHome = step !== "login" && !!token;

  const menu = useAppMenu();

  const notifications = useNotifications();



  const stepIndex = PATH_STEPS.indexOf(step as (typeof PATH_STEPS)[number]);



  return (

    <div className="app-shell doctor-shell">

      <header className="brand">

        <div className="brand-row">

          <div className="brand-title-wrap">
            <p className="portal-badge">Doctor portal</p>
            {brandGoesHome ? (
              <button
                type="button"
                className="brand-home"
                onClick={() => setStep("dashboard")}
                aria-label="Go to schedule"
              >
                <h1>{config?.name ?? "MediSphere AI"}</h1>
                {doctorName ? (
                  <p className="sub">
                    {doctorName}
                    {specialty ? ` · ${specialty}` : ""}
                  </p>
                ) : (
                  <p className="sub">{config?.tagline ?? "Clinical workflow"}</p>
                )}
              </button>
            ) : (
              <>
                <h1>{config?.name ?? "MediSphere AI"}</h1>
                {doctorName && step !== "login" ? (
                  <p className="sub">
                    {doctorName}
                    {specialty ? ` · ${specialty}` : ""}
                  </p>
                ) : (
                  <p className="sub">{config?.tagline ?? "Clinical workflow"}</p>
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

      {step === "visit" && <StepVisit />}

      {step === "consult" && <StepConsult />}

      {step === "prescribe" && <StepPrescribe />}

      {step === "done" && <StepDone />}

      {token ? <AppMenuDrawer /> : null}

    </div>

  );

}



export default function App() {

  const { loading, token } = useApp();



  if (loading) {

    return (

      <div className="app-shell doctor-shell">

        <p>Loading…</p>

      </div>

    );

  }



  return (

    <NotificationsProvider
      token={token}
      panel={token ? <ShortageAlertsPanel token={token} /> : <p className="sub">Sign in to view notifications.</p>}
    >

      <DoctorAppContent />

    </NotificationsProvider>

  );

}


