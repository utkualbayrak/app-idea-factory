import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type Column,
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Idea } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StarRating } from "@/components/StarRating";

const STATUS_LABELS: Record<Idea["status"], string> = {
  new: "Yeni",
  archived: "Arşivlenmiş",
  in_development: "Geliştiriliyor",
  developed: "Geliştirildi",
};

function ClaudeScoreCell({ idea }: { idea: Idea }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default font-medium text-primary underline decoration-dotted underline-offset-4">
          {idea.scores.overall}/10
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5 text-xs">
          <span>Pazar: {idea.scores.market}/10</span>
          <span>Uygulanabilirlik: {idea.scores.feasibility_solo_dev}/10</span>
          <span>Özgünlük: {idea.scores.originality}/10</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function StatusBadge({ status }: { status: Idea["status"] }) {
  return (
    <Badge variant="outline" className={status === "archived" ? "text-muted-foreground" : undefined}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const columns: ColumnDef<Idea>[] = [
  {
    accessorKey: "name",
    header: "Fikir",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <div className="line-clamp-1 text-sm text-muted-foreground">{row.original.one_liner}</div>
      </div>
    ),
  },
  {
    accessorKey: "category",
    header: "Kategori",
    cell: ({ row }) => <Badge variant="secondary">{row.original.category}</Badge>,
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
    cell: ({ row }) => <StarRating value={row.original.user_rating} />,
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
  });

  const rows = table.getRowModel().rows;

  return (
    <>
      {/* Masaüstü: tablo */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
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
              <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/ideas/${row.original.id}`)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobil: kart listesi (tablo yerine, TanStack'in siraladigi sirayla) */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const idea = row.original;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => navigate(`/ideas/${idea.id}`)}
              className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{idea.name}</div>
                  <div className="line-clamp-2 text-sm text-muted-foreground">{idea.one_liner}</div>
                </div>
                <ClaudeScoreCell idea={idea} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{idea.category}</Badge>
                  <StatusBadge status={idea.status} />
                </div>
                <StarRating value={idea.user_rating} />
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
