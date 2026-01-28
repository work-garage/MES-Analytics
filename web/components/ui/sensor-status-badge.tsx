
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';

interface SensorStatusBadgeProps {
    status: 'ONLINE' | 'OFFLINE';
    lastSeen?: Date | string;
    sensorName: string;
}

export const SensorStatusBadge: React.FC<SensorStatusBadgeProps> = ({ status, lastSeen, sensorName }) => {
    const isOnline = status === 'ONLINE';

    return (
        <div className="flex items-center gap-2">
            <Badge variant={isOnline ? "default" : "destructive"} className="gap-1.5">
                {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                {sensorName}: {isOnline ? "Online" : "Offline"}
            </Badge>
            {lastSeen && (
                <span className="text-xs text-muted-foreground hidden sm:inline-block">
                    Last seen {formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}
                </span>
            )}
        </div>
    );
};
