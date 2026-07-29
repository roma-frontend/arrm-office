'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  Download,
  FileSpreadsheet,
  Copy,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  CreditCard,
  DollarSign,
  RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime, getLocaleString } from '@/lib/date-format';
import { toast } from 'sonner';

const SUPERADMIN_EMAIL = (process.env.NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL ?? '').toLowerCase();

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customer: string;
  date: string;
  description: string;
  cardLast4: string | null;
  cardBrand: string | null;
  cardExp: string | null;
  receiptUrl: string | null;
}

interface StripeData {
  metrics: {
    totalRevenue: number;
    last30DaysRevenue: number;
    successRate: number;
    totalTransactions: number;
  };
  recentTransactions: Transaction[];
}

export default function StripeDataStudioClient() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<StripeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchStripeData = async (isRefresh = false) => {
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = new AbortController();

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/stripe/transactions', {
        signal: fetchAbortRef.current.signal,
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Failed to fetch');

      // Calculate success rate
      const txs = result.recentTransactions || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const successCount = txs.filter((t: any) => t.status === 'succeeded').length;
      const successRate = txs.length > 0 ? (successCount / txs.length) * 100 : 0;

      setData({
        metrics: {
          ...result.metrics,
          successRate,
          totalTransactions: txs.length,
        },
        recentTransactions: txs,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStripeData();
    } else {
      setLoading(false);
    }

    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [user]);

  // Filtering Logic
  const filteredData = useMemo(() => {
    if (!data?.recentTransactions) return [];
    const q = searchQuery.toLowerCase();

    return data.recentTransactions.filter((tx) => {
      const emailMatch = tx.customer.toLowerCase().includes(q);
      const amountMatch = tx.amount.toString().includes(q);
      const cardMatch = tx.cardLast4?.includes(q) || tx.cardBrand?.toLowerCase().includes(q);
      const idMatch = tx.id.toLowerCase().includes(q);

      // Date format matching (DD.MM.YYYY)
      const date = new Date(tx.date);
      const dateStr = date.toLocaleDateString(getLocaleString(i18n.language));
      const dateMatch = dateStr.includes(q);

      return emailMatch || amountMatch || cardMatch || idMatch || dateMatch;
    });
  }, [data, searchQuery]);

  const handleExport = (): void => {
    if (!filteredData.length) {
      toast.error('Нет данных для экспорта');
      return;
    }

    const headers = ['ID', 'Customer', 'Amount', 'Status', 'Date', 'Card', 'Description'];
    const csvContent = [
      headers.join(','),
      ...filteredData.map((tx) =>
        [
          tx.id,
          tx.customer,
          tx.amount,
          tx.status,
          formatDate(tx.date, i18n.language),
          `${tx.cardBrand}..${tx.cardLast4}`,
          tx.description,
        ].join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stripe_support_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Данные экспортированы');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  if (loading)
    return (
      <div className="flex justify-center h-screen items-center">
        <ShieldLoader size="lg" />
      </div>
    );

  if (!user) return <div className="p-6">Please log in</div>;

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div>
          <h1 className="text-3xl font-bold mb-1">Stripe Support Studio</h1>
          <p className="text-muted-foreground">Поиск транзакций, данные карт и поддержка</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Button variant="outline" onClick={() => router.push('/superadmin/stripe-dashboard')}>
            📊 Дашборд
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={filteredData.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
          </Button>
          <Button onClick={() => fetchStripeData(true)} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Выручка (Всего)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${data.metrics.totalRevenue}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">За 30 дней</CardTitle>
              <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${data.metrics.last30DaysRevenue}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Успешность</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.metrics.successRate.toFixed(1)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Всего оплат</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.metrics.totalTransactions}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Поиск транзакций</CardTitle>
          <CardDescription>Введите Email, Сумму, Дату или Номер карты</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3 font-medium">Статус</th>
                <th className="p-3 font-medium">Сумма</th>
                <th className="p-3 font-medium">Клиент</th>
                <th className="p-3 font-medium">Карта</th>
                <th className="p-3 font-medium">Дата</th>
                <th className="p-3 font-medium">ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Ничего не найдено
                  </td>
                </tr>
              ) : (
                filteredData.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-t hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => setSelectedTx(tx)}
                  >
                    <td className="p-3">{getStatusIcon(tx.status)}</td>
                    <td className="p-3 font-bold">${tx.amount}</td>
                    <td className="p-3 max-w-[200px] truncate">{tx.customer}</td>
                    <td className="p-3">
                      {tx.cardBrand ? (
                        <Badge variant="outline" className="font-mono">
                          {tx.cardBrand} •••• {tx.cardLast4}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(tx.date, i18n.language)}
                    </td>
                    <td className="p-3 text-xs font-mono text-muted-foreground">
                      {tx.id.slice(-8)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="max-w-lg">
          {selectedTx && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {getStatusIcon(selectedTx.status)}
                  Детали транзакции
                </DialogTitle>
                <DialogDescription>{selectedTx.id}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 p-4">
                {/* Main Info Grid */}
                <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">Сумма</p>
                    <p className="text-xl font-bold text-green-600">${selectedTx.amount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Статус</p>
                    <Badge
                      variant={selectedTx.status === 'succeeded' ? 'default' : 'secondary'}
                      className="mt-1"
                    >
                      {selectedTx.status}
                    </Badge>
                  </div>
                </div>

                {/* Card Details */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Способ оплаты
                  </h4>
                  <div className="p-3 border rounded-lg bg-card">
                    {selectedTx.cardBrand ? (
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-lg">
                          {selectedTx.cardBrand.toUpperCase()} •••• {selectedTx.cardLast4}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Exp: {selectedTx.cardExp}
                        </span>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">Нет данных о карте</p>
                    )}
                  </div>
                </div>

                {/* Customer & Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Клиент</p>
                    <p className="font-medium">{selectedTx.customer}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Время</p>
                    <p className="font-medium">{formatDateTime(selectedTx.date, i18n.language)}</p>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <p className="text-xs text-muted-foreground">Описание</p>
                  <p className="text-sm bg-muted/20 p-2 rounded">{selectedTx.description}</p>
                </div>

                {/* Actions */}
                {selectedTx.receiptUrl && (
                  <Button
                    className="w-full gap-2"
                    onClick={() =>
                      window.open(selectedTx.receiptUrl!, '_blank', 'noopener,noreferrer')
                    }
                  >
                    <Copy className="w-4 h-4" /> Открыть чек Stripe
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper Icon
function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
