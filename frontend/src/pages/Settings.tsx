import { useAuthStore } from '../store/auth';

const PLAN_LIMITS: Record<string, { daily: number; monthly: number }> = {
  FREE: { daily: 1_000, monthly: 10_000 },
  STARTER: { daily: 10_000, monthly: 100_000 },
  PRO: { daily: 100_000, monthly: 1_000_000 },
  ENTERPRISE: { daily: 1_000_000, monthly: 10_000_000 },
};

export default function SettingsPage() {
  const { user } = useAuthStore();

  if (!user) return null;

  const limits = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.FREE;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Account Settings</h1>

      <div className="space-y-4 max-w-xl">
        {/* Profile */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Profile</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Name</dt>
              <dd className="text-gray-900 font-medium">{user.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Email</dt>
              <dd className="text-gray-900">{user.email}</dd>
            </div>
            {user.isAdmin && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Role</dt>
                <dd>
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">Admin</span>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Plan */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Plan & Limits</h2>
          <div className="flex items-center gap-2 mb-4">
            <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full font-semibold">
              {user.plan}
            </span>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Daily sending limit</dt>
              <dd className="text-gray-900 font-medium">{limits.daily.toLocaleString()} emails/day</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Monthly sending limit</dt>
              <dd className="text-gray-900 font-medium">{limits.monthly.toLocaleString()} emails/month</dd>
            </div>
          </dl>
        </div>

        {/* SMTP credentials */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">SMTP Credentials</h2>
          <dl className="space-y-3 text-sm font-mono">
            <div className="flex justify-between">
              <dt className="text-gray-500 font-sans">Hostname</dt>
              <dd className="text-gray-900">mail.yourdomain.com</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 font-sans">Port</dt>
              <dd className="text-gray-900">587 (STARTTLS) / 465 (SSL)</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 font-sans">Username</dt>
              <dd className="text-gray-900">{user.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 font-sans">Password</dt>
              <dd className="text-gray-500 font-sans text-xs">Use an API key from the API Keys page</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
