import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Combine } from "lucide-react";
import { fetchProposals, type Proposal, type ProposalsResponse } from "@/lib/api";
import { ProposalCard } from "@/components/ProposalCards";
import { WorkflowTriggerButton } from "@/components/WorkflowTriggerButton";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["pending", "applied", "closed"] as const;
type TabValue = (typeof TABS)[number];

const TAB_FILTERS: Record<TabValue, (p: Proposal) => boolean> = {
  pending: (p) => p.status === "pending",
  applied: (p) => p.status === "applied",
  closed: (p) => p.status === "rejected" || p.status === "undone",
};

const EMPTY_MESSAGES: Record<TabValue, string> = {
  pending: "Onay bekleyen öneri yok.",
  applied: "Henüz uygulanan bir birleştirme ya da özellik önerisi yok.",
  closed: "Reddedilen ya da geri alınan öneri yok.",
};

// Havuz bakımının (merge-ideas.yml) önerileri. Bekleyenlerde önce
// birleştirmeler, sonra özellik önerileri; diğer sekmelerde en yenisi üstte.
export function ProposalsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabValue = TABS.includes(tabParam as TabValue) ? (tabParam as TabValue) : "pending";
  const [data, setData] = useState<ProposalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchProposals()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(load, [load]);

  const byTab = useMemo(() => {
    const proposals = data?.proposals ?? [];
    const result = Object.fromEntries(TABS.map((t) => [t, proposals.filter(TAB_FILTERS[t])])) as Record<
      TabValue,
      Proposal[]
    >;
    result.pending.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "merge" ? -1 : 1));
    return result;
  }, [data]);

  const header = (
    <PageHeader
      title="Öneriler"
      description="Havuz bakımı benzer fikirleri birleştirmeyi ve geliştirmedeki fikirlere özellik eklemeyi önerir. Hiç dokunmadığın fikirlerin birleştirmesi otomatik uygulanır."
      actions={
        <WorkflowTriggerButton
          label="Havuz bakımını şimdi çalıştır"
          loadingLabel="Tetikleniyor…"
          successMessage="Tetiklendi — birkaç dakika içinde Çalışma geçmişi > Havuz bakımı'nda görünecek."
          workflow="merge-ideas.yml"
          inputs={{ force: "true" }}
          icon={<Combine className="size-4" />}
        />
      }
    />
  );

  if (error)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PageMessage tone="error">Öneriler yüklenemedi: {error}</PageMessage>
      </div>
    );
  if (!data)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PageMessage>Yükleniyor…</PageMessage>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {header}
      <Tabs value={tab} onValueChange={(v) => setSearchParams(v === "pending" ? {} : { tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="pending">Bekleyen ({byTab.pending.length})</TabsTrigger>
          <TabsTrigger value="applied">Uygulanan ({byTab.applied.length})</TabsTrigger>
          <TabsTrigger value="closed">Reddedilen ({byTab.closed.length})</TabsTrigger>
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t} value={t} className="mt-4 flex flex-col gap-3">
            {byTab[t].length === 0 ? (
              <PageMessage>{EMPTY_MESSAGES[t]}</PageMessage>
            ) : (
              byTab[t].map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} ideas={data.ideas} onChanged={load} />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
