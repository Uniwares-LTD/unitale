"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { Notice } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import {
  AgentLabel,
  ReplyText,
  TurnParts,
  UserBubble,
  assetUrl,
} from "./turn-parts";

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

export function BookConversation({ initial }: { initial: BookletConversation }) {
  const t = useTranslations("ui");
  const [data, setData] = useState(initial);
  const [sending, setSending] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [offline, setOffline] = useState(false);
  const [unread, setUnread] = useState(false);
  const pinned = useRef(true);
  const end = useRef<HTMLDivElement>(null);
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
  // Opening a conversation shows its latest turn.
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, []);
  useLayoutEffect(() => {
    if (data.turns.length === turnCount.current && !working) return;
    const grew = data.turns.length > turnCount.current;
    turnCount.current = data.turns.length;
    if (pinned.current) end.current?.scrollIntoView({ block: "end" });
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
        <Button variant="ghost" size="icon" className="size-11" asChild>
          <Link href="/" aria-label={t("m76900f1bfd16")}>
            <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </Button>
        <h1 className="min-w-0 truncate font-heading text-xl">{data.title}</h1>
      </div>

      <ol className="flex-1 space-y-8 pb-6" aria-label={t("mccca18175753")}>
        <li>
          <UserBubble>{data.idea}</UserBubble>
        </li>
        {data.turns.map((turn) => (
          <li key={turn.requestId} className="space-y-6">
            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
              <AgentLabel />
              <TurnParts
                productionId={data.productionId}
                turn={turn.turn}
                answered={turn.status !== "open"}
              />
            </div>
            {turn.reply && (
              <UserBubble>
                <ReplyText turn={turn.turn} reply={turn.reply} />
              </UserBubble>
            )}
          </li>
        ))}
        {working && !open && (
          <li aria-live="polite">
            <WaitRow />
          </li>
        )}
      </ol>

      {/* Scroll target; the margin keeps the last message clear of the dock. */}
      <div ref={end} className="scroll-mb-56" />
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

      <div className="sticky bottom-0 z-10 -mx-2 bg-background/90 px-2 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {unread && (
          <div className="mb-2 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                pinned.current = true;
                setUnread(false);
                end.current?.scrollIntoView({ block: "end" });
              }}
            >
              <ArrowDown aria-hidden="true" />
              {t("m0d93a6d0a477")}
            </Button>
          </div>
        )}
        <ReplyDock
          key={open?.requestId ?? "none"}
          productionId={data.productionId}
          turn={open}
          busy={sending || working}
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

