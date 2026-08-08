import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

interface OrderLike {
  total: number;
  status: string;
  createdAt?: string;
}

interface SalesTrendChartProps {
  orders: OrderLike[];
  days?: number;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ orders, days = 14 }) => {
  const data = useMemo(() => {
    const revenueByDay = new Map<string, number>();
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      revenueByDay.set(dayKey(d), 0);
    }

    for (const order of orders) {
      if (order.status === 'cancelled' || !order.createdAt) continue;
      const key = order.createdAt.slice(0, 10);
      if (revenueByDay.has(key)) {
        revenueByDay.set(key, (revenueByDay.get(key) || 0) + (order.total || 0));
      }
    }

    return Array.from(revenueByDay.entries()).map(([date, revenue]) => ({
      date,
      label: new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      revenue: Math.round(revenue * 100) / 100,
    }));
  }, [orders, days]);

  const hasAnyRevenue = data.some((d) => d.revenue > 0);

  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-indigo-400" />
        Revenue — last {days} days
      </h3>
      {!hasAnyRevenue ? (
        <div className="h-56 flex items-center justify-center text-slate-500 text-xs">
          No sales in this period yet.
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={{ stroke: '#1e293b' }}
                tickLine={false}
                interval={Math.ceil(days / 7)}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: '#cbd5e1' }}
                itemStyle={{ color: '#818cf8' }}
                formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, 'Revenue']}
              />
              <Area type="monotone" dataKey="revenue" stroke="#818cf8" strokeWidth={2} fill="url(#revenueFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
