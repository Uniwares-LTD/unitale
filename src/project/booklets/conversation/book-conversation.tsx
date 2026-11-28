"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { api, ApiError } from "@/lib/client/api";
import { Notice } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import { useGuardedNavigation, useLeaveGuard } from "@/components/leave-guard";
import { ChoiceGroup } from "@/project/components/conversation/choice-group";
import {
  Composer,
  ConversationDock,
  useDockKeyboardOpen,
} from "@/project/components/conversation/composer";
import { ConversationReader } from "@/project/components/conversation/reader";
import {
  useProseReveal,
  wordGroups,
} from "@/project/components/conversation/prose-reveal";
import {
  AgentMessage,
  NewResponseButton,
  UserMessage,
  WaitRow,
} from "@/project/components/conversation/messages";
import {
  bookletConversationSchema,
  bookletReplyResultSchema,
  bookletRunReferenceSchema,
  conversationPaused,
  type BookletConversation,
} from "../application-contract";
import {
  checkReply,
  encodeReply,
  type BookletReply,
  type BookletTurn,
  type ReplyProblem,
} from "../turn-contract";
import {
  ReplyText,
  TurnParts,
  assetUrl,
  useBookArtworkLabels,
} from "./turn-parts";
import { BookDetails } from "./book-details";
import Link from "next/link";
import { Library } from "lucide-react";

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
type SendProblem = "changed" | "failed" | "unknown";
type PendingReply = { turn: Turn; reply: BookletReply };
type ReviewDraft = { revisionId: string; subject: string; text: string };
type ReviewDrafts = Record<string, ReviewDraft>;

