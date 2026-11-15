import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  // Only display if the device is genuinely disconnected from the network
  if (isOnline) return null;

  return (
    <div className="shrink-0 w-full bg-amber-600/90 backdrop-blur-sm text-white px-3 py-1 text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm z-40">
      <WifiOff className="w-3.5 h-3.5 text-white" />
      <span>You&apos;re offline. Playing from local cache.</span>
    </div>
  );
};
