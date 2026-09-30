import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type Column,
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Idea } from "@/lib/api";
import { categoryColorClasses, statusColorClasses } from "@/lib/idea-colors";
import { combinedScore } from "@/lib/scoring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const PAGE_SIZE = 8;

const STATUS_LABELS: Record<Idea["status"], string> = {
  new: "Yeni",
  on_hold: "Askıda",
  deleted: "Silinmiş",
  in_development: "Geliştiriliyor",
  developed: "Geliştirildi",
};

function ClaudeScoreCell({ idea }: { idea: Idea }) {
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
  const combined = combinedScore(idea.scores.overall, idea.user_rating);
  if (combined == null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-muted-foreground">—</span>
        </TooltipTrigger>
        <TooltipContent>Kullanıcı puanı bekleniyor</TooltipContent>
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

function StatusBadge({ status }: { status: Idea["status"] }) {
  return <Badge className={statusColorClasses(status)}>{STATUS_LABELS[status]}</Badge>;
}

function CategoryBadge({ category }: { category: string }) {
  return <Badge className={categoryColorClasses(category)}>{category}</Badge>;
}

function OneLinerCell({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="line-clamp-1 cursor-default text-sm text-muted-foreground">{text}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

const columns: ColumnDef<Idea>[] = [
  {
    accessorKey: "name",
    header: "Fikir",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <OneLinerCell text={row.original.one_liner} />
      </div>
    ),
  },
  {
    accessorKey: "category",
    header: "Kategori",
    cell: ({ row }) => <CategoryBadge category={row.original.category} />,
  },
  {
    id: "claude_score",
    accessorFn: (idea) => idea.scores.overall,
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
    accessorFn: (idea) => combinedScore(idea.scores.overall, idea.user_rating) ?? -1,
    header: ({ column }) => <SortButton column={column} label="Birleşik puan" />,
    cell: ({ row }) => <CombinedScoreCell idea={row.original} />,
  },
  {
    accessorKey: "status",
    header: "Durum",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

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

export function IdeaTable({ ideas }: { ideas: Idea[] }) {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: ideas,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  const rows = table.getRowModel().rows;
  const showPagination = table.getPageCount() > 1;

  return (
    <div className="flex flex-col gap-2">
      {/* Masaüstü: tablo, tum sutunlar */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => navigate(`/ideas/${row.original.id}`)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobil: sadece ad + kategori + Claude puanı (gerisi detay sayfasında) */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const idea = row.original;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => navigate(`/ideas/${idea.id}`)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{idea.name}</span>
                <CategoryBadge category={idea.category} />
              </div>
              <div className="shrink-0">
                <ClaudeScoreCell idea={idea} />
              </div>
            </button>
          );
        })}
      </div>

      {showPagination && (
        <div className="flex items-center justify-end gap-3 pt-1">
          <span className="text-sm text-muted-foreground">
            Sayfa {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button variant="outline" size="icon" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            <ArrowLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
