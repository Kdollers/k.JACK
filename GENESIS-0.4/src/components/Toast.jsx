import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;

  const typeConfig = {
    success: {
      icon: CheckCircle2,
      bg: 'bg-emerald-950/90 border-emerald-600 text-emerald-200',
      iconColor: 'text-emerald-400'
    },
    error: {
      icon: AlertCircle,
      bg: 'bg-rose-950/90 border-rose-600 text-rose-200',
      iconColor: 'text-rose-400'
    },
    warning: {
      icon: AlertTriangle,
      bg: 'bg-amber-950/90 border-amber-600 text-amber-200',
      iconColor: 'text-amber-400'
    },
    info: {
      icon: Info,
      bg: 'bg-blue-950/90 border-blue-600 text-blue-200',
      iconColor: 'text-blue-400'
    }
  };

  const config = typeConfig[toast.type] || typeConfig.success;
  const Icon = config.icon;

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-md animate-fade-in">
      <div className={`flex items-start space-x-3 p-3.5 rounded-lg border shadow-2xl backdrop-blur-md ${config.bg}`}>
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="text-xs font-medium leading-relaxed pr-2">{toast.message}</div>
      </div>
    </div>
  );
}
