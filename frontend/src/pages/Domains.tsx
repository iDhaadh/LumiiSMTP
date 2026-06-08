import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle, Copy, ChevronDown } from 'lucide-react';
import { api } from '../api/client';
import clsx from 'clsx';

function StatusIcon({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle size={14} className="text-green-500" />
    : <XCircle size={14} className="text-gray-300" />;
}

export default function DomainsPage() {
  const [newDomain, setNewDomain] = useState('');
  const [dkimResult, setDkimResult] = useState<Record<string, any>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: async () => (await api.get('/domains')).data,
  });

  const addDomain = useMutation({
    mutationFn: (domain: string) => api.post('/domains', { domain }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); setNewDomain(''); },
  });

  const deleteDomain = useMutation({
    mutationFn: (id: string) => api.delete(`/domains/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  });

  const generateDkim = useMutation({
    mutationFn: (id: string) => api.post(`/domains/${id}/dkim`),
    onSuccess: (res, id) => setDkimResult((prev) => ({ ...prev, [id]: res.data })),
  });

  const verifyDomain = useMutation({
    mutationFn: (id: string) => api.get(`/domains/verify?domainId=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Sender Domains</h1>

      {/* Add domain */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Domain</h2>
        <div className="flex gap-2">
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="mail.example.com"
            className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => newDomain && addDomain.mutate(newDomain)}
            disabled={addDomain.isPending || !newDomain}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={14} /> Add
          </button>
        </div>
        {addDomain.isError && (
          <p className="text-red-600 text-xs mt-2">
            {(addDomain.error as any)?.response?.data?.error ?? 'Failed to add domain'}
          </p>
        )}
      </div>

      {/* Domain list */}
      <div className="space-y-3">
        {isLoading && <div className="text-gray-400 text-sm">Loading...</div>}
        {domains.map((d: any) => (
          <div key={d.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpanded(expanded === d.id ? null : d.id)}
            >
              <div className="flex items-center gap-4">
                <span className="font-medium text-gray-900">{d.domain}</span>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><StatusIcon ok={d.spfVerified} /> SPF</span>
                  <span className="flex items-center gap-1"><StatusIcon ok={d.dkimVerified} /> DKIM</span>
                  <span className="flex items-center gap-1"><StatusIcon ok={d.dmarcVerified} /> DMARC</span>
                </div>
                {d.isVerified && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Verified</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); verifyDomain.mutate(d.id); }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
                >
                  <RefreshCw size={12} /> Check DNS
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteDomain.mutate(d.id); }}
                  className="text-gray-400 hover:text-red-500 p-1 rounded"
                >
                  <Trash2 size={14} />
                </button>
                <ChevronDown
                  size={14}
                  className={clsx('text-gray-400 transition-transform', expanded === d.id && 'rotate-180')}
                />
              </div>
            </div>

            {expanded === d.id && (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 text-sm space-y-4">
                {/* DKIM */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-700">DKIM Setup</span>
                    <button
                      onClick={() => generateDkim.mutate(d.id)}
                      disabled={generateDkim.isPending}
                      className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                    >
                      {d.dkimPublicKey ? 'Regenerate DKIM' : 'Generate DKIM Keys'}
                    </button>
                  </div>
                  {dkimResult[d.id] && (
                    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="text-xs text-gray-500">Add this TXT record to your DNS:</div>
                      <div className="font-mono text-xs text-gray-700">
                        <span className="font-semibold">Name:</span> {dkimResult[d.id].dnsName}
                      </div>
                      <div className="flex items-start gap-2">
                        <code className="flex-1 font-mono text-xs bg-gray-50 p-2 rounded border border-gray-200 break-all">
                          {dkimResult[d.id].dnsRecord}
                        </code>
                        <button
                          onClick={() => navigator.clipboard.writeText(dkimResult[d.id].dnsRecord)}
                          className="shrink-0 p-1.5 text-gray-400 hover:text-blue-600"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* SPF instructions */}
                <div>
                  <div className="font-medium text-gray-700 mb-1">SPF Record</div>
                  <code className="block font-mono text-xs bg-white border border-gray-200 rounded p-2 text-gray-700">
                    v=spf1 ip4:YOUR_SERVER_IP include:_spf.{d.domain} ~all
                  </code>
                </div>

                {/* DMARC instructions */}
                <div>
                  <div className="font-medium text-gray-700 mb-1">DMARC Record</div>
                  <code className="block font-mono text-xs bg-white border border-gray-200 rounded p-2 text-gray-700">
                    v=DMARC1; p=quarantine; rua=mailto:dmarc@{d.domain}
                  </code>
                  <div className="text-xs text-gray-400 mt-1">Add as TXT record for _dmarc.{d.domain}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
