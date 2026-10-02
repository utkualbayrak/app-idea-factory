import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type Column,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { Idea } from "@/lib/api";
import { categoryColorClasses, isInIdeaPool } from "@/lib/idea-colors";
import { combinedScore } from "@/lib/scoring";
import { formatBatchDate } from "@/lib/format-date";
import { ActivityBadge } from "@/components/ActivityBadge";
import { IdeaStatusBadge } from "@/components/IdeaStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const PAGE_SIZE = 20;

// Varsayılan: en yeni fikir en üstte (tek tablo, tarih grupları yok).
const DEFAULT_SORTING: SortingState = [{ id: "date", desc: true }];


function ClaudeScoreCell({ idea }: { idea: Idea }) {
  if (!idea.scores) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-muted-foreground">—</span>
        </TooltipTrigger>
        <TooltipContent>Henüz puanlanmadı</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default font-medium text-primary underline decoration-dotted underline-offset-4">
          {idea.scores.overall.toFixed(2)}/10
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5 text-xs">
          <span>Pazar: {idea.scores.market.toFixed(2)}/10</span>
          <span>Uygulanabilirlik: {idea.scores.feasibility_solo_dev.toFixed(2)}/10</span>
          <span>Özgünlük: {idea.scores.originality.toFixed(2)}/10</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CombinedScoreCell({ idea }: { idea: Idea }) {
  const combined = combinedScore(idea.scores?.overall ?? null, idea.user_rating);
  if (combined == null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-muted-foreground">—</span>
        </TooltipTrigger>
        <TooltipContent>{idea.scores ? "Kullanıcı puanı bekleniyor" : "Claude puanı bekleniyor"}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default font-medium underline decoration-dotted underline-offset-4">
          {combined.toFixed(2)}/10
        </span>
      </TooltipTrigger>
      <TooltipContent>%40 Claude + %60 kullanıcı puanı</TooltipContent>
    </Tooltip>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return <Badge className={categoryColorClasses(category)}>{category}</Badge>;
}

function OneLinerCell({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="truncate cursor-default text-sm text-muted-foreground">{text}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

// table-fixed ile eşleşen sabit sütun genişlikleri — masaüstü tabloda hiçbir
// zaman sağa scroll çıkmasın diye (bkz. "Fikir" sütunundaki one_liner'ın
// table-layout: auto altında sütunu genişletip tabloyu taşırdığı bug).
function getColumnWidths(withSelection: boolean): Record<string, string> {
  return withSelection
    ? {
        select: "w-[5%]",
        name: "w-[21%]",
        date: "w-[10%]",
        category: "w-[10%]",
        claude_score: "w-[11%]",
        user_rating: "w-[12%]",
        combined_score: "w-[11%]",
        status: "w-[20%]",
      }
    : {
        name: "w-[24%]",
        date: "w-[10%]",
        category: "w-[10%]",
        claude_score: "w-[12%]",
        user_rating: "w-[12%]",
        combined_score: "w-[12%]",
        status: "w-[20%]",
      };
}

function SortButton({ column, label }: { column: Column<Idea, unknown>; label: string }) {
  const sorted = column.getIsSorted();
  return (
    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === "asc")}>
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="ml-1 size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDown className="ml-1 size-3.5" />
      ) : (
        <ArrowUpDown className="ml-1 size-3.5 opacity-40" />
      )}
    </Button>
  );
}

interface SelectionProps {
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  selectionFull: boolean;
}

function buildColumns(selection?: SelectionProps): ColumnDef<Idea>[] {
  const baseColumns: ColumnDef<Idea>[] = [
    {
      accessorKey: "name",
      header: "Fikir",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">{row.original.name}</span>
            {row.original.origin === "merge" && <MergedMark />}
          </div>
          <OneLinerCell text={row.original.one_liner} />
        </div>
      ),
    },
    {
      // Sıralama created_at ile (aynı gün içindeki batch'ler de doğru sıralansın),
      // gösterim batch_date ile.
      id: "date",
      accessorFn: (idea) => idea.created_at,
      header: ({ column }) => <SortButton column={column} label="Tarih" />,
      cell: ({ row }) => (
        <span className="tabular-nums text-sm text-muted-foreground">{formatBatchDate(row.original.batch_date)}</span>
      ),
    },
    {
      accessorKey: "category",
      header: "Kategori",
      cell: ({ row }) => <CategoryBadge category={row.original.category} />,
    },
    {
      id: "claude_score",
      accessorFn: (idea) => idea.scores?.overall ?? -1,
      header: ({ column }) => <SortButton column={column} label="Claude puanı" />,
      cell: ({ row }) => <ClaudeScoreCell idea={row.original} />,
    },
    {
      id: "user_rating",
      accessorFn: (idea) => idea.user_rating ?? -1,
      header: ({ column }) => <SortButton column={column} label="Kullanıcı puanı" />,
      cell: ({ row }) => {
        const rating = row.original.user_rating;
        return (
          <span className="tabular-nums text-muted-foreground">
            {rating == null ? "—" : `${rating.toFixed(2)}/10`}
          </span>
        );
      },
    },
    {
      id: "combined_score",
      accessorFn: (idea) => combinedScore(idea.scores?.overall ?? null, idea.user_rating) ?? -1,
      header: ({ column }) => <SortButton column={column} label="Birleşik puan" />,
      cell: ({ row }) => <CombinedScoreCell idea={row.original} />,
    },
    {
      // Hücre durum + son aktivite rozetini gösterir; sıralama son aktivite
      // zamanına göre (en son ne olduysa en üstte).
      id: "status",
      accessorFn: (idea) => idea.last_activity_at ?? "",
      header: ({ column }) => <SortButton column={column} label="Durum · aktivite" />,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <IdeaStatusBadge idea={row.original} />
          <ActivityBadge idea={row.original} />
        </div>
      ),
    },
  ];

  if (!selection) return baseColumns;

  const { selectedIds, onToggleSelect, selectionFull } = selection;
  const selectColumn: ColumnDef<Idea> = {
    id: "select",
    header: "",
    cell: ({ row }) => {
      const checked = selectedIds.has(row.original.id);
      return (
        <Checkbox
          checked={checked}
          disabled={!checked && selectionFull}
          aria-label={`${row.original.name} karşılaştırmaya ekle`}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={() => onToggleSelect(row.original.id)}
        />
      );
    },
  };

  return [selectColumn, ...baseColumns];
}

