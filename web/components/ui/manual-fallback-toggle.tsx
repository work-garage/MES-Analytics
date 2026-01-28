
import React from 'react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

interface ManualFallbackToggleProps {
    enabled: boolean;
    onToggle: (checked: boolean) => void;
    label?: string;
}

export const ManualFallbackToggle: React.FC<ManualFallbackToggleProps> = ({ enabled, onToggle, label = "Manual Override Info" }) => {
    return (
        <div className={`flex items-center space-x-2 rounded-lg border p-3 ${enabled ? 'bg-amber-50 border-amber-200' : 'bg-background'}`}>
            <Switch id="manual-mode" checked={enabled} onCheckedChange={onToggle} />
            <div className="grid gap-1.5 leading-none">
                <Label htmlFor="manual-mode" className="font-semibold flex items-center gap-2">
                    {enabled && <AlertTriangle size={14} className="text-amber-600" />}
                    Enable Manual Entry
                </Label>
                <p className="text-sm text-muted-foreground">
                    {enabled
                        ? "Sensor data ignored. Manual evidence required."
                        : "Data coming from sensors. (Switch if sensor fails)"}
                </p>
            </div>
        </div>
    );
};
