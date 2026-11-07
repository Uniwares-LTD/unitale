// Review candidates, not persistence declarations. I/C/P status is explained in model.md.
const card = (name, status, fields) => [name, status, fields.split(" | ")];
const section = (title, note, entities, links = []) => ({
  title,
  note,
  entities,
  links,
});

export const reviewViews = [
  {
    file: "model-content.svg",
    title: "Booklet creative content",
    scope:
      "T14: decide stable identities, typed payloads, ordering and revision granularity.",
    sections: [
      section(
        "1. Brief and story",
        "Nested creative content belongs to artifact revisions; boxes are not separate collection proposals.",
        [
          card(
            "Creator brief",
            "C: contract; shape to review",
            "idea / audience | language: tag + direction | characterDescriptions[] | locationDescriptions[] | visualPreferences | Question: reference subject IDs?",
          ),
          card(
            "Concept",
            "C: contract payload",
            "title / premise | theme / tone | constraints[]",
          ),
          card(
            "Outline",
            "C: contract payload",
            "summary | beats[]: id, content | Stable beat identities",
          ),
          card(
            "Manuscript",
            "C: contract payload",
            "units[]: id, prose | characterIds[] / locationIds[] | Unit IDs survive text revisions",
          ),
        ],
      ),
      section(
        "2. Entities and visual direction",
        "Individual descriptions and an explicit roster are proposals; current contracts store aggregate entity arrays.",
        [
          card(
            "Entity description",
            "P: per-subject revision",
            "subjectId -> Subject | name / description | continuityRules[] | kind: character or location | One character/location per artifact",
          ),
          card(
            "Creative roster",
            "P: revision payload",
            "orderedCharacterIds[] | orderedLocationIds[] | introductionOrder? | Membership vs accepted revisions | Removing referenced subjects?",
          ),
          card(
            "Style definition",
            "C: contract payload",
            "direction / palette[] | typography | continuity[] | Scope: shared production style",
          ),
          card(
            "Reference image",
            "C: contract payload",
            "description / requiredFeatures[] | asset: id + sha256 | sources: exact revision identities | Stable style/character/location ID",
          ),
        ],
      ),
      section(
        "3. Physical pages and completion",
        "Page order belongs to an ordered plan/manifest; page identity remains stable across revisions.",
        [
          card(
            "Page plan",
            "C: contract payload",
            "pageSubjectId -> Subject | role: cover or story | panels[] | Source manuscript revisions | Package panel/canvas constraints",
          ),
          card(
            "Panel",
            "C: embedded payload",
            "id | region: x, y, width, height | action | characterIds[] / locationIds[] | manuscriptUnitIds[] | lettering[] | Normalized coordinates: 0..1",
          ),
          card(
            "Lettering",
            "C: embedded payload",
            "id / kind / content | speakerId? | placement | narration, speech, thought, title | credit, sound-effect, in-scene | Exact required text for review",
          ),
          card(
            "Book manifest",
            "C: artifact revision payload",
            "title / language | acceptedSources[] | pages[]: subjectId, role, position | imageRevision: id + hash | asset: id + hash | qualityReviewId | approvalDecisionId | Cover first; exact purchased pages",
          ),
        ],
      ),
    ],
    relationships: [
      "Production owns the brief; story, style and page content live in Artifact revisions.",
      "Roster IDs identify Subjects; accepted-source references identify exact Revisions.",
      "Manuscript units reference character/location Subjects; panels reference units.",
      "Page plan 1 -> many Panels; Panel 1 -> many Lettering entries.",
      "Reference and page-image Revisions attach immutable Original assets.",
      "Manifest entries bind page Subjects to exact images and acceptance evidence.",
      "Review D01-D04: subject identity, per-entity revisions, ordering, content bounds.",
      "Raw generated envelopes remain evidence; retain structured content used by the app.",
    ],
  },
  {
    file: "model-lifecycle.svg",
    title: "Production lifecycle and revision controls",
    scope:
      "T14: agree persisted boundaries now; T15/T20 implement lifecycle and orchestration later.",
    sections: [
      section(
        "1. Durable state and concurrency",
        "Candidate persistence fields; no second scheduler and no replacement for existing Run execution state.",
        [
          card(
            "Production lifecycle",
            "P: refine existing contract",
            "id / ownerId / bookletId | orderId / sourceProductionId? | lifecycleState | currentManifestRevisionId? | version / createdAt / updatedAt | expiresAt? / closedAt? | Separate lifecycle from Run status",
          ),
          card(
            "Stage lock",
            "C + P: embedded refinement",
            "stage: story, style, references | operationId / lockedAt | acceptedSourceRevisionIds[]? | Stored atomically before generation | Never reopen on uncertain outcome",
          ),
          card(
            "Mutation lease",
            "P: service-owned fencing",
            "productionId | activeRunId / workflow identity | leaseOwner / leaseExpiresAt | fencingToken / version | Recovery and terminal release rules | One mutation workflow per production",
          ),
          card(
            "Run binding",
            "P: booklet-to-Run link",
            "productionId / runId / ownerId | purpose / continuationOfRunId? | orderId | accepted publication identity | createdAt / closedAt? | Existing Runs remain authoritative",
          ),
          card(
            "Human input request",
            "P: reuse Run form integration",
            "productionId / runId | formId / request identity | presentedRevisionIds[] | expectedProductionVersion | question / allowedActions[] | state / createdAt / answeredAt? | Decision references submissionId",
          ),
        ],
      ),
      section(
        "2. Requests, pricing and repairs",
        "A user revision request is distinct from the operations and provider attempts used to satisfy it.",
        [
          card(
            "Revision request",
            "P: persisted request identity",
            "id / productionId / decisionId | category / subjectIds[] | instruction / sourceRevisionIds[] | quoteId / allocationIds[] | idempotencyKey / inputHash | state / createdAt | Retries reuse this request",
          ),
          card(
            "Revision quote",
            "P: binds accepted terms",
            "id / productionId / ownerId | request fingerprint | expectedProductionVersion | exact subjects + source revisions | includedUnits / paidUnits | extraCredits / termsRevision | expiresAt / acceptedAt? | Validate stage lock at admission",
          ),
          card(
            "Content reuse acceptance",
            "P: Decision target application",
            "newProductionId | sourceProductionId | sourceRevisionIds[] | decisionId / acceptedAt | New production explicitly accepts | reused content; no silent copying",
          ),
          card(
            "Repair budget",
            "P: bounded service state",
            "productionId / output identity | failedQualityReviewId | limitSnapshot / usedAttempts | execution/spending budget refs | authorizingOperationId | version / exhaustedAt? | Platform-funded; no user allowance",
          ),
        ],
      ),
    ],
    relationships: [
      "Production 1 -> many Run bindings and Revision requests; only one mutation lease.",
      "Human input request -> exact presented Revisions; Decision -> authenticated submission.",
      "Revision request -> one accepted Quote and zero or many entitlement Allocations.",
      "One request can authorize many Operations; retries retain request and funding identity.",
      "Stage lock -> downstream authorizing Operation and the locked upstream sources.",
      "Repair Operation -> failed Quality review and separately fenced repair budget.",
      "Dispatcher observes only the orchestrator; specialists/reviewer have no direct MCP access.",
      "Review D05-D08: lifecycle authority, fencing, requests, reuse and repair accounting.",
    ],
  },
  {
    file: "model-economy.svg",
    title: "Economy and production configuration",
    scope:
      "Reuse implemented Unibase finance. Discuss booklet fields, immutable snapshots and identity mappings.",
    sections: [
      section(
        "1. Purchases and verified grants",
        "Administrator-managed purchase offers are separate from credit-priced consumption products.",
        [
          card(
            "Purchase offer",
            "I: Unibase terms/catalog",
            "identity: id, revision, schemaVersion | label / credits / price + currency | channel: Stripe or Play | billing: one-time or monthly | creditExpiryDays | provider productId / priceId | offerId?",
          ),
          card(
            "Promotion",
            "I: Unibase catalog",
            "identity / code? | startsAt / endsAt | offerIds[] / channels[] | eligibility | maxRedemptions / maxPerAccount | benefit / duration | stacking: false",
          ),
          card(
            "Subscription",
            "I: Unibase",
            "id / ownerId / channel | providerSubscriptionId | acceptedTerms / nextTerms? | state / periodStart / periodEnd | cancelAtPeriodEnd | lastVerifiedPaymentId?",
          ),
          card(
            "Credit lot",
            "I: Unibase wallet",
            "id / uid / source / reference | originalCredits / reversedCredits | remaining / reserved | expiresAt? / createdAt | Subscription grant expiry: 90 days | Purchased one-time credits: no expiry",
          ),
          card(
            "Wallet",
            "I: Unibase",
            "id = account identity | balance / reserved / debt | sequence / revision / updatedAt | Available balance is derived | Provider verification precedes grant",
          ),
        ],
      ),
      section(
        "2. Payment and reservation records",
        "Existing finance records are shown for integration; T14 does not redesign provider billing.",
        [
          card(
            "Billing intent",
            "I: Unibase billing",
            "id / uid / checkoutId / hash | offerId / offerRevision / terms | state / providerId? | accountBinding | nextTerms? / nextEffectiveAt? | periodEnd? / cancelAtPeriodEnd | createdAt",
          ),
          card(
            "Verified payment",
            "I: Unibase",
            "channel / providerPaymentId | uid / checkoutId | offerId / offerRevision | subscriptionId? / sequence | paidAt / providerPromotionId? | evidenceId / hash | Provider-verified, never model claims",
          ),
          card(
            "Promotion reservation",
            "I: Unibase",
            "id / uid / checkoutId / hash | promotion snapshot | offerId / offerRevision / channel | state: reserved, redeemed, released | expiresAt / subscriptionId? | createdAt / releaseHash?",
          ),
          card(
            "Credit reservation",
            "I: Unibase; not package charging",
            "id / uid / amount | allocations[]: lotId, amount | status / createdAt / expiresAt | managedJobId? / committedCredits? | Existing generic wallet holds | Booklet order charges once at start",
          ),
        ],
      ),
      section(
        "3. Consumption and the audit trail",
        "No separate Unitale wallet, charge journal or editable entitlement balance.",
        [
          card(
            "Consumption product",
            "I: catalog; booklet fields P",
            "identity / productType | productSchemaVersion | credits / entitlementDays? | allowances[]: category, unit | included / extraCredits? | fields: validated product extension",
          ),
          card(
            "Consumption order",
            "I: Unibase",
            "id / ownerId / targetId | terms: frozen consumption snapshot | idempotencyKey / inputHash | state / chargedCredits | refundedCredits / chargeLedgerId? | startedAt? / expiresAt? / createdAt",
          ),
          card(
            "Entitlement allocation",
            "I: Unibase",
            "id / orderId / ownerId | requestId / category / subjectId? | funding: included ordinal | or paid orderId | inputHash / createdAt | Multiple affected subjects can | require multiple allocations",
          ),
          card(
            "Ledger entry",
            "I: Unibase",
            "id / uid / sequence / kind | delta / reservedDelta | balanceAfter / reservedAfter | debtAfter / reference / operationId | actorUid? / reason? / timestamp | Refunds link to original charges",
          ),
          card(
            "Catalog publication",
            "I: Unibase",
            "catalogId / revision / definition | hash / publishedAt / actorUid | Provider publication journal: | previewHash / channel / state | providerIds[] / evidenceIds[] | Unknown writes require readback",
          ),
        ],
        [
          [0, 1],
          [1, 2],
        ],
      ),
      section(
        "4. Booklet configuration boundaries",
        "These are versioned accepted settings, not live lookups that alter already purchased productions.",
        [
          card(
            "Booklet package fields",
            "C: split from commercial terms",
            "storyPages / includeCover | maxCharacters / maxLocations | maxPanelsPerPage / styleSamples | canvas: width, height, mime | languages[]: tag, direction | executionProfileId + revision | repairLimitPerOutput | finite calls/steps/time/spend limits",
          ),
          card(
            "Execution profile",
            "C: capacity; publications P",
            "id / revision | max pages, entities, panels, samples | canvases[] / languages[] | coverSupported | Publication bindings to review: | orchestrator / text / image / reviewer | Exact versions, no credentials",
          ),
          card(
            "Quality policy",
            "P: full versioned definition",
            "id / revision / reviewerPublication | required lettering/content rules | continuity / usability criteria | finding codes / blocking policy | Evidence-bound disposition | Subjective aesthetics stay human",
          ),
        ],
      ),
    ],
    relationships: [
      "Purchase offer + optional Promotion -> verified payment -> Credit lot -> Wallet.",
      "Subscription renewal -> verified payment -> idempotent expiring Credit lot grant.",
      "Consumption product -> frozen Order -> one paid Production; Ledger records the charge.",
      "Revision request -> Allocations; paid allocations reference additional consumption Orders.",
      "Production references authoritative Order terms and freezes booklet creative configuration.",
      "Catalog revisions and provider publication journals are distinct; preview precedes publish.",
      "Existing payment verification, redemption reservations and refund services are reused.",
      "Review D09: snapshot boundaries and stable IDs; product prices are not reopened here.",
    ],
  },
  {
    file: "model-media.svg",
    title: "Assets, evidence and future delivery references",
    scope:
      "T14: define provenance and deletion boundaries; T16/T23/T24 own later implementation.",
    sections: [
      section(
        "1. Content and evidence",
        "Original bytes are retained before attachment; retrying attachment must not generate another paid image.",
        [
          card(
            "Original receipt",
            "C: booklet contract",
            "id / ownerId / productionId | operationId | sha256 / bytes / mime | width / height | provider / providerRequestId | evidenceId / retainedAt | Private storage locator stays server",
          ),
          card(
            "Attachment receipt",
            "P: durable application step",
            "id / operationId / assetId | artifactRevisionId | expectedArtifactVersion | idempotencyKey / inputHash | state / attachedAt? | Exact asset hash and source fence",
          ),
          card(
            "Display derivative",
            "P: T16 asset relationship",
            "id / originalAssetId | transformVersion | width / height / mime | storageObjectId / sha256 | Original remains immutable",
          ),
          card(
            "Evidence reference",
            "I: Unibase; linking reviewed",
            "id / sha256 / bytes / kind | operationId / Run association | prompt, input, output, trace, receipt | protected while unresolved | Raw log retention: admin-configured | Not approval or billing authority",
          ),
        ],
      ),
      section(
        "2. Reserve boundaries; defer delivery design",
        "These proposed references prevent T14 from tying content to Runs or exposing permanent public asset URLs.",
        [
          card(
            "Deletion and recovery",
            "C + P: retention integration",
            "bookletId / deletedAt / recoverUntil | purgeState? / purgedAt? | Protection for unresolved evidence | Revoke shares immediately | Recovery never revives old shares | Original/content lifetime != logs",
          ),
          card(
            "PDF export",
            "P: later T23",
            "id / manifestRevisionId | manifestHash / exportProfileVersion | outputAssetId / state | createdAt / evidenceRef? | Immutable manifest-bound output",
          ),
          card(
            "Share grant",
            "P: later T24",
            "id / ownerId / bookletId | manifestRevisionId | tokenHash / createdAt / revokedAt? | allowDownloads: false by default | Read-time revocation checks | Never follows newer revisions",
          ),
          card(
            "Access and audit",
            "P: use existing auth/audit",
            "Owner: book/production/asset scope | Reader: authorized manifest only | Admin: explicit role + action audit | actorId / action / target IDs | reason / timestamp / evidence refs | No prompts/costs in public output",
          ),
        ],
      ),
    ],
    relationships: [
      "Original receipt -> retained private object; Attachment -> exact Revision and Original.",
      "Original asset 1 -> many Derivatives; display transformations never replace originals.",
      "Operations, Measurements and Quality reviews reference protected Evidence records.",
      "Manifest revision -> PDF exports and Share grants; grant checks gate asset/PDF delivery.",
      "Booklet deletion -> immediate share revocation, then recovery window and eligible purge.",
      "Retention keeps operational/financial audit independently from raw diagnostic logs.",
      "Review D10-D12 now: reference fences, ownership, deletion and manifest identity.",
      "Detailed export queues, reader UI and share APIs remain T22-T24 work, not T14 scope.",
    ],
  },
];