function WaitRow() {
  const t = useTranslations("ui");
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <Image
        src="/images/unitale-mascot-face.svg"
        alt=""
        aria-hidden="true"
        width={28}
        height={28}
        className="size-7"
      />
      <span>{t("ma5f833424699")}</span>
      <span aria-hidden="true" className="flex gap-1">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse"
            style={{ animationDelay: `${dot * 200}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

function ReplyDock({
  productionId,
  turn,
  busy,
  onSend,
}: {
  productionId: string;
  turn: Turn | null;
  busy: boolean;
  onSend: (turn: Turn, reply: BookletReply) => Promise<null | "changed" | "failed">;
}) {
  const t = useTranslations("ui");
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [problem, setProblem] = useState<ReplyProblem | "failed" | "changed" | null>(null);
  const interaction = turn ? interactionOf(turn.turn) : null;
  const approval = interaction?.type === "approval" ? interaction : null;
  const options =
    interaction && interaction.type !== "approval" ? interaction.options : [];
  const multiple = interaction?.type === "question" && interaction.kind === "multiple";
  const freeText =
    !!approval || (interaction?.type === "question" && interaction.freeText);
  const disabled = !turn || busy;

  async function submit(reply: BookletReply) {
    if (!turn) return;
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
      setText("");
      setChoices([]);
    }
  }
  function sendTyped() {
    if (disabled) return;
    if (approval) {
      if (!text.trim()) return;
      void submit({ version: 1, kind: "changes", target: approval.target, text: text.trim() });
      return;
    }
    if (!text.trim() && !choices.length) return;
    void submit({ version: 1, kind: "answer", choices, text: text.trim() });
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
      return;
    event.preventDefault();
    sendTyped();
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
    failed: t("m32c614f5f7ef"),
    changed: t("mad9d3e727b8e"),
  } satisfies Record<ReplyProblem | "failed" | "changed", string>;
  const canSend =
    !disabled && (approval ? !!text.trim() : !!text.trim() || choices.length > 0);

  return (
    <div className="rounded-[var(--x-unitale-radius-dialog)] border bg-card p-3 shadow-[var(--x-unitale-shadow-raised)]">
      {interaction && interaction.type !== "approval" && (
        <fieldset className="mb-3 px-1" disabled={disabled}>
          <legend className="mb-2 text-sm font-semibold">{interaction.prompt}</legend>
          {options.length > 0 && (
            <div
              className={cn(
                "grid gap-2",
                interaction.type === "styles" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2",
                "[&>*:last-child:nth-child(odd)]:col-span-2",
                interaction.type === "styles" && "sm:[&>*:last-child:nth-child(odd)]:col-span-1",
              )}
            >
              {interaction.type === "styles"
                ? interaction.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        void submit({ version: 1, kind: "answer", choices: [option.id], text: "" })
                      }
                      className="overflow-hidden rounded-[var(--x-unitale-radius-media)] border bg-background text-start focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Image
                        unoptimized
                        src={assetUrl(productionId, option.assetId)}
                        alt=""
                        width={240}
                        height={240}
                        className="aspect-square w-full object-cover"
                      />
                      <span className="block px-3 py-2 text-sm font-medium">{option.label}</span>
                    </button>
                  ))
                : interaction.options.map((option) => {
                    const selected = choices.includes(option.id);
                    return (
                      <Button
                        key={option.id}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        aria-pressed={multiple ? selected : undefined}
                        className="h-auto min-h-11 justify-center whitespace-normal px-4 py-2.5"
                        onClick={() => {
                          // A simple single choice commits with one tap.
                          if (!multiple) {
                            void submit({ version: 1, kind: "answer", choices: [option.id], text: "" });
                            return;
                          }
                          setChoices((current) =>
                            current.includes(option.id)
                              ? current.filter((id) => id !== option.id)
                              : [...current, option.id],
                          );
                        }}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
            </div>
          )}
        </fieldset>
      )}
      {approval && (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <Button
            type="button"
            disabled={disabled}
            onClick={() => void submit({ version: 1, kind: "approve", target: approval.target })}
          >
            {t("mb3f9b4ef46c3")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => field.current?.focus()}
          >
            {t("mcb5d9f987803")}
          </Button>
        </div>
      )}
      {approval && (
        <p className="mb-2 px-2 text-xs text-muted-foreground">
          {t("mf63615fc3c6f", { subject: approval.subject })}
        </p>
      )}
      {problem && (
        <div className="mb-2" role="alert">
          <p className="px-2 text-sm text-destructive">{problemText[problem]}</p>
        </div>
      )}
      <div className="flex items-end gap-2 rounded-[var(--x-unitale-radius-card)] border bg-background p-1.5 ps-3 focus-within:ring-[3px] focus-within:ring-ring/40">
        <label htmlFor="book-reply" className="sr-only">
          {t("m74a41190a3b4")}
        </label>
        <textarea
          id="book-reply"
          ref={field}
          rows={1}
          value={text}
          maxLength={2000}
          disabled={!turn || !freeText}
          placeholder={
            !turn
              ? t("m4a70ac5bf862")
              : !freeText
                ? t("mc2bc01335874")
                : approval
                  ? t("m5801a5064e61")
                  : t("mcd617a801ef0")
          }
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          className="max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base outline-none [field-sizing:content] placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <Button
          type="button"
          size="icon"
          className="size-11 shrink-0 rounded-full"
          onClick={sendTyped}
          disabled={!canSend}
          aria-label={t("mf6f4688ff23d")}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
