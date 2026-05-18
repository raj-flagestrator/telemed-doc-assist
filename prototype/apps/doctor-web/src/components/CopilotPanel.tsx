import { useEffect, useRef, useState } from "react";
import {
  api,
  streamCopilotChat,
  type CopilotMessage,
  type CopilotStreamEvent,
} from "../api";
import { useApp } from "../context/AppContext";

interface CopilotPanelProps {
  appointmentId?: string;
  patientName?: string;
  /** Optional opener label shown on the FAB. */
  label?: string;
}

const QUICK_ACTIONS: { id: string; label: string; prompt: string }[] = [
  {
    id: "summarize",
    label: "Summarize case",
    prompt:
      "Give me a tight clinical summary of this patient: presenting complaint, key findings, current assessment.",
  },
  {
    id: "differential",
    label: "Differentials",
    prompt:
      "Based on the triage and any notes so far, list a ranked differential diagnosis (most to least likely) with one-line reasoning for each.",
  },
  {
    id: "investigations",
    label: "Tests to order",
    prompt:
      "Suggest the most useful investigations / labs / imaging I should order next, with rationale for each.",
  },
  {
    id: "redflags",
    label: "Red flags",
    prompt:
      "What red-flag features should I rule out in this presentation? What would change disposition to urgent referral or A&E?",
  },
  {
    id: "rx",
    label: "Rx & interactions",
    prompt:
      "Given any current prescription on file, check for drug interactions and suggest first-line pharmacological options for the most likely diagnosis with dosing.",
  },
  {
    id: "note",
    label: "Draft SOAP note",
    prompt:
      "Draft a concise SOAP note for this visit I can paste into my consultation notes.",
  },
];

interface UIMessage extends CopilotMessage {
  id: string;
  streaming?: boolean;
  error?: boolean;
}

export function CopilotPanel({ appointmentId, patientName, label }: CopilotPanelProps) {
  const { token } = useApp();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token || !open || configured !== null) return;
    api
      .getCopilotInfo(token)
      .then((info) => {
        setConfigured(!!info.configured);
        setModel(info.model ?? null);
        if (!info.configured) {
          setConfigError(
            info.error ??
              "Set ANTHROPIC_API_KEY in deploy/.env and rebuild the stack to enable the copilot."
          );
        }
      })
      .catch((e: unknown) => {
        setConfigured(false);
        setConfigError(e instanceof Error ? e.message : "Could not reach copilot service");
      });
  }, [token, open, configured]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function send(rawPrompt?: string) {
    const prompt = (rawPrompt ?? input).trim();
    if (!prompt || !token || streaming || configured === false) return;

    const userMsg: UIMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    const assistantMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      streaming: true,
    };
    const history: CopilotMessage[] = [...messages, userMsg].map(({ role, content }) => ({
      role,
      content,
    }));

    setMessages((m) => [...m, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamCopilotChat(
        token,
        { appointmentId, messages: history },
        (event: CopilotStreamEvent) => {
          if (event.type === "delta") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantMsg.id ? { ...msg, content: msg.content + event.text } : msg
              )
            );
          } else if (event.type === "error") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantMsg.id
                  ? { ...msg, content: event.message, streaming: false, error: true }
                  : msg
              )
            );
          }
        },
        controller.signal
      );
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Stream interrupted";
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMsg.id ? { ...msg, content: reason, streaming: false, error: true } : msg
        )
      );
    } finally {
      setMessages((m) =>
        m.map((msg) => (msg.id === assistantMsg.id ? { ...msg, streaming: false } : msg))
      );
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
  }

  return (
    <>
      <button
        type="button"
        className={`copilot-fab ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="copilot-panel"
      >
        <span className="copilot-fab-dot" aria-hidden />
        {label ?? "AI copilot"}
      </button>
      {open && (
        <aside id="copilot-panel" className="copilot-panel" role="dialog" aria-label="Clinical copilot">
          <header className="copilot-panel-head">
            <div>
              <strong>Clinical Copilot</strong>
              <span className="copilot-meta">
                {patientName ? `${patientName} · ` : ""}
                {model ? model : "Claude"}
              </span>
            </div>
            <div className="copilot-head-actions">
              <button type="button" className="copilot-icon-btn" onClick={reset} title="New chat">
                ↺
              </button>
              <button
                type="button"
                className="copilot-icon-btn"
                onClick={() => setOpen(false)}
                title="Close"
              >
                ×
              </button>
            </div>
          </header>

          {configured === false && (
            <div className="copilot-alert">
              <strong>Copilot disabled.</strong>
              <p>{configError}</p>
            </div>
          )}

          {messages.length === 0 && configured !== false && (
            <div className="copilot-empty">
              <p className="sub">
                Ask anything about this patient. Context (triage, notes, prescription) is loaded
                automatically.
              </p>
              <div className="copilot-chips">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.id}
                    type="button"
                    className="copilot-chip"
                    disabled={streaming}
                    onClick={() => send(qa.prompt)}
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="copilot-thread" ref={scrollRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`copilot-msg copilot-msg-${m.role} ${m.error ? "copilot-msg-error" : ""}`}
              >
                <div className="copilot-msg-role">{m.role === "user" ? "You" : "Copilot"}</div>
                <div className="copilot-msg-body">
                  {m.content || (m.streaming ? <span className="copilot-cursor">▍</span> : null)}
                </div>
              </div>
            ))}
          </div>

          <form
            className="copilot-input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                configured === false
                  ? "Copilot disabled"
                  : "Ask about the case (Enter to send, Shift+Enter for newline)"
              }
              disabled={streaming || configured === false}
              rows={2}
            />
            <div className="copilot-input-actions">
              {streaming ? (
                <button type="button" className="btn btn-secondary" onClick={stop}>
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!input.trim() || configured === false}
                >
                  Send
                </button>
              )}
            </div>
          </form>
        </aside>
      )}
    </>
  );
}
