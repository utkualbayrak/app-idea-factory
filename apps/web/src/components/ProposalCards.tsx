import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ExternalLink } from "lucide-react";
import {
  acceptProposal,
  applyProposal,
  rejectProposal,
  undoProposal,
  type IdeaSummary,
  type Proposal,
  type ProposalStatus,
} from "@/lib/api";
import { ConfirmButton } from "@/components/ConfirmButton";
import { UpdatedBy } from "@/components/UpdatedBy";
import { categoryColorClasses, STATUS_LABELS } from "@/lib/idea-colors";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type MergeProposal = Extract<Proposal, { kind: "merge" }>;
type FeatureProposal = Extract<Proposal, { kind: "feature" }>;

const PROPOSAL_STATUS: Record<ProposalStatus, { label: string; className: string }> = {
  pending: { label: "Onay bekliyor", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  applied: { label: "Uygulandı", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  rejected: { label: "Reddedildi", className: "bg-muted text-muted-foreground" },
  undone: { label: "Geri alındı", className: "bg-muted text-muted-foreground" },
};

function formatScore(value: number | null) {
  return value == null ? "—" : value.toFixed(2);
}

// Öneri aksiyonları ortak: çalışırken butonlar kilitlenir, hata kartta görünür.
function useProposalAction(onChanged: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function StatusLine({ proposal }: { proposal: Proposal }) {
  const status = PROPOSAL_STATUS[proposal.status];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge className={status.className}>{status.label}</Badge>
      {proposal.auto_applied && proposal.status !== "pending" && <Badge variant="outline">Otomatik</Badge>}
      <span>Önerildi: {formatDateTime(proposal.created_at)}</span>
      {proposal.decided_at && !proposal.auto_applied && (
        <UpdatedBy by={proposal.decided_by} at={proposal.decided_at} verb="karar verdi" />
      )}
    </div>
  );
}

// Kaynak fikrin kısa hâli: ad, özet, Claude puanı, kullanıcı puanı ve notu.
export function IdeaSummaryTile({ idea, className }: { idea: IdeaSummary | undefined; className?: string }) {
  if (!idea) return <div className={cn("rounded-md border p-3 text-sm text-muted-foreground", className)}>(silinmiş fikir)</div>;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-md border p-3 text-sm", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link to={`/ideas/${idea.id}`} className="truncate font-medium text-primary underline underline-offset-4">
          {idea.name}
        </Link>
        {idea.category && <Badge className={categoryColorClasses(idea.category)}>{idea.category}</Badge>}
        {idea.status !== "new" && <Badge variant="outline">{STATUS_LABELS[idea.status]}</Badge>}
      </div>
      <p className="break-words text-muted-foreground">{idea.one_liner}</p>
      <p className="text-xs text-muted-foreground">
        Claude: <span className="tabular-nums text-foreground">{formatScore(idea.overall)}</span>
        {" · "}Senin puanın: <span className="tabular-nums text-foreground">{formatScore(idea.user_rating)}</span>
      </p>
      {idea.user_note && (
        <p className="rounded bg-muted px-2 py-1 text-xs break-words whitespace-pre-wrap">
          <span className="font-medium">Notun:</span> {idea.user_note}
        </p>
      )}
    </div>
  );
}

export function MergeProposalCard({
  proposal,
  ideas,
  onChanged,
}: {
  proposal: MergeProposal;
  ideas: Record<string, IdeaSummary>;
  onChanged: () => void;
}) {
  const { busy, error, run } = useProposalAction(onChanged);
  const merged = proposal.target_idea_id ? ideas[proposal.target_idea_id] : undefined;
  const idea = proposal.payload;
  const canUndo = proposal.status === "applied" && merged != null && (merged.status === "new" || merged.status === "on_hold");

  return (
    <Card className="min-w-0">
      <CardContent className="flex flex-col gap-3 pt-6">
        <StatusLine proposal={proposal} />
        <div className="grid gap-2 sm:grid-cols-2">
          {proposal.source_ids.map((id) => (
            <IdeaSummaryTile key={id} idea={ideas[id]} />
          ))}
        </div>
        <ArrowDown className="mx-auto size-4 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {merged ? (
              <Link to={`/ideas/${merged.id}`} className="font-semibold text-primary underline underline-offset-4">
                {idea.name}
              </Link>
            ) : (
              <span className="font-semibold">{idea.name}</span>
            )}
            <Badge className={categoryColorClasses(idea.category)}>{idea.category}</Badge>
            <span className="text-xs text-muted-foreground">
              Claude: <span className="tabular-nums text-foreground">{idea.scores.overall.toFixed(2)}</span>
            </span>
          </div>
          <p className="break-words">{idea.one_liner}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {idea.core_features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm break-words text-muted-foreground">
          <span className="font-medium text-foreground">Neden:</span> {proposal.reason}
        </p>
        {proposal.error && proposal.status === "pending" && (
          <p className="text-sm text-amber-700 dark:text-amber-300">Otomatik uygulanamadı: {proposal.error}</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {proposal.status === "pending" && (
            <>
              <ConfirmButton
                label="Birleştir"
                title={`"${idea.name}" olarak birleştir?`}
                description="Yeni birleşik fikir Fikirler listesine eklenir; kaynak fikirler listeden kalkar ama birleşik fikrin detayında notları ve puanlarıyla okunur kalır. Fikir hâlâ listedeyken geri alınabilir."
                confirmLabel="Birleştir"
                variant="default"
                disabled={busy}
                onConfirm={() => run(() => applyProposal(proposal.id))}
              />
              <ConfirmButton
                label="Reddet"
                title="Öneriyi reddet?"
                description="Fikirler ayrı kalır; bu grup bir daha önerilmez."
                confirmLabel="Reddet"
                disabled={busy}
                onConfirm={() => run(() => rejectProposal(proposal.id))}
              />
            </>
          )}
          {canUndo && (
            <ConfirmButton
              label="Birleştirmeyi geri al"
              title="Birleştirmeyi geri al?"
              description="Birleşik fikir silinir, kaynak fikirler önceki durumlarıyla Fikirler listesine döner."
              confirmLabel="Geri al"
              disabled={busy}
              onConfirm={() => run(() => undoProposal(proposal.id))}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function FeatureProposalCard({
  proposal,
  ideas,
  onChanged,
  showTarget = true,
}: {
  proposal: FeatureProposal;
  ideas: Record<string, IdeaSummary>;
  onChanged: () => void;
  /** Detay sayfasında hedef zaten o fikir; tekrar gösterilmez. */
  showTarget?: boolean;
}) {
  const { busy, error, run } = useProposalAction(onChanged);
  const target = proposal.target_idea_id ? ideas[proposal.target_idea_id] : undefined;
  const source = ideas[proposal.source_ids[0]];

  return (
    <Card className="min-w-0">
      <CardContent className="flex flex-col gap-3 pt-6">
        <StatusLine proposal={proposal} />
        {showTarget && (
          <p className="text-sm">
            <span className="text-muted-foreground">Hedef: </span>
            {target ? (
              <Link to={`/ideas/${target.id}`} className="font-medium text-primary underline underline-offset-4">
                {target.name}
              </Link>
            ) : (
              "(silinmiş fikir)"
            )}
            {target && <span className="text-muted-foreground"> · {STATUS_LABELS[target.status]}</span>}
          </p>
        )}
        <div className="flex min-w-0 flex-col gap-1 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          <span className="font-semibold break-words">{proposal.payload.title}</span>
          <p className="break-words whitespace-pre-wrap text-muted-foreground">{proposal.payload.description}</p>
        </div>
        <p className="text-sm break-words text-muted-foreground">
          <span className="font-medium text-foreground">Neden:</span> {proposal.reason}
        </p>
        <div className="flex flex-col gap-1">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">Kaynak fikir</span>
          <IdeaSummaryTile idea={source} />
        </div>
        {proposal.status === "applied" &&
          (proposal.issue_url ? (
            <a
              href={proposal.issue_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 text-sm text-primary underline underline-offset-4"
            >
              Issue <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">İskelet reposu kurulunca issue olarak açılacak.</p>
          ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {proposal.status === "pending" && (
          <div className="flex flex-wrap gap-2">
            <ConfirmButton
              label="Kabul et"
              title="Özellik önerisini kabul et?"
              description="Hedef fikrin skeleton reposunda issue açılır (repo henüz yoksa iskelet kurulunca). Kaynak fikir Fikirler listesinden kalkar."
              confirmLabel="Kabul et"
              variant="default"
              disabled={busy}
              onConfirm={() => run(() => acceptProposal(proposal.id))}
            />
            <ConfirmButton
              label="Reddet"
              title="Öneriyi reddet?"
              description="Kaynak fikir Fikirler listesinde kalır; bu özellik bu fikre bir daha önerilmez."
              confirmLabel="Reddet"
              disabled={busy}
              onConfirm={() => run(() => rejectProposal(proposal.id))}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProposalCard(props: {
  proposal: Proposal;
  ideas: Record<string, IdeaSummary>;
  onChanged: () => void;
}) {
  const { proposal, ...rest } = props;
  return proposal.kind === "merge" ? (
    <MergeProposalCard proposal={proposal} {...rest} />
  ) : (
    <FeatureProposalCard proposal={proposal} {...rest} />
  );
}
