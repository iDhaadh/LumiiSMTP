import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../api/client';

export default function SuppressionsPage() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('manual');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['suppressions'],
    queryFn: async () => (await api.get('/suppressions')).data,
  });

  const addEntry = useMutation({
    mutationFn: () => api.post('/suppressions', { email, reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppressions'] }); setEmail(''); },
  });

  const removeEntry = useMutation({
    mutationFn: (e: string) => api.delete(`/suppressions/${encodeURIComponent(e)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppressions'] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Suppression List</h1>
      <p className="text-sm text-gray-500 mb-6">
        Emails on this list are silently skipped during sending. Hard bounces and spam complaints are
        added automatically.
      </p>

      {/* Add */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Address</h2>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="manual">Manual</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="hard_bounce">Hard Bounce</option>
            <option value="spam_complaint">Spam Complaint</option>
          </select>
          <button
            onClick={() => email && addEntry.mutate()}
            disabled={addEntry.isPending || !email}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
          >
            <Plus size={14} /> Add
          </button>
        </div>
        {addEntry.isError && (
          <p className="text-red-600 text-xs mt-2">Failed to add address</p>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Added</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {!isLoading && !data?.data?.length && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Suppression list is empty</td></tr>
            )}
            {data?.data?.map((entry: any) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-800">{entry.email}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                    {entry.reason}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {format(new Date(entry.createdAt), 'MMM d, yyyy')}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => removeEntry.mutate(entry.email)}
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
