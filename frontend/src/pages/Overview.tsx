import { useQuery } from '@tanstack/react-query';
import { Mail, CheckCircle, AlertCircle, MousePointer, Eye } from 'lucide-react';
import { api } from '../api/client';

interface Stats {
  total: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  bounceRate: number;
  openRate: number;
  clickRate: number;
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => (await api.get('/email/stats')).data,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <div className="text-gray-500 text-sm">Loading stats...</div>;
  }

  const s = stats!;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Overview</h1>
      <p className="text-sm text-gray-500 mb-6">Last 30 days</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Emails Sent"
          value={s.total.toLocaleString()}
          icon={Mail}
          color="bg-blue-500"
        />
        <StatCard
          label="Delivered"
          value={`${s.deliveryRate}%`}
          sub={`${s.delivered.toLocaleString()} emails`}
          icon={CheckCircle}
          color="bg-green-500"
        />
        <StatCard
          label="Bounce Rate"
          value={`${s.bounceRate}%`}
          sub={`${s.bounced.toLocaleString()} bounced`}
          icon={AlertCircle}
          color="bg-red-500"
        />
        <StatCard
          label="Open Rate"
          value={`${s.openRate}%`}
          sub={`${s.opened.toLocaleString()} opens`}
          icon={Eye}
          color="bg-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Click Rate"
          value={`${s.clickRate}%`}
          sub={`${s.clicked.toLocaleString()} clicks`}
          icon={MousePointer}
          color="bg-orange-500"
        />
      </div>
    </div>
  );
}
