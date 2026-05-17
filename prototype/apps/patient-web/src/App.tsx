import { useApp } from "./context/AppContext";

import { StepLogin } from "./steps/StepLogin";

import { StepProfile } from "./steps/StepProfile";

import { StepTriage } from "./steps/StepTriage";

import { StepBooking } from "./steps/StepBooking";

import { StepConsult } from "./steps/StepConsult";

import { StepPrescription } from "./steps/StepPrescription";

import { StepDelivery } from "./steps/StepDelivery";

import { StepComplete } from "./steps/StepComplete";

import { StepMyCare } from "./steps/StepMyCare";

import { StepCareDetail } from "./steps/StepCareDetail";

import { AppMenuDrawer, AppMenuHeaderButton, useAppMenu } from "./context/AppMenuContext";

import {

  NotificationBellHeaderButton,

  NotificationsProvider,

  useNotifications,

} from "./context/NotificationsContext";

import { PharmacyNotificationsPanel } from "./components/PharmacyNotifications";
import { SignOutIconButton } from "./components/SignOutIconButton";



const STEPS = [

  "login",

  "myCare",

  "careDetail",

  "profile",

  "triage",

  "booking",

  "consult",

  "prescription",

  "delivery",

  "complete",

] as const;



const PATH_STEPS = STEPS.filter((s) => s !== "login" && s !== "myCare" && s !== "careDetail");



function PatientAppContent() {

  const { config, step, token, setStep, signOut } = useApp();

  const menu = useAppMenu();

  const notifications = useNotifications();



  const stepIndex = PATH_STEPS.indexOf(step as (typeof PATH_STEPS)[number]);
  const brandName = config?.name ?? "MediSphere AI";
  const brandTagline = config?.tagline ?? "AI POWERED. HUMAN CENTERED.";
  const brandGoesToMyCare = step !== "login" && !!token;

  return (

    <div className="app-shell">

      <header className="brand">

        <div className="brand-row">
          <div className="brand-title-wrap">
            {brandGoesToMyCare ? (
              <button
                type="button"
                className="brand-home"
                onClick={() => setStep("myCare")}
                aria-label="Go to My care"
              >
                <h1>{brandName}</h1>
                <p>{brandTagline}</p>
              </button>
            ) : (
              <>
                <h1>{brandName}</h1>
                <p>{brandTagline}</p>
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

        {PATH_STEPS.map((s, i) => (

          <div

            key={s}

            className={`step-dot ${i < stepIndex ? "done" : ""} ${i === stepIndex ? "active" : ""}`}

          />

        ))}

      </div>



      {step === "login" && <StepLogin />}

      {step === "myCare" && <StepMyCare />}

      {step === "careDetail" && <StepCareDetail />}

      {step === "profile" && <StepProfile />}

      {step === "triage" && <StepTriage />}

      {step === "booking" && <StepBooking />}

      {step === "consult" && <StepConsult />}

      {step === "prescription" && <StepPrescription />}

      {step === "delivery" && <StepDelivery />}

      {step === "complete" && <StepComplete />}

      {token ? <AppMenuDrawer /> : null}

    </div>

  );

}



export default function App() {

  const { loading, token } = useApp();



  if (loading) {

    return (

      <div className="app-shell">

        <p>Loading…</p>

      </div>

    );

  }



  return (

    <NotificationsProvider
      token={token}
      panel={token ? <PharmacyNotificationsPanel token={token} /> : <p className="sub">Sign in to view notifications.</p>}
    >

      <PatientAppContent />

    </NotificationsProvider>

  );

}


