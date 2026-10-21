import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceState } from '../types.ts';
import type { Commit } from '../lib.ts';
import { api, now, uid } from '../lib.ts';
import { assistantContext } from '../core/assistantContext.ts';
import type { ContextChoice } from '../core/assistantContext.ts';
import { ELAB_URL } from '../core/gels.ts';
import { copyReport } from '../gelFiles.ts';
import { Heading } from './Common.tsx';

interface Answer {
  answer: string;
  model: string;
  incomplete: boolean;
  sources: { id: string; name: string; kind: string; recordId: string }[];
  usage: { inputTokens: number | null; outputTokens: number | null };
}
type Message = { role: 'user'; text: string } | { role: 'assistant'; text: string; result: Answer };
export function AssistantPage({
  state,
  commit,
  notify,
  onSource,
}: {
  state: WorkspaceState;
  commit: Commit;
  notify: (s: string) => void;
  onSource: (kind: string, id: string) => void;
}) {
  const [status, setStatus] = useState<{ configured: boolean; model: string } | null>(null),
    [question, setQuestion] = useState(''),
    [choices, setChoices] = useState<ContextChoice[]>([]),
    [images, setImages] = useState(false),
    [filter, setFilter] = useState(''),
    [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    void api<{ configured: boolean; model: string }>('/api/assistant/status')
      .then(setStatus)
      .catch((e) => setError(e.message));
    return () => controller.current?.abort();
  }, []);
  const available = [
    ...state.notes.map((n) => ({ kind: 'note' as const, id: n.id, name: n.name, label: 'Note' })),
    ...state.gels.map((g) => ({ kind: 'gel' as const, id: g.id, name: g.name, label: 'Gel' })),
    ...state.primers.map((p) => ({
      kind: 'primer' as const,
      id: p.id,
      name: p.name,
      label: 'Amorce',
    })),
    ...state.sequences.map((s) => ({
      kind: 'sequence' as const,
      id: s.id,
      name: s.name,
      label: 'Séquence · métadonnées',
    })),
    ...state.projects.map((p) => ({
      kind: 'project' as const,
      id: p.id,
      name: p.name,
      label: 'Projet',
    })),
  ];
  const preview = useMemo(() => {
    try {
      return { text: assistantContext(state, choices).text, error: '' };
    } catch (e) {
      return { text: '', error: (e as Error).message };
    }
  }, [state, choices]);
  async function send() {
    if (!question.trim() || busy) return;
    const text = question.trim(),
      request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    const previous = messages;
    setMessages([...previous, { role: 'user', text }]);
    setQuestion('');
    try {
      const result = await api<Answer>('/api/assistant', {
        method: 'POST',
        signal: request.signal,
        body: JSON.stringify({
          question: text,
          choices,
          revision: state.revision,
          includeGelImages: images,
          history: previous
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.text.slice(0, 12000) })),
        }),
      });
      if (!request.signal.aborted)
        setMessages([
          ...previous,
          { role: 'user', text },
          { role: 'assistant', text: result.answer, result },
        ]);
    } catch (e) {
      if (!request.signal.aborted) {
        setError((e as Error).message);
        setQuestion(text);
      }
      setMessages(previous);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading eyebrow="Contexte choisi · sources explicites" title="Assistant GeneForge">
        <span className="ai-badge">✦ OpenAI</span> Rédige une note, prépare une légende ou explore
        les informations d’un projet.
      </Heading>
      <div className="assistant-layout">
        <aside className="panel context-panel">
          <h3>Sources à partager · {choices.length}/12</h3>
          <label className="field">
            Filtrer le contexte
            <input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <div className="assistant-sources">
            {available
              .filter((s) =>
                (s.name + ' ' + s.label).toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
              )
              .slice(0, 150)
              .map((s) => {
                const checked = choices.some((c) => c.kind === s.kind && c.id === s.id);
                return (
                  <label className="source-choice" key={`${s.kind}:${s.id}`}>
                    <input
                      aria-label={`Partager ${s.label} : ${s.name}`}
                      type="checkbox"
                      checked={checked}
                      disabled={busy || (!checked && choices.length >= 12)}
                      onChange={(e) => {
                        setChoices(
                          e.target.checked
                            ? [...choices, { kind: s.kind, id: s.id }]
                            : choices.filter((c) => c.kind !== s.kind || c.id !== s.id),
                        );
                        setMessages([]);
                      }}
                    />
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.label}</small>
                    </span>
                  </label>
                );
              })}
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={images}
              disabled={busy}
              onChange={(e) => setImages(e.target.checked)}
            />
            Joindre les images originales des gels choisis
          </label>
          <p className="muted small-text">
            Seuls le message, la conversation affichée et ces sources sont envoyés à OpenAI. Les
            séquences génomiques et les fichiers du serveur sont exclus. Les amorces choisies
            comprennent leur séquence.
          </p>
          <details>
            <summary>Voir le texte du contexte envoyé</summary>
            <pre className="context-preview">{preview.text || preview.error}</pre>
          </details>
          <p className="muted small-text">
            {status
              ? `${status.configured ? 'Clé configurée' : 'Clé absente'} · ${status.model}`
              : 'Vérification de la connexion locale…'}
            <br />
            Utilisation facturée par l’API. Réponses à vérifier avant utilisation.
          </p>
        </aside>
        <section className="panel assistant-chat">
          <div className="assistant-messages" aria-live="polite">
            {!messages.length && (
              <div className="assistant-welcome">
                <span>✦</span>
                <h2>À quoi travailles-tu ?</h2>
                <p>
                  Choisis des sources à gauche pour préparer un texte qui s’appuie sur tes données.
                </p>
                <div className="prompt-suggestions">
                  {[
                    'Prépare une légende de figure à partir du gel sélectionné.',
                    'Reformule ces observations en note concise pour e-Lab.',
                    'Quelles informations manquent dans les sources choisies ?',
                  ].map((q) => (
                    <button className="button secondary" key={q} onClick={() => setQuestion(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <article key={i} className={`chat-message ${m.role}`}>
                <div className="eyebrow">
                  {m.role === 'user' ? 'Toi' : '✦ GeneForge · réponse IA'}
                </div>
                <div className="chat-text">{m.text}</div>
                {m.role === 'assistant' && (
                  <>
                    {m.result.incomplete && (
                      <p className="notice warning">
                        Réponse interrompue par la limite de longueur.
                      </p>
                    )}
                    <div className="answer-sources">
                      {m.result.sources.map((s) => (
                        <button
                          className="source-link"
                          key={s.id}
                          onClick={() => onSource(s.kind, s.recordId)}
                        >
                          [{s.id}] {s.name}
                        </button>
                      ))}
                    </div>
                    <div className="toolbar">
                      <button
                        className="button small secondary"
                        onClick={() =>
                          void copyReport(m.text)
                            .then(() => notify('Réponse copiée.'))
                            .catch(() => notify('Copie indisponible.'))
                        }
                      >
                        Copier
                      </button>
                      <button
                        className="button small primary"
                        onClick={async () => {
                          const time = now();
                          await commit(
                            (s) => ({
                              ...s,
                              notes: [
                                ...s.notes,
                                {
                                  id: uid(),
                                  name: 'Note préparée avec l’assistant',
                                  projectId: null,
                                  body: `Proposition IA à vérifier · ${m.result.model}\n\n${m.text}\n\nSources :\n${m.result.sources.map((r) => `[${r.id}] ${r.name} (${r.kind}, ${r.recordId})`).join('\n')}`,
                                  elabUrl: ELAB_URL,
                                  fileReferences: '',
                                  gelIds: m.result.sources
                                    .filter((s) => s.kind === 'gel')
                                    .map((s) => s.recordId),
                                  createdAt: time,
                                  updatedAt: time,
                                },
                              ],
                            }),
                            'Réponse conservée dans Notes.',
                          );
                        }}
                      >
                        Conserver dans Notes
                      </button>
                    </div>
                    <small className="muted">
                      {m.result.model} · {m.result.usage.inputTokens ?? '—'} tokens entrée ·{' '}
                      {m.result.usage.outputTokens ?? '—'} sortie
                    </small>
                  </>
                )}
              </article>
            ))}
            {busy && (
              <p role="status" className="thinking-indicator">
                ✦ L’assistant prépare sa réponse…
              </p>
            )}
          </div>
          {(error || preview.error) && (
            <p role="alert" className="notice error">
              {error || preview.error}
            </p>
          )}
          <form
            className="assistant-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="field">
              Message à l’assistant
              <textarea
                aria-label="Message à l’assistant"
                className="textarea"
                rows={3}
                maxLength={8000}
                value={question}
                disabled={busy}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ta question ou le texte à préparer…"
              />
            </label>
            <div className="toolbar">
              <button
                className="button primary"
                disabled={busy || !status?.configured || !question.trim() || !!preview.error}
              >
                Envoyer à OpenAI
              </button>
              {busy ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => controller.current?.abort()}
                >
                  Annuler
                </button>
              ) : (
                <button type="button" className="button ghost" onClick={() => setMessages([])}>
                  Effacer la conversation
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
