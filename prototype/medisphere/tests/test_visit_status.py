"""Tests for visit status and patient-visible prescriptions."""

from medisphere.visit_status import (
    prescription_is_patient_visible,
    visit_status,
)


def test_awaiting_rx_when_consult_done_no_prescription():
    appt = {"status": "booked"}
    consult = {"status": "completed"}
    assert visit_status(appt, consult, None) == "awaiting_rx"
    assert not prescription_is_patient_visible(None)


def test_completed_only_when_prescription_signed():
    appt = {"status": "booked"}
    consult = {"status": "completed"}
    draft = {"status": "draft", "id": "x"}
    assert visit_status(appt, consult, draft) == "awaiting_rx"
    signed = {"status": "signed", "id": "x"}
    assert visit_status(appt, consult, signed) == "completed"
    routed = {"status": "routed", "id": "x"}
    assert visit_status(appt, consult, routed) == "completed"
    assert prescription_is_patient_visible(signed)
    assert prescription_is_patient_visible(routed)
    declined = {"status": "pharmacy_declined", "id": "x"}
    assert visit_status(appt, consult, declined) == "completed"
    assert prescription_is_patient_visible(declined)
    fulfilled = {"status": "fulfilled", "id": "x"}
    assert visit_status(appt, consult, fulfilled) == "completed"
    assert prescription_is_patient_visible(fulfilled)
