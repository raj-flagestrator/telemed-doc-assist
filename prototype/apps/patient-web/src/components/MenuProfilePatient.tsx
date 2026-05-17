import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { MenuProfileRow } from "./MenuProfileRow";

export function MenuProfilePatient({ onNavigate }: { onNavigate: () => void }) {
  const { token, setStep } = useApp();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .getPatientMe(token)
      .then((p) => setName(p.fullName ?? ""))
      .catch(() => setName(""))
      .finally(() => setLoading(false));
  }, [token]);

  function editProfile() {
    onNavigate();
    setStep("profile");
  }

  return <MenuProfileRow name={name} loading={loading} onEdit={editProfile} />;
}
