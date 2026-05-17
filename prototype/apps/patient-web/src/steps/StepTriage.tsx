import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import {
  assessSymptoms,
  assessmentMessages,
  chatReply,
  greetingMessage,
  mergeSymptoms,
  newMessageId,
  SYMPTOM_CHIPS,
  type ChatMessage,
} from "../lib/triageChat";

export function StepTriage() {
  const { token, setStep, updateJourney, setError, clearError, error } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .triageGreeting()
      .then((g) => setMessages([{ id: newMessageId(), role: "assistant", text: g.message }]))
      .catch(() =>
        setMessages([{ id: newMessageId(), role: "assistant", text: greetingMessage() }])
      );
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatBusy]);

  async function sendTurn(userText: string) {
    if (!token || !userText.trim() || chatBusy) return;
    clearError();
    const text = userText.trim();
    const nextSymptoms = mergeSymptoms(symptoms, [text]);
    setSymptoms(nextSymptoms);
    setMessages((prev) => [...prev, { id: newMessageId(), role: "user", text }]);
    setChatBusy(true);
    try {
      // Local rules first — stale ai-triage-service must not override chip mapping (e.g. ear pain → chest).
      const reply = chatReply(nextSymptoms, text);
      void api.triageChat(token, nextSymptoms, text).catch(() => {});
      setMessages((prev) => [...prev, { id: newMessageId(), role: "assistant", text: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach triage assistant");
    } finally {
      setChatBusy(false);
    }
  }

  function onChipClick(label: string) {
    if (symptoms.map((s) => s.toLowerCase()).includes(label.toLowerCase())) {
      return;
    }
    void sendTurn(label);
  }

  function onSubmitInput(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input;
    setInput("");
    void sendTurn(text);
  }

  async function assess() {
    if (!token || symptoms.length === 0) return;
    clearError();
    setBusy(true);
    try {
      const res = assessSymptoms(symptoms);
      setResult(res);
      updateJourney({ triageSpecialty: String(res.recommendedSpecialty ?? "General Practice") });
      void api.triage(token, symptoms).catch(() => {});
      setMessages((prev) => [
        ...prev,
        { id: newMessageId(), role: "user", text: "Please assess my symptoms." },
        ...assessmentMessages(res).map((text) => ({
          id: newMessageId(),
          role: "assistant" as const,
          text,
        })),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Triage failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card triage-card">
      <h2>AI symptom checker</h2>
      <p className="sub">Chat with the triage assistant — advisory only, not a diagnosis.</p>
      {error && <div className="alert">{error}</div>}

      <div className="chat-panel" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble chat-${m.role}`}>
            {m.role === "assistant" && <span className="chat-avatar">AI</span>}
            <p>{m.text}</p>
          </div>
        ))}
        {chatBusy && (
          <div className="chat-bubble chat-assistant chat-typing">
            <span className="chat-avatar">AI</span>
            <p>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </p>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <p className="chip-label">Quick symptom labels</p>
      <div className="chip-row">
        {SYMPTOM_CHIPS.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip ${symptoms.map((x) => x.toLowerCase()).includes(s) ? "selected" : ""}`}
            onClick={() => onChipClick(s)}
            disabled={chatBusy || !!result}
          >
            {s}
          </button>
        ))}
      </div>

      {!result && (
        <form className="chat-compose" onSubmit={onSubmitInput}>
          <input
            type="text"
            placeholder="Describe a symptom in your own words…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={chatBusy || busy}
            aria-label="Symptom message"
          />
          <button type="submit" className="btn btn-send" disabled={chatBusy || !input.trim()}>
            Send
          </button>
        </form>
      )}

      {!result && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || chatBusy || symptoms.length === 0}
          onClick={assess}
        >
          Get assessment
        </button>
      )}

      {result && (
        <button type="button" className="btn btn-primary" onClick={() => setStep("booking")}>
          Book {String(result.recommendedSpecialty)}
        </button>
      )}
    </section>
  );
}
