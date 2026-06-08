import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../api/client';

const ALL_EVENTS = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'spam_complaint', 'unsubscribed'];

export default function WebhooksPage() {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['delivered', 'bounced']);
  const qc = useQueryClient();

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => (await api.get('/webhooks')).data,
  });

  const createHook = useMutation({
    mutationFn: () => api.post('/webhooks', { url, events }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); setUrl(''); },
  });

  const deleteHook = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const toggleHook = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/webhooks/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  function toggleEvent(e: string) {
    setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Webhooks</h1>

      {/* Add webhook */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Register Endpoint</h2>
        <div className="flex gap-2 mb-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourapp.com/webhooks/email"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {ALL_EVENTS.map((e) => (
            <button
              key={e}
              onClick={() => toggleEvent(e)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                events.includes(e)
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-gray-300 text-gray-600 hover:border-blue-400'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <button
          onClick={() => url && events.length && createHook.mutate()}
          disabled={createHook.isPending || !url || !events.length}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
        >
          <Plus size={14} /> Add Webhook
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {isLoading && <div className="text-gray-400 text-sm">Loading...</div>}
        {!isLoading && !webhooks.length && (
          <div className="text-gray-400 text-sm">No webhooks configured</div>
        )}
        {webhooks.map((wh: any) => (
          <div key={wh.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-sm text-gray-800 mb-1">{wh.url}</div>
              <div className="flex flex-wrap gap-1.5">
                {wh.events.map((e: string) => (
                  <span key={e} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{e}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => toggleHook.mutate({ id: wh.id, isActive: !wh.isActive })}
                className="text-gray-400 hover:text-blue-600"
                title={wh.isActive ? 'Disable' : 'Enable'}
              >
                {wh.isActive ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />}
              </button>
              <button
                onClick={() => deleteHook.mutate(wh.id)}
                className="text-gray-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
