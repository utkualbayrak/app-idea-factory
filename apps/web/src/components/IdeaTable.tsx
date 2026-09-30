import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
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
import { StarRating } from "@/components/StarRating";

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
    cell: ({ row }) => <span className="font-medium text-primary">{row.original.scores.overall}/10</span>,
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
    cell: ({ row }) =>
      row.original.status === "archived" ? (
        <Badge variant="outline" className="text-muted-foreground">
          Arşivlenmiş
        </Badge>
      ) : (
        <Badge variant="outline">{STATUS_LABELS[row.original.status]}</Badge>
      ),
  },
];

const STATUS_LABELS: Record<Idea["status"], string> = {
  new: "Yeni",
  archived: "Arşivlenmiş",
  in_development: "Geliştiriliyor",
  developed: "Geliştirildi",
};

function SortButton({ column, label }: { column: import("@tanstack/react-table").Column<Idea, unknown>; label: string }) {
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
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

  return (
    <div className="overflow-x-auto rounded-lg border">
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
          {table.getRowModel().rows.map((row) => (
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
  );
}
