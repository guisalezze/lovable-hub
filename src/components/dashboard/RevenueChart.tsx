import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const mockData = [
  { date: "01/02", receita: 4200, lucro: 2800 },
  { date: "02/02", receita: 3800, lucro: 2200 },
  { date: "03/02", receita: 5100, lucro: 3400 },
  { date: "04/02", receita: 6200, lucro: 4100 },
  { date: "05/02", receita: 4800, lucro: 3000 },
  { date: "06/02", receita: 7300, lucro: 5200 },
  { date: "07/02", receita: 6800, lucro: 4500 },
  { date: "08/02", receita: 8100, lucro: 5800 },
  { date: "09/02", receita: 7200, lucro: 4900 },
  { date: "10/02", receita: 9400, lucro: 6700 },
  { date: "11/02", receita: 8600, lucro: 5900 },
  { date: "12/02", receita: 10200, lucro: 7400 },
  { date: "13/02", receita: 9800, lucro: 6800 },
];

export function RevenueChart() {
  return (
    <div className="glass-card p-5 animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-4">Receita & Lucro por Dia</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mockData}>
            <defs>
              <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(172, 66%, 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(172, 66%, 50%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorLucro" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 18%)" />
            <XAxis dataKey="date" stroke="hsl(215, 15%, 55%)" fontSize={11} />
            <YAxis stroke="hsl(215, 15%, 55%)" fontSize={11} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(220, 18%, 10%)",
                border: "1px solid hsl(220, 16%, 18%)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "hsl(210, 20%, 95%)" }}
            />
            <Area type="monotone" dataKey="receita" stroke="hsl(172, 66%, 50%)" fillOpacity={1} fill="url(#colorReceita)" strokeWidth={2} />
            <Area type="monotone" dataKey="lucro" stroke="hsl(200, 80%, 55%)" fillOpacity={1} fill="url(#colorLucro)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
