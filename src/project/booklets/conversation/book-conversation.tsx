"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { Notice } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/project/components/conversation/choice-group";
import { Composer, ConversationDock } from "@/project/components/conversation/composer";
import {
  AgentMessage,
  NewResponseButton,
  UserMessage,
  WaitRow,
} from "@/project/components/conversation/messages";
import {
  bookletConversationSchema,
  bookletReplyResultSchema,
  type BookletConversation,
} from "../application-contract";
import {
  checkReply,
  type BookletReply,
  type BookletTurn,
  type ReplyProblem,
} from "../turn-contract";
import { ReplyText, TurnParts, assetUrl } from "./turn-parts";

type Turn = BookletConversation["turns"][number];
type Interaction = Extract<
  BookletTurn["parts"][number],
  { type: "question" | "styles" | "approval" }
>;
const interactionOf = (turn: BookletTurn) =>
  turn.parts.find(
    (p): p is Interaction =>
      p.type === "question" || p.type === "styles" || p.type === "approval",
  )!;
// The agent's product name; a brand, not translated copy.
const agentName = "Unitale";
// Manager content inside a translated sentence keeps its own direction.
const isolate = (text: string) => "\u2068" + text + "\u2069";

export function BookConversation({ initial }: { initial: BookletConversation }) {
  const t = useTranslations("ui");
  const [data, setData] = useState(initial);
  const [sending, setSending] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [offline, setOffline] = useState(false);
  const [unread, setUnread] = useState(false);
  // The draft survives while the agent works and across turns until sent.
  const [draft, setDraft] = useState("");
  const pinned = useRef(true);
  const turnCount = useRef(initial.turns.length);

  const open = data.turns.findLast((turn) => turn.status === "open") ?? null;
  const last = data.turns.at(-1) ?? null;
  const preparing = data.turns.some((turn) => turn.status === "preparing");
  const working = data.working || preparing || awaiting;

  const refresh = useCallback(async () => {
    try {
      const next = await api(
        `/api/booklets/${encodeURIComponent(initial.productionId)}?section=conversation`,
        bookletConversationSchema,
      );
      setOffline(false);
      setData(next);
      // A reply is acknowledged; wait until the Manager's next turn opens.
      if (next.turns.some((turn) => turn.status === "open") || !next.working)
        setAwaiting(false);
    } catch {
      setOffline(true);
    }
  }, [initial.productionId]);

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [working, refresh]);

  // Follow new messages only while the reader is at the end; otherwise offer
  // a New response control instead of moving them.
  useEffect(() => {
    const onScroll = () => {
      const bottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 120;
      pinned.current = bottom;
      if (bottom) setUnread(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // The sticky dock sits in flow at the page end, so the page bottom shows the
  // latest message fully above it.
  const toLatest = () =>
    window.scrollTo({ top: document.documentElement.scrollHeight });
  // Opening a conversation shows its latest turn.
  useLayoutEffect(() => {
    toLatest();
  }, []);
  useLayoutEffect(() => {
    if (data.turns.length === turnCount.current && !working) return;
    const grew = data.turns.length > turnCount.current;
    turnCount.current = data.turns.length;
    if (pinned.current) toLatest();
    else if (grew) queueMicrotask(() => setUnread(true));
  }, [data.turns.length, working]);

  async function sendReply(turn: Turn, reply: BookletReply) {
    setSending(true);
    try {
      await api(
        `/api/booklets/${encodeURIComponent(data.productionId)}`,
        bookletReplyResultSchema,
        {
          method: "POST",
          timeoutMs: 30000,
          body: {
            action: "reply",
            key: keyFor(turn.requestId),
            requestId: turn.requestId,
            reply,
          },
        },
      );
      pinned.current = true;
      setAwaiting(true);
      await refresh();
      return null;
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      if (code === "BOOKLET_CONFLICT" || code === "DECISION_UNAVAILABLE") {
        await refresh();
        return "changed" as const;
      }
      return "failed" as const;
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100svh-12rem)] w-full max-w-3xl flex-col">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-(--control-touch-sm)" asChild>
          <Link href="/" aria-label={t("m76900f1bfd16")}>
            <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </Button>
        <h1 className="min-w-0 truncate font-heading text-section-title">{data.title}</h1>
      </div>

      <ol className="flex-1 space-y-8 pb-6" aria-label={t("mccca18175753")}>
        <li>
          <UserMessage author={t("m08b041935798")}>
            <span dir="auto">{data.idea}</span>
          </UserMessage>
        </li>
        {data.turns.map((turn) => (
          <li key={turn.requestId} className="space-y-6">
            <AgentMessage name={agentName}>
              <TurnParts
                productionId={data.productionId}
                turn={turn.turn}
                answered={turn.status !== "open"}
              />
            </AgentMessage>
            {turn.reply && (
              <UserMessage author={t("m08b041935798")}>
                <ReplyText turn={turn.turn} reply={turn.reply} />
              </UserMessage>
            )}
          </li>
        ))}
        {working && !open && (
          <li aria-live="polite">
            <WaitRow>{t("ma5f833424699")}</WaitRow>
          </li>
        )}
      </ol>

      {(offline ||
        last?.status === "stale" ||
        last?.status === "expired" ||
        (!working && !open && !data.completed && data.turns.length > 0)) && (
        <div className="mb-4">
          {offline ? (
            <Notice tone="warning" title={t("m263fecfcce38")} />
          ) : last?.status === "stale" ? (
            <Notice tone="warning" title={t("mad9d3e727b8e")}>
              <Button variant="outline" className="mt-2" onClick={() => void refresh()}>
                {t("mbdc090ec61e3")}
              </Button>
            </Notice>
          ) : last?.status === "expired" ? (
            <Notice tone="warning" title={t("m4c79f58190b0")} />
          ) : (
            <Notice tone="info" title={t("md49bc7868bc1")} />
          )}
        </div>
      )}

      {/* Unitale dock layer (20); the dock stays above the transcript. */}
      <div className="sticky bottom-0 z-20 bg-background pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {unread && (
          <div className="mb-2 flex justify-center">
            <NewResponseButton
              label={t("m0d93a6d0a477")}
              onClick={() => {
                pinned.current = true;
                setUnread(false);
                toLatest();
              }}
            />
          </div>
        )}
        <ReplyDock
          key={open?.requestId ?? "none"}
          productionId={data.productionId}
          turn={open}
          working={working}
          sending={sending}
          draft={draft}
          setDraft={setDraft}
          onSend={sendReply}
        />
      </div>
    </div>
  );
}