interface IdeaTableProps {
  /** Filtrelenmiş fikirler (tablo bunları sıralar ve sayfalar). */
  ideas: Idea[];
  /** Filtre öncesi toplam kayıt sayısı; verilirse "filtre sonrası" sayısıyla birlikte gösterilir. */
  totalCount?: number;
  emptyMessage?: string;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  selectionFull?: boolean;
}

export function IdeaTable({
  ideas,
  totalCount,
  emptyMessage = "Bu filtrelere uyan fikir yok.",
  selectedIds,
  onToggleSelect,
  selectionFull = false,
}: IdeaTableProps) {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });

  // Filtre değişince (yeni ideas dizisi) ilk sayfaya dön — yoksa örn. 3.
  // sayfadayken filtre sonucu 1 sayfaya düşünce boş bir sayfa görünür.
  useEffect(() => {
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, [ideas]);

  const hasSelection = Boolean(selectedIds && onToggleSelect);
  const columns = useMemo(
    () =>
      buildColumns(
        selectedIds && onToggleSelect ? { selectedIds, onToggleSelect, selectionFull } : undefined,
      ),
    [selectedIds, onToggleSelect, selectionFull],
  );
  const columnWidths = useMemo(() => getColumnWidths(hasSelection), [hasSelection]);

  const table = useReactTable({
    data: ideas,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const filteredCount = table.getPrePaginationRowModel().rows.length;
  const pageCount = Math.max(1, table.getPageCount());
  const firstRow = filteredCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastRow = Math.min(filteredCount, (pagination.pageIndex + 1) * pagination.pageSize);
  const isFiltered = totalCount != null && totalCount !== filteredCount;

  return (
    // Kalan yüksekliği doldurur, liste kendi içinde kayar (ListPageLayout).
    // min-h-64: çok kısa ekranda (örn. telefonda uzun filtre paneli) liste
    // hiç görünmez hale gelmesin — o durumda sayfa biraz kayar.
    <div className="flex min-h-64 flex-1 flex-col gap-2">
      {/* Masaüstü: tablo, tum sutunlar — başlık satırı kaydırırken sabit kalır */}
      <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-lg border md:flex">
        <Table className="table-fixed" containerClassName="min-h-0 flex-1 overflow-auto">
          {/* border-collapse'ta sticky hücrenin border'ı kayıp gidiyor, alt çizgi gölgeyle çiziliyor */}
          <TableHeader className="sticky top-0 z-10 bg-background [&_th]:shadow-[inset_0_-1px_0_var(--color-border)] [&_tr]:border-b-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={columnWidths[header.column.id]}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => navigate(`/ideas/${row.original.id}`)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cell.column.id === "name" ? "min-w-0" : undefined}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobil: sadece ad + kategori + Claude puanı (gerisi detay sayfasında) */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto md:hidden">
        {rows.length === 0 && <p className="py-10 text-center text-muted-foreground">{emptyMessage}</p>}
        {rows.map((row) => {
          const idea = row.original;
          const checked = selectedIds?.has(idea.id) ?? false;
          return (
            <div
              key={row.id}
              onClick={() => navigate(`/ideas/${idea.id}`)}
              className="flex shrink-0 cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
            >
              {hasSelection && (
                <Checkbox
                  checked={checked}
                  disabled={!checked && selectionFull}
                  aria-label={`${idea.name} karşılaştırmaya ekle`}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => onToggleSelect?.(idea.id)}
                />
              )}
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{idea.name}</span>
                    {idea.origin === "merge" && <MergedMark />}
                    <CategoryBadge category={idea.category} />
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatBatchDate(idea.batch_date)}
                    </span>
                    {!isInIdeaPool(idea.status) && <IdeaStatusBadge idea={idea} />}
                    <ActivityBadge idea={idea} />
                  </div>
                </div>
                <div className="shrink-0">
                  <ClaudeScoreCell idea={idea} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Kayıt sayıları + sayfalama: her zaman görünür (tek sayfa olsa bile). */}
      <div className="flex shrink-0 flex-col gap-2 pt-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {isFiltered ? (
            <>
              Toplam <span className="font-medium text-foreground">{totalCount}</span> kayıt · filtre sonrası{" "}
              <span className="font-medium text-foreground">{filteredCount}</span>
            </>
          ) : (
            <>
              Toplam <span className="font-medium text-foreground">{filteredCount}</span> kayıt
            </>
          )}
          {filteredCount > 0 && (
            <span className="ml-1">
              · {firstRow}–{lastRow} arası gösteriliyor
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <Button
            variant="outline"
            size="icon"
            aria-label="İlk sayfa"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.firstPage()}
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Önceki sayfa"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2 tabular-nums">
            Sayfa {pagination.pageIndex + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Sonraki sayfa"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Son sayfa"
            disabled={!table.getCanNextPage()}
            onClick={() => table.lastPage()}
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Havuz bakımının birleştirdiği fikir (birden çok fikirden oluştu).
function MergedMark() {
  return (
    <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
      Birleşik
    </Badge>
  );
}
