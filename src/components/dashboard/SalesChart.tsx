import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const mockData = [
  { produto: "Mentoria Pro", vendas: 45 },
  { produto: "Curso Elite", vendas: 32 },
  { produto: "Pack Digital", vendas: 28 },
  { produto: "Consultoria", vendas: 15 },
  { produto: "Ebook", vendas: 12 },
];

export function SalesChart() {
  return (
    <div className="glass-card p-5 animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-4">Vendas por Produto</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mockData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 18%)" horizontal={false} />
            <XAxis type="number" stroke="hsl(215, 15%, 55%)" fontSize={11} />
            <YAxis dataKey="produto" type="category" stroke="hsl(215, 15%, 55%)" fontSize={11} width={100} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(220, 18%, 10%)",
                border: "1px solid hsl(220, 16%, 18%)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Bar dataKey="vendas" fill="hsl(172, 66%, 50%)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