// One key per turn reply, reused on retry so a lost response never duplicates.
const replyKeys = new Map<string, string>();
function keyFor(requestId: string) {
  let key = replyKeys.get(requestId);
  if (!key) replyKeys.set(requestId, (key = crypto.randomUUID()));
  return key;
}

function ReplyDock({
  productionId,
  turn,
  working,
  sending,
  draft,
  setDraft,
  onSend,
}: {
  productionId: string;
  turn: Turn | null;
  working: boolean;
  sending: boolean;
  draft: string;
  setDraft: (value: string) => void;
  onSend: (turn: Turn, reply: BookletReply) => Promise<null | "changed" | "failed">;
}) {
  const t = useTranslations("ui");
  const field = useRef<HTMLTextAreaElement>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [problem, setProblem] = useState<ReplyProblem | "failed" | "changed" | null>(null);
  const interaction = turn ? interactionOf(turn.turn) : null;
  const approval = interaction?.type === "approval" ? interaction : null;
  const multiple = interaction?.type === "question" && interaction.kind === "multiple";
  // Typing stays available while the agent works; only Send waits for a question.
  const typingAllowed =
    !interaction || !!approval || (interaction.type === "question" && interaction.freeText);
  const answerable = !!turn && !working && !sending;

  async function submit(reply: BookletReply) {
    if (!turn || !answerable) return;
    const checked = checkReply(turn.turn, reply);
    if (!checked.ok) {
      setProblem(checked.reason);
      return;
    }
    setProblem(null);
    const result = await onSend(turn, checked.reply);
    if (result) setProblem(result);
    // The draft clears only after the reply is acknowledged.
    else {
      setDraft("");
      setChoices([]);
    }
  }
  function sendTyped() {
    const text = draft.trim();
    if (approval) {
      if (text) void submit({ version: 1, kind: "changes", target: approval.target, text });
      return;
    }
    if (text || choices.length)
      void submit({ version: 1, kind: "answer", choices, text });
  }

  const problemText = {
    unsupported: t("m54f67109692b"),
    "approve-or-change": t("me3b68f6f4267"),
    "different-version": t("mad9d3e727b8e"),
    "answer-question": t("mb6d8d9d82129"),
    "offered-only": t("mdda232c6efdc"),
    "type-answer": t("ma9c0a994cdc4"),
    "choose-one": t("m336bcb612c43"),
    "choose-some": t("m9e271cb8532b"),
    failed: t("m256c277e5562"),
    changed: t("mad9d3e727b8e"),
  } satisfies Record<ReplyProblem | "failed" | "changed", string>;
  const canSend =
    answerable && (approval ? !!draft.trim() : !!draft.trim() || choices.length > 0);

  return (
    <ConversationDock>
      {interaction && interaction.type !== "approval" && (
        <ChoiceGroup
          legendId="book-question"
          legend={interaction.prompt}
          mode={multiple ? "multiple" : "single"}
          selected={choices}
          disabled={!answerable}
          options={
            interaction.type === "styles"
              ? interaction.options.map((o) => ({
                  id: o.id,
                  label: o.label,
                  image: { src: assetUrl(productionId, o.assetId) },
                }))
              : interaction.options
          }
          onChoose={(id) => {
            // A simple single choice commits with one tap.
            if (!multiple) {
              void submit({ version: 1, kind: "answer", choices: [id], text: "" });
              return;
            }
            setChoices((current) =>
              current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
            );
          }}
        />
      )}
      {approval && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="min-h-(--control-touch-sm)"
            disabled={!answerable}
            onClick={() => void submit({ version: 1, kind: "approve", target: approval.target })}
          >
            {t("mb3f9b4ef46c3")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-(--control-touch-sm)"
            disabled={!answerable}
            onClick={() => field.current?.focus()}
          >
            {t("mcb5d9f987803")}
          </Button>
        </div>
      )}
      {approval && (
        <p id="book-change-target" className="text-supporting text-muted-foreground">
          {t("mf63615fc3c6f", { subject: isolate(approval.subject) })}
        </p>
      )}
      {problem && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-supporting text-destructive">{problemText[problem]}</p>
          {problem === "failed" && (
            <Button type="button" variant="outline" size="sm" onClick={sendTyped}>
              {t("md8b8392e2c54")}
            </Button>
          )}
        </div>
      )}
      <Composer
        id="book-reply"
        size="dock"
        inputRef={field}
        value={draft}
        onChange={setDraft}
        onSend={sendTyped}
        canSend={canSend}
        pending={sending}
        disabled={!typingAllowed}
        maxLength={2000}
        label={t("m74a41190a3b4")}
        labelledBy={
          approval
            ? "book-change-target"
            : interaction && interaction.type !== "approval"
              ? "book-question"
              : undefined
        }
        sendLabel={t("mf6f4688ff23d")}
        placeholder={
          !typingAllowed
            ? t("mc2bc01335874")
            : approval
              ? t("m5801a5064e61")
              : turn
                ? t("mcd617a801ef0")
                : t("m4a70ac5bf862")
        }
      />
    </ConversationDock>
  );
}
