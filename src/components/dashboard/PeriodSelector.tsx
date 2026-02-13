import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";

type Preset = "last_7d" | "last_30d" | "last_90d" | "custom";

interface PeriodSelectorProps {
  since: string;
  until: string;
  onChange: (since: string, until: string) => void;
}

const presets: { key: Preset; label: string; days: number }[] = [
  { key: "last_7d", label: "7 dias", days: 7 },
  { key: "last_30d", label: "30 dias", days: 30 },
  { key: "last_90d", label: "90 dias", days: 90 },
];

export function PeriodSelector({ since, until, onChange }: PeriodSelectorProps) {
  const [active, setActive] = useState<Preset>("last_7d");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const handlePreset = (preset: (typeof presets)[number]) => {
    setActive(preset.key);
    const end = new Date();
    const start = subDays(end, preset.days);
    onChange(format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));
  };

  const handleCustomRange = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from && range?.to) {
      setActive("custom");
      onChange(format(range.from, "yyyy-MM-dd"), format(range.to, "yyyy-MM-dd"));
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presets.map((p) => (
        <Button
          key={p.key}
          variant={active === p.key ? "default" : "outline"}
          size="sm"
          onClick={() => handlePreset(p)}
          className="text-xs"
        >
          {p.label}
        </Button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={active === "custom" ? "default" : "outline"}
            size="sm"
            className="text-xs gap-1.5"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {active === "custom" && dateRange?.from && dateRange?.to
              ? `${format(dateRange.from, "dd/MM", { locale: ptBR })} - ${format(dateRange.to, "dd/MM", { locale: ptBR })}`
              : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={handleCustomRange}
            numberOfMonths={2}
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
