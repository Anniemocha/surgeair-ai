import { Eye, Moon, Sun } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Theme = "light" | "dark" | "eye-care";
const themes = { light: "Light", dark: "Dark", "eye-care": "Eye Care" };

export function ThemeSelector({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return <Select value={theme} onValueChange={value => onChange(value as Theme)}>
    <SelectTrigger className="h-9 w-[108px] gap-1 border-primary/20 bg-card px-2 text-xs font-semibold text-foreground sm:w-[125px] sm:px-3" aria-label="Appearance theme" data-testid="select-theme">
      <SelectValue placeholder="Theme" />
    </SelectTrigger>
    <SelectContent className="border-border bg-popover text-popover-foreground">
      {(Object.entries(themes) as [Theme, string][]).map(([value, label]) => <SelectItem key={value} value={value} data-testid={`option-theme-${value}`}>
        <span className="inline-flex items-center gap-2">{value === "light" ? <Sun className="h-3.5 w-3.5" /> : value === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{label}</span>
      </SelectItem>)}
    </SelectContent>
  </Select>;
}