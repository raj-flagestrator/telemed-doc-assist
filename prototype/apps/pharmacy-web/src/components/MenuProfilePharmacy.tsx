import { useApp } from "../context/AppContext";
import { MenuProfileRow } from "./MenuProfileRow";

export function MenuProfilePharmacy({ onNavigate }: { onNavigate: () => void }) {
  const { staffName, setStep } = useApp();

  function editProfile() {
    onNavigate();
    setStep("profile");
  }

  return <MenuProfileRow name={staffName || "Staff"} onEdit={editProfile} />;
}
