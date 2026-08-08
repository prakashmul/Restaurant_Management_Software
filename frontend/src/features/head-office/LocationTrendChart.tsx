import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import type { HeadOfficeLocationSummary } from '../../api/posApi';

const LINE_COLORS = ['#818cf8', '#34d399', '#f59e0b', '#f472b6', '#38bdf8', '#a78bfa'];

interface LocationTrendChartProps {
  locations: HeadOfficeLocationSummary[];
}

export const LocationTrendChart: React.FC<LocationTrendChartProps> = ({ locations }) => {
  const data = useMemo(() => {
    const byDate = new Map<string, Record<string, string | number>>();
    for (const loc of locations) {
      for (const point of loc.dailySales) {
        const row = byDate.get(point.date) || { date: point.date };
        row[loc.name] = Math.round(point.total * 100) / 100;
        byDate.set(point.date, row);
      }
    }
    return Array.from(byDate.values())
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((row) => ({
        ...row,
        label: new Date(row.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      }));
  }, [locations]);

  const hasAnyData = data.some((row) => locations.some((loc) => typeof row[loc.name] === 'number' && (row[loc.name] as number) > 0));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <h3 className="text-xs font-bold mb-4 flex items-center gap-1.5">
        <LineChartIcon className="w-3.5 h-3.5 text-indigo-400" /> Sales by location — daily
      </h3>
      {!hasAnyData ? (
        <div className="h-64 flex items-center justify-center text-slate-500 text-xs">No sales in this period yet.</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#1e293b' }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: '#cbd5e1' }}
                formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, '']}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {locations.map((loc, i) => (
                <Line
                  key={loc.id}
                  type="monotone"
                  dataKey={loc.name}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
