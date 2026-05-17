import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { MenuProfileRow } from "./MenuProfileRow";

export function MenuProfileDoctor({ onNavigate }: { onNavigate: () => void }) {
  const { token, doctorName, setStep } = useApp();
  const [name, setName] = useState(doctorName);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    setName(doctorName);
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .getMe(token)
      .then((me) => setName(me.displayName || doctorName))
      .catch(() => setName(doctorName))
      .finally(() => setLoading(false));
  }, [token, doctorName]);

  function editProfile() {
    onNavigate();
    setStep("profile");
  }

  return <MenuProfileRow name={name || doctorName} loading={loading} onEdit={editProfile} />;
}
