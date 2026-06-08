import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Copy, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../api/client';

function KeyCell({ fullKey, keyPrefix }: { fullKey: string | null; keyPrefix: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function copy() {
    if (fullKey) {
      navigator.clipboard.writeText(fullKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
        {visible && fullKey ? fullKey : `${keyPrefix}••••••••`}
      </span>
      {fullKey && (
        <>
          <button
            onClick={() => setVisible((v) => !v)}
            className="text-gray-400 hover:text-gray-700 transition-colors"
            title={visible ? 'Hide key' : 'Show key'}
          >
            {visible ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button
            onClick={copy}
            className="text-gray-400 hover:text-blue-600 transition-colors"
            title="Copy key"
          >
            {copied ? <span className="text-xs text-green-600">✓</span> : <Copy size={13} />}
          </button>
        </>
      )}
    </div>
  );
}

export default function ApiKeysPage() {
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [createError, setCreateError] = useState('');
  const qc = useQueryClient();

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['apikeys'],
    queryFn: async () => (await api.get('/apikeys')).data,
  });

  const createKey = useMutation({
    mutationFn: (name: string) => api.post('/apikeys', { name }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['apikeys'] });
      setNewKey(res.data.fullKey);
      setName('');
      setCreateError('');
    },
    onError: (err: any) => setCreateError(err.response?.data?.error ?? 'Failed to create key'),
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) => api.delete(`/apikeys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apikeys'] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">API Keys</h1>

      {/* New key banner */}
      {newKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <div className="text-sm font-semibold text-green-800 mb-2">
            API key created — you can also view it anytime from the table below
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm bg-white border border-green-200 rounded px-3 py-2 text-gray-800">
              {showNewKey ? newKey : '•'.repeat(newKey.length)}
            </code>
            <button onClick={() => setShowNewKey((v) => !v)} className="p-2 text-gray-400 hover:text-gray-700">
              {showNewKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(newKey)}
              className="p-2 text-gray-400 hover:text-blue-600"
            >
              <Copy size={14} />
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-xs text-green-700 mt-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Create key */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Create API Key</h2>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. Production)"
            className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => name && createKey.mutate(name)}
            disabled={createKey.isPending || !name}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
          >
            <Plus size={14} /> Create
          </button>
        </div>
        {createError && <p className="text-red-600 text-xs mt-2">{createError}</p>}
      </div>

      {/* Key list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {!isLoading && !keys.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No API keys yet</td></tr>
            )}
            {keys.map((k: any) => (
              <tr key={k.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{k.name}</td>
                <td className="px-4 py-3">
                  <KeyCell fullKey={k.fullKey} keyPrefix={k.keyPrefix} />
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {k.lastUsed ? format(new Date(k.lastUsed), 'MMM d, yyyy') : 'Never'}
                </td>
                <td className="px-4 py-3 text-gray-500">{format(new Date(k.createdAt), 'MMM d, yyyy')}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => revokeKey.mutate(k.id)}
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
