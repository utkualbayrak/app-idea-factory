import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

function toDate(value: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

function toIso(date: Date | undefined): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// İki ayrı date input yerine shadcn Calendar ile tek bir tarih aralığı
// seçici (notes.txt madde 20).
export function DateRangeFilter({ from, to, onChange }: DateRangeFilterProps) {
  const range: DateRange | undefined = from || to ? { from: toDate(from), to: toDate(to) } : undefined;

  const label = from && to ? `${from} – ${to}` : from ? `${from} ve sonrası` : to ? `${to}'a kadar` : "Tüm tarihler";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal">
          <CalendarIcon className="size-4" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          onSelect={(r) => onChange(toIso(r?.from), toIso(r?.to))}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  );
}
