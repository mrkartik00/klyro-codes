import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '../lib/api.js';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => unwrap(await api.get('/me/projects')),
  });
}

export function useProject(id) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: async () => unwrap(await api.get(`/me/projects/${id}`)),
    enabled: Boolean(id),
  });
}

export function useQuotations() {
  return useQuery({
    queryKey: ['quotations'],
    queryFn: async () => unwrap(await api.get('/me/quotations')),
  });
}

export function useQuotation(id) {
  return useQuery({
    queryKey: ['quotations', id],
    queryFn: async () => unwrap(await api.get(`/me/quotations/${id}`)),
    enabled: Boolean(id),
  });
}

export function useAcceptQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) =>
      unwrap(await api.post(`/me/quotations/${id}/accept`)),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['quotations', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => unwrap(await api.get('/me/invoices')),
  });
}
