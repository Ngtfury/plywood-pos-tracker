// Shared business entity selector used across all ERP pages
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getBusinessEntities } from "@/lib/db/inventory";
import { useStore } from "@/store";
import type { BusinessEntity } from "@/lib/db/erp";
import { Building2 } from "lucide-react";

interface Props {
  className?: string;
  includeAll?: boolean; // show "All Entities" option
  onSelect?: (id: string | null) => void;
}

export function BusinessEntitySelector({ className, includeAll = true, onSelect }: Props) {
  const [entities, setEntities] = useState<BusinessEntity[]>([]);
  const selectedId = useStore((s) => s.selectedBusinessEntityId);
  const setSelectedId = useStore((s) => s.setSelectedBusinessEntityId);

  useEffect(() => {
    getBusinessEntities().then(setEntities).catch(console.error);
  }, []);

  const handleChange = (val: string) => {
    const id = val === "all" ? null : val;
    setSelectedId(id);
    onSelect?.(id);
  };

  return (
    <div className={`flex items-center gap-2 ${className || ""}`}>
      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select value={selectedId ?? "all"} onValueChange={handleChange}>
        <SelectTrigger className="h-8 text-xs w-52">
          <SelectValue placeholder="Select business entity" />
        </SelectTrigger>
        <SelectContent>
          {includeAll && <SelectItem value="all">All Entities</SelectItem>}
          {entities.filter((e) => e.is_active).map((e) => (
            <SelectItem key={e.id} value={e.id}>
              <span className="flex items-center gap-1.5">
                <span className={`text-[10px] px-1 rounded ${e.entity_type === "company" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                  {e.entity_type === "company" ? "Co" : "Br"}
                </span>
                {e.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
