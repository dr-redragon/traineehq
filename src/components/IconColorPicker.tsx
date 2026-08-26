import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getIcon, ICON_NAMES } from "@/lib/iconMap";

const COLOR_PRESETS = [
  { label: "Teal",      value: "174 60% 40%" },
  { label: "Blue",      value: "210 70% 50%" },
  { label: "Indigo",    value: "240 60% 55%" },
  { label: "Purple",    value: "270 60% 55%" },
  { label: "Pink",      value: "330 65% 55%" },
  { label: "Rose",      value: "350 70% 55%" },
  { label: "Red",       value: "0 70% 50%" },
  { label: "Orange",    value: "25 90% 55%" },
  { label: "Amber",     value: "40 90% 50%" },
  { label: "Yellow",    value: "50 90% 48%" },
  { label: "Lime",      value: "80 60% 45%" },
  { label: "Green",     value: "140 60% 40%" },
  { label: "Emerald",   value: "160 60% 40%" },
  { label: "Cyan",      value: "190 70% 45%" },
  { label: "Slate",     value: "215 15% 45%" },
  { label: "Stone",     value: "30 10% 45%" },
];

interface IconColorPickerProps {
  iconName: string;
  color: string;
  onChangeIcon: (icon: string) => void;
  onChangeColor: (color: string) => void;
}

export function IconColorPicker({ iconName, color, onChangeIcon, onChangeColor }: IconColorPickerProps) {
  const [search, setSearch] = useState("");
  const CurrentIcon = getIcon(iconName);

  const filtered = search
    ? ICON_NAMES.filter((n) => n.toLowerCase().includes(search.toLowerCase()))
    : ICON_NAMES;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
          style={{ backgroundColor: `hsl(${color} / 0.12)` }}
          title="Change icon & color"
        >
          <CurrentIcon className="h-5 w-5" style={{ color: `hsl(${color})` }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 space-y-3">
          {/* Color picker */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Color</p>
            <div className="grid grid-cols-8 gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  className={`h-7 w-7 rounded-full transition-all hover:scale-110 ${
                    color === c.value ? "ring-2 ring-offset-2 ring-primary" : ""
                  }`}
                  style={{ backgroundColor: `hsl(${c.value})` }}
                  onClick={() => onChangeColor(c.value)}
                />
              ))}
            </div>
          </div>

          {/* Icon picker */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Icon</p>
            <Input
              placeholder="Search icons…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs mb-2"
            />
            <ScrollArea className="h-48">
              <div className="grid grid-cols-8 gap-1">
                {filtered.map((name) => {
                  const Icon = getIcon(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      className={`flex items-center justify-center h-8 w-8 rounded-md transition-colors hover:bg-accent ${
                        iconName === name ? "bg-primary/10 ring-1 ring-primary" : ""
                      }`}
                      onClick={() => onChangeIcon(name)}
                    >
                      <Icon className="h-4 w-4" style={{ color: `hsl(${color})` }} />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
