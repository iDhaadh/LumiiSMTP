import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ToggleLeft, ToggleRight, Copy, Server } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../api/client';

const SMTP_PORTS = [
  { port: 587, label: '587', note: 'STARTTLS — recommended' },
  { port: 465, label: '465', note: 'SSL/TLS' },
  { port: 25,  label: '25',  note: 'Plain (if unblocked by host)' },
];

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1.5 text-gray-400 hover:text-blue-600 transition-colors"
      title="Copy"
    >
      {copied ? <span className="text-xs text-green-600">✓</span> : <Copy size={12} />}
    </button>
  );
}

export default function SmtpUsersPage() {
  const [form, setForm] = useState({ username: '', name: '', password: '', dailyLimit: '' });
  const [error, setError] = useState('');
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['smtp-users'],
    queryFn: async () => (await api.get('/smtp-users')).data,
  });

  const createUser = useMutation({
    mutationFn: () =>
      api.post('/smtp-users', {
        username: form.username,
        name: form.name,
        password: form.password,
        ...(form.dailyLimit ? { dailyLimit: parseInt(form.dailyLimit) } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smtp-users'] });
      setForm({ username: '', name: '', password: '', dailyLimit: '' });
      setError('');
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Failed to create user'),
  });

  const toggleUser = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/smtp-users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smtp-users'] }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.delete(`/smtp-users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smtp-users'] }),
  });

  // Derive hostname from current API base or env
  const smtpHost = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">SMTP Users</h1>
      <p className="text-sm text-gray-500 mb-6">
        Create dedicated SMTP credentials for your applications. Each user can connect to
        Lumii SMTP and send email using their username and password.
      </p>

      {/* Connection info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Server size={16} className="text-blue-600" />
          <span className="text-sm font-semibold text-blue-800">Connecting via SMTP</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-blue-700 font-medium mb-2">Server details</div>
            <dl className="space-y-1.5">
              <div className="flex items-center gap-1">
                <dt className="text-blue-600 w-28">SMTP Host</dt>
                <dd className="font-mono text-blue-900">{smtpHost}</dd>
                <CopyButton value={smtpHost} />
              </div>
              {SMTP_PORTS.map(({ port, note }) => (
                <div key={port} className="flex items-center gap-1">
                  <dt className="text-blue-600 w-28">Port {port}</dt>
                  <dd className="text-blue-700 text-xs">{note}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <div className="text-blue-700 font-medium mb-2">Authentication</div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex items-start gap-1">
                <dt className="text-blue-600 w-28">Username</dt>
                <dd className="text-blue-700">SMTP username you create below</dd>
              </div>
              <div className="flex items-start gap-1">
                <dt className="text-blue-600 w-28">Password</dt>
                <dd className="text-blue-700">Password set when creating the user</dd>
              </div>
              <div className="flex items-start gap-1">
                <dt className="text-blue-600 w-28">Encryption</dt>
                <dd className="text-blue-700">STARTTLS on 587, SSL on 465</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Create user form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add SMTP User</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="app@yourdomain.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Display name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="My App"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Min 8 characters"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Daily limit (optional)</label>
            <input
              type="number"
              value={form.dailyLimit}
              onChange={(e) => setForm((f) => ({ ...f, dailyLimit: e.target.value }))}
              placeholder="Unlimited"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
        <button
          onClick={() => form.username && form.name && form.password.length >= 8 && createUser.mutate()}
          disabled={createUser.isPending || !form.username || !form.name || form.password.length < 8}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={14} /> Add SMTP User
        </button>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Daily limit</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {!isLoading && !users.length && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No SMTP users yet — add one above</td></tr>
            )}
            {users.map((u: any) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-gray-700 text-xs bg-gray-100 px-2 py-1 rounded">
                    {u.username}
                  </span>
                  <CopyButton value={u.username} />
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {u.dailyLimit ? u.dailyLimit.toLocaleString() : 'Unlimited'}
                </td>
                <td className="px-4 py-3 text-gray-500">{format(new Date(u.createdAt), 'MMM d, yyyy')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleUser.mutate({ id: u.id, isActive: !u.isActive })}>
                    {u.isActive
                      ? <ToggleRight size={18} className="text-green-500" />
                      : <ToggleLeft size={18} className="text-gray-400" />}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => deleteUser.mutate(u.id)}
                    className="text-gray-400 hover:text-red-500 p-1 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