export function BookConversation({
  initial,
}: {
  initial: BookletConversation;
}) {
  const t = useTranslations("ui");
  const [data, setData] = useState(initial);
  const [sending, setSending] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [offline, setOffline] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const lostConnection = useRef(false);
  const [unread, setUnread] = useState(false);
  const [completionReady, setCompletionReady] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The draft survives while the agent works and across turns until sent.
  const [draft, setDraft] = useState("");
  const [reviewDrafts, setReviewDrafts] = useState<ReviewDrafts>({});
  const pendingReply = useRef<PendingReply | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const pinned = useRef(true);
  const transcript = useRef({
    turns: initial.turns.length,
    completed: initial.completed,
  });
  const refreshing = useRef<Promise<BookletConversation | null> | null>(null);
  useLeaveGuard({
    dirty: !!draft.trim() || Object.keys(reviewDrafts).length > 0,
  });
  const guarded = useGuardedNavigation();

  const clearSubmittedDraft = useCallback((reply: BookletReply) => {
    if (reply.kind === "answer" && reply.text) {
      setDraft((current) => (current.trim() === reply.text ? "" : current));
    } else if (reply.kind === "changes") {
      setReviewDrafts((current) => {
        const id = reply.target.revisionId;
        if (current[id]?.text.trim() !== reply.text) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }, []);

  const refocusReply = useRef(false);
  const open = data.turns.findLast((turn) => turn.status === "open") ?? null;
  const last = data.turns.at(-1) ?? null;
  const preparing = data.turns.some((turn) => turn.status === "preparing");
  // A saved manifest stays readable while a paid/included revision is active.
  const working = data.working || preparing || awaiting;
  const confirming = data.activity === "confirming";
  const expired = last?.status === "expired";
  // Nothing the person can do here moves the book on (expired or stopped).
  const paused = conversationPaused(data) && !awaiting && !sending;
  const reader = data.reader;
  const cover = Number(reader?.pages[0].cover ?? false);
  const revealTurn =
    data.turns.length > initial.turns.length &&
    last &&
    (last.status === "open" || last.status === "preparing")
      ? last
      : null;
  const prose =
    revealTurn?.turn.parts.flatMap((part) =>
      part.type === "prose" ? [part.text] : [],
    ) ?? [];
  // Screen readers hear the new turn's text and then its question.
  const spoken = [
    ...prose,
    ...(revealTurn?.turn.parts.flatMap((part) =>
      part.type === "question" || part.type === "styles" ? [part.prompt] : [],
    ) ?? []),
  ].join(" ");
  const groupCount = prose.reduce(
    (sum, part) => sum + wordGroups(part).length,
    0,
  );
  const { count, revealing } = useProseReveal(
    revealTurn?.requestId ?? null,
    groupCount,
  );
  const waiting = working && !revealing && !confirming && !expired;
  const waitCopy = {
    queued: t("mab589cc2e969"),
    "preparing-question": t("mb45ce3c3ef0b"),
    story: t("md4ae3e4a2dc0"),
    art: t("ma37eb951b34b"),
    layout: t("m8f9f10387377"),
    images: t("m901cd6b1061d"),
    review: t("mfda93f5a3baf"),
    retry: t("mcab3e11d26dc"),
    working: t("ma5f833424699"),
    confirming: t("m08d20ade842d"),
  };
  // The book's real stages, in the order the Manager runs them.
  const stageOrder = ["story", "art", "layout", "images", "review"] as const;
  const bookSteps = (activity: (typeof data)["activity"]) => {
    const current = stageOrder.indexOf(activity as (typeof stageOrder)[number]);
    if (current < 0) return undefined;
    return {
      label: t("m585ee1d48321"),
      labels: [
        t("me9e509dcd358"),
        t("m75df3579c730"),
        t("ma511909161e1"),
        t("m1e6245009d67"),
        t("maff0766a5290"),
      ],
      current,
    };
  };

  const refresh = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    const read = api(
      `/api/booklets/${encodeURIComponent(initial.productionId)}?section=conversation`,
      bookletConversationSchema,
    )
      .then(
        (next) => {
          setOffline(false);
          setData(next);
          // A reply is acknowledged; wait until the Manager's next turn opens.
          if (
            next.turns.some((turn) => turn.status === "open") ||
            !next.working
          )
            setAwaiting(false);
          const pending = pendingReply.current;
          const observed = requestedTurn(next, pending);
          if (
            pending &&
            observed &&
            ["answered", "stale", "expired"].includes(observed.status)
          ) {
            if (
              observed.reply &&
              encodeReply(observed.reply) === encodeReply(pending.reply)
            )
              clearSubmittedDraft(observed.reply);
            pendingReply.current = null;
            setUnconfirmed(false);
            setRetryAvailable(false);
          }
          return next;
        },
        () => {
          setOffline(true);
          return null;
        },
      )
      .finally(() => {
        refreshing.current = null;
      });
    refreshing.current = read;
    return read;
  }, [initial.productionId, clearSubmittedDraft]);

  const openId = open?.requestId;
  useEffect(() => {
    if (!working && !confirming && !unconfirmed && !openId) return;
    // A hidden tab skips the reads; coming back catches up at once.
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 2000);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [working, confirming, unconfirmed, openId, refresh]);

  // The sticky dock sits in flow at the page end, so the page bottom shows the
  // latest message fully above it.
  const toLatest = () =>
    window.scrollTo({ top: document.documentElement.scrollHeight });
  // Follow new messages only while the reader is at the end; otherwise offer
  // a New response control instead of moving them.
  useEffect(() => {
    // The browser reports a scroll before it reports growth, so measure "at the
    // end" against the height last seen; growth alone never unpins the reader.
    let height = document.documentElement.scrollHeight;
    const onScroll = () => {
      const bottom = window.innerHeight + window.scrollY >= height - 120;
      pinned.current = bottom;
      if (bottom) setUnread(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Content can still grow after a turn lands (the dock gains its choices or
    // Approve once the message finishes, a picture loads); keep following it.
    const growth = new ResizeObserver(() => {
      if (pinned.current) toLatest();
      height = document.documentElement.scrollHeight;
    });
    growth.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      growth.disconnect();
    };
  }, []);
  // Opening a conversation shows its latest turn. On a link visit the router
  // scrolls to the top after this page mounts, so follow once more next frame.
  useLayoutEffect(() => {
    toLatest();
    const frame = requestAnimationFrame(() => {
      pinned.current = true;
      toLatest();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useLayoutEffect(() => {
    const completed = data.completed && !transcript.current.completed;
    const grew = data.turns.length > transcript.current.turns || completed;
    transcript.current = {
      turns: data.turns.length,
      completed: data.completed,
    };
    if (!grew && !working && !revealing) return;
    const showUnread = grew && !pinned.current;
    if (pinned.current) toLatest();
    // Decide unread state before permitting the completion popup to open.
    if (showUnread || completed)
      queueMicrotask(() => {
        if (showUnread) setUnread(true);
        if (completed) setCompletionReady(true);
      });
  }, [data.turns.length, working, count, data.completed, revealing]);

  // A reply sent while offline goes by itself once the connection returns;
  // its per-turn key makes a resend safe if the first one did arrive.
  const resendPending = useEffectEvent(() => {
    const pending = pendingReply.current;
    if (pending && !sending && requestedTurn(data, pending)?.status === "open")
      void sendReply(pending.turn, pending.reply);
  });
  useEffect(() => {
    if (offline) {
      lostConnection.current = true;
      return;
    }
    if (!lostConnection.current) return;
    lostConnection.current = false;
    setReconnected(true);
    resendPending();
    const timer = setTimeout(() => setReconnected(false), 4000);
    return () => clearTimeout(timer);
  }, [offline]);

  async function sendReply(turn: Turn, reply: BookletReply) {
    setSending(true);
    try {
      const result = await api(
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
      if (result.status === "submitting") {
        pendingReply.current = { turn, reply };
        setUnconfirmed(true);
        setRetryAvailable(false);
        await refresh();
        return "unknown" as const;
      }
      pendingReply.current = null;
      setUnconfirmed(false);
      setRetryAvailable(false);
      clearSubmittedDraft(reply);
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
      if (
        error instanceof ApiError &&
        [
          "INVALID_INPUT",
          "BOOKLET_INVALID",
          "BOOKLET_REPLY_INVALID",
          "RATE_LIMITED",
        ].includes(code)
      )
        return "failed" as const;
      pendingReply.current = { turn, reply };
      setUnconfirmed(true);
      setRetryAvailable(false);
      await refresh();
      return "unknown" as const;
    } finally {
      setSending(false);
    }
  }
  // After expiry the typed text restarts the agent, which reads it as the
  // answer (one key per expired question, reused on retry).
  async function sendLate(turn: Turn, text: string) {
    setSending(true);
    try {
      await api(
        `/api/booklets/${encodeURIComponent(data.productionId)}`,
        bookletRunReferenceSchema,
        {
          method: "POST",
          timeoutMs: 30000,
          body: {
            action: "continue",
            key: keyFor(`${turn.requestId}:late`),
            lateReply: { requestId: turn.requestId, text },
          },
        },
      );
      setDraft("");
      pinned.current = true;
      setAwaiting(true);
      await refresh();
      return null;
    } catch (error) {
      await refresh();
      return error instanceof ApiError && error.code === "BOOKLET_CONFLICT"
        ? ("changed" as const)
        : ("failed" as const);
    } finally {
      setSending(false);
    }
  }
  async function checkPending() {
    const next = await refresh();
    setRetryAvailable(
      !!next && requestedTurn(next, pendingReply.current)?.status === "open",
    );
  }

  return (
    // The focused frame supplies Back and the theme toggle; the page owns its h1.
    <div className="mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-3xl flex-col">
      <h1
        dir="auto"
        className="mb-2 font-heading text-section-title [overflow-wrap:anywhere]"
      >
        {data.title}
      </h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <Button
          asChild
          variant="ghost"
          className="min-h-11 text-muted-foreground"
        >
          <Link href="/books" onNavigate={guarded("/books")}>
            <Library aria-hidden="true" />
            {t("m1ad84286274b")}
          </Link>
        </Button>
        <BookDetails
          productionId={data.productionId}
          runId={data.runId}
          refreshKey={`${data.runId}:${data.activity}:${data.completed}:${data.turns.length}`}
          refreshConversation={() => void refresh()}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />
      </div>

      <ol className="flex-1 space-y-8 pb-6" aria-label={t("mccca18175753")}>
        <li>
          <UserMessage author={t("m08b041935798")}>
            <span dir="auto">{data.idea}</span>
          </UserMessage>
        </li>
        {data.turns.map((turn) => (
          <li key={turn.requestId} className="space-y-6">
            <AgentMessage
              name={agentName}
              working={revealTurn?.requestId === turn.requestId && revealing}
            >
              <TurnParts
                productionId={data.productionId}
                turn={turn.turn}
                lang={data.language}
                revealCount={
                  revealTurn?.requestId === turn.requestId && revealing
                    ? count
                    : undefined
                }
              />
            </AgentMessage>
            {turn.reply && (
              <UserMessage author={t("m08b041935798")}>
                <ReplyText turn={turn.turn} reply={turn.reply} />
              </UserMessage>
            )}
          </li>
        ))}
        {waiting && (
          // The next reply's own slot: its glowing mascot becomes that reply's
          // header when the text starts streaming in below it. The announcer
          // below speaks its text, since a region added already filled is
          // often silent.
          <li>
            <AgentMessage name={agentName} working>
              <WaitRow steps={bookSteps(data.activity)}>
                {waitCopy[data.activity ?? "working"]}
              </WaitRow>
            </AgentMessage>
          </li>
        )}
        {reader && (
          <li>
            <ConversationReader
              title={data.title}
              heading={t("me75f834e009a")}
              openLabel={t("m920487473fe6")}
              downloadLabel={t("mc2f0e5ba6cce")}
              previousLabel={t("m1208ec01f223")}
              nextLabel={t("mca000000000f")}
              direction={reader.direction}
              hasCover={!!cover}
              autoOpen={
                data.completed &&
                !initial.completed &&
                completionReady &&
                !unread
              }
              onRequestChanges={() => setDetailsOpen(true)}
              pageLabel={(index) =>
                reader.pages[index].cover
                  ? t("mfa8d84566676")
                  : t("md746a867988f", {
                      page: index + 1 - cover,
                      total: reader.pages.length - cover,
                    })
              }
              pages={reader.pages.map((page, index) => ({
                src: assetUrl(data.productionId, page.assetId),
                alt: page.cover
                  ? t("med9a8912b07a", { title: isolate(data.title) })
                  : t("m53329aa02b0b", { page: index + 1 - cover }),
                download: `${data.title} – ${
                  page.cover
                    ? t("mfa8d84566676")
                    : t("ma15000000001", { page: index + 1 - cover })
                }`,
                width: reader.width,
                height: reader.height,
                text: page.text,
              }))}
            />
          </li>
        )}
      </ol>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {waiting
          ? waitCopy[data.activity ?? "working"]
          : revealTurn && !revealing
            ? spoken
            : ""}
      </div>

      {(offline ||
        reconnected ||
        confirming ||
        last?.status === "stale" ||
        paused) && (
        <div className="mb-4">
          {offline ? (
            <Notice
              tone="warning"
              title={unconfirmed ? t("m6e8f58c8b8f3") : t("m263fecfcce38")}
            />
          ) : reconnected && !paused ? (
            <Notice tone="success" title={t("m47bfa636e9a3")} />
          ) : confirming ? (
            <Notice tone="warning" title={t("m08d20ade842d")}>
              {t("m8d854a95e855")}
            </Notice>
          ) : last?.status === "stale" ? (
            <Notice tone="warning" title={t("mad9d3e727b8e")}>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => void refresh()}
              >
                {t("mbdc090ec61e3")}
              </Button>
            </Notice>
          ) : (
            // Expired or stopped: say so plainly and offer the way out.
            <Notice
              tone={expired ? "warning" : "info"}
              title={expired ? t("m28220663726d") : t("md49bc7868bc1")}
            >
              {expired && <p>{t("m1a313d9b59e5")}</p>}
              <Button
                asChild
                variant="outline"
                // The alert underlines and tints every link; keep a normal button.
                className="mt-2 min-h-11 text-foreground! no-underline!"
              >
                <Link href="/books" onNavigate={guarded("/books")}>
                  <Library aria-hidden="true" />
                  {t("m1ad84286274b")}
                </Link>
              </Button>
            </Notice>
          )}
        </div>
      )}
      {unconfirmed && !offline && (
        <div className="mb-3">
          <Notice tone="warning" title={t("m92ef50192b46")}>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              disabled={sending}
              onClick={() => {
                const pending = pendingReply.current;
                if (
                  !pending ||
                  !retryAvailable ||
                  requestedTurn(data, pending)?.status !== "open"
                )
                  return void checkPending();
                void sendReply(pending.turn, pending.reply);
              }}
            >
              {retryAvailable ? t("md8b8392e2c54") : t("m8fec81657ba8")}
            </Button>
          </Notice>
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
        {(!data.completed || open || working || confirming) &&
          (!paused || expired) && (
            <ReplyDock
              key={open?.requestId ?? (expired ? "late" : "none")}
              productionId={data.productionId}
              language={data.language}
              turn={revealing ? null : open}
              working={working || revealing || confirming}
              sending={sending}
              unconfirmed={unconfirmed}
              draft={draft}
              setDraft={setDraft}
              reviewDrafts={reviewDrafts}
              setReviewDrafts={setReviewDrafts}
              onSend={sendReply}
              late={expired && !working ? last : null}
              onSendLate={sendLate}
              refocusRef={refocusReply}
            />
          )}
      </div>
    </div>
  );
}

function requestedTurn(
  data: BookletConversation,
  pending: PendingReply | null,
) {
  return pending
    ? data.turns.find((turn) => turn.requestId === pending.turn.requestId)
    : undefined;
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
  language,
  turn,
  working,
  sending,
  unconfirmed,
  draft,
  setDraft,
  reviewDrafts,
  setReviewDrafts,
  onSend,
  late,
  onSendLate,
  refocusRef,
}: {
  productionId: string;
  language: string;
  turn: Turn | null;
  working: boolean;
  sending: boolean;
  unconfirmed: boolean;
  draft: string;
  setDraft: (value: string) => void;
  reviewDrafts: ReviewDrafts;
  setReviewDrafts: Dispatch<SetStateAction<ReviewDrafts>>;
  onSend: (turn: Turn, reply: BookletReply) => Promise<null | SendProblem>;
  // The expired last question: Send continues the book with the typed text.
  late: Turn | null;
  onSendLate: (turn: Turn, text: string) => Promise<null | SendProblem>;
  refocusRef: RefObject<boolean>;
}) {
  const t = useTranslations("ui");
  const artwork = useBookArtworkLabels();
  const keyboardOpen = useDockKeyboardOpen();
  const field = useRef<HTMLTextAreaElement>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [problem, setProblem] = useState<ReplyProblem | SendProblem | null>(
    null,
  );
  const [attempt, setAttempt] = useState<BookletReply | null>(null);
  const [focused, setFocused] = useState(false);
  const interaction = turn ? interactionOf(turn.turn) : null;
  const approval = interaction?.type === "approval" ? interaction : null;
  const multiple =
    interaction?.type === "question" && interaction.kind === "multiple";
  // Typing stays available while the agent works; only Send waits for a question.
  const typingAllowed =
    !interaction ||
    !!approval ||
    (interaction.type === "question" && interaction.freeText);
  const answerable = (!!turn || !!late) && !working && !sending && !unconfirmed;
  const targetId = approval?.target.revisionId;
  const currentReview = targetId ? reviewDrafts[targetId] : undefined;
  const draftText = approval ? (currentReview?.text ?? "") : draft;
  // Approving and asking for changes never overlap: while the owner types (or
  // has unsent text), Approve steps aside, so nothing typed can be skipped.
  const editing = !!approval && (focused || !!draftText.trim());
  // After a keyboard send, focus returns to the next turn's first control (a
  // choice, or Approve) once it is answerable. The flag lives above the dock,
  // which remounts per question. Approve comes before the field, which would
  // hide it on focus.
  useEffect(() => {
    if (!refocusRef.current || !answerable) return;
    refocusRef.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    field.current
      ?.closest("[data-slot=conversation-dock]")
      ?.querySelector<HTMLElement>(
        "button:not(:disabled), textarea:not(:disabled)",
      )
      ?.focus();
  }, [answerable, refocusRef]);

  async function submit(reply: BookletReply) {
    if (!turn || !answerable) return;
    const checked = checkReply(turn.turn, reply);
    if (!checked.ok) {
      setProblem(checked.reason);
      return;
    }
    setProblem(null);
    setAttempt(checked.reply);
    // Send and Approve turn off while the book works, which drops a keyboard
    // user's focus to the page; the next turn's first control takes it.
    refocusRef.current = !!document.activeElement?.matches(":focus-visible");
    const result = await onSend(turn, checked.reply);
    if (result && result !== "unknown") setProblem(result);
    else if (!result) {
      setChoices([]);
    }
  }
  function approve() {
    if (!approval || draftText.trim()) return;
    void submit({ version: 1, kind: "approve", target: approval.target });
  }
  function sendTyped() {
    if (unconfirmed) return;
    const text = draftText.trim();
    if (late && !turn) {
      if (!text || !answerable) return;
      setProblem(null);
      void onSendLate(late, text).then(
        (result) => result && setProblem(result),
      );
      return;
    }
    if (approval) {
      if (text)
        void submit({
          version: 1,
          kind: "changes",
          target: approval.target,
          text,
        });
      return;
    }
    if (text || choices.length)
      void submit({ version: 1, kind: "answer", choices, text });
  }
  function updateDraft(value: string) {
    if (!approval) return setDraft(value);
    const key = approval.target.revisionId;
    setReviewDrafts((current) => {
      const next = { ...current };
      if (value.trim())
        next[key] = { revisionId: key, subject: approval.subject, text: value };
      else delete next[key];
      return next;
    });
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
    unknown: t("m92ef50192b46"),
  } satisfies Record<ReplyProblem | SendProblem, string>;
  const canSend =
    answerable &&
    (approval || late
      ? !!draftText.trim()
      : !!draftText.trim() || choices.length > 0);

  return (
    <ConversationDock>
      {interaction && interaction.type !== "approval" && (
        <ChoiceGroup
          legendId="book-question"
          legend={interaction.prompt}
          lang={language}
          hint={multiple ? t("m4f853b02689c") : undefined}
          selected={choices}
          disabled={!answerable}
          artworkLabels={artwork}
          compact={keyboardOpen}
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
            // A tap only selects; Send commits, so a mistaken tap can change.
            if (!multiple) {
              setChoices((current) => (current[0] === id ? [] : [id]));
              return;
            }
            setChoices((current) =>
              current.includes(id)
                ? current.filter((c) => c !== id)
                : [...current, id],
            );
          }}
        />
      )}
      {approval && (
        <p
          id="book-change-target"
          className="min-w-0 text-supporting text-muted-foreground [overflow-wrap:anywhere]"
        >
          {t("mf77904fc58de", { subject: isolate(approval.subject) })}
        </p>
      )}
      {approval && !editing && (
        <Button
          type="button"
          className="min-h-(--control-touch-md) w-full rounded-(--x-unitale-radius-card) text-body font-semibold shadow-none motion-safe:animate-in motion-safe:fade-in"
          aria-describedby="book-change-target"
          disabled={!answerable}
          onClick={approve}
        >
          {t("mb3f9b4ef46c3")}
        </Button>
      )}
      {problem && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-supporting text-destructive">
            {problemText[problem]}
          </p>
          {problem === "failed" && attempt && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!answerable}
              onClick={() => void submit(attempt)}
            >
              {t("md8b8392e2c54")}
            </Button>
          )}
        </div>
      )}
      <div
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocused(false);
        }}
      >
        <Composer
          id="book-reply"
          size="dock"
          inputRef={field}
          value={draftText}
          onChange={updateDraft}
          onSend={sendTyped}
          canSend={canSend}
          pending={sending}
          readOnly={unconfirmed}
          // Typing a change is its own mode: the field takes the emphasis.
          className={editing ? "border-2 border-primary" : undefined}
          disabled={!typingAllowed}
          maxLength={2000}
          label={approval ? t("m5801a5064e61") : t("m74a41190a3b4")}
          describedBy={approval ? "book-change-target" : undefined}
          labelledBy={
            interaction && interaction.type !== "approval"
              ? "book-question"
              : undefined
          }
          sendLabel={t("mf6f4688ff23d")}
          placeholder={
            !typingAllowed
              ? t("mc2bc01335874")
              : approval
                ? t("m5801a5064e61")
                : turn || late
                  ? t("mcd617a801ef0")
                  : t("m4a70ac5bf862")
          }
        />
      </div>
    </ConversationDock>
  );
}
