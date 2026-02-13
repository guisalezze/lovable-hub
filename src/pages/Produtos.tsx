import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package } from "lucide-react";

interface ProductSummary {
  product_code: string;
  product_name: string;
  total_sales: number;
  total_revenue: number;
}

export default function ProdutosPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("lead_products")
        .select("product_code, product_name, total_purchases_count, total_paid_amount");

      if (data) {
        const map = new Map<string, ProductSummary>();
        data.forEach((p) => {
          const existing = map.get(p.product_code);
          if (existing) {
            existing.total_sales += p.total_purchases_count;
            existing.total_revenue += Number(p.total_paid_amount);
          } else {
            map.set(p.product_code, {
              product_code: p.product_code,
              product_name: p.product_name || p.product_code,
              total_sales: p.total_purchases_count,
              total_revenue: Number(p.total_paid_amount),
            });
          }
        });
        setProducts(Array.from(map.values()));
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral dos produtos vendidos</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : products.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum produto vendido ainda</p>
          <p className="text-xs text-muted-foreground mt-1">Os produtos aparecerão aqui quando vendas forem registradas via webhook.</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Produto</th>
                <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendas</th>
                <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Receita</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.product_code} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="p-4 text-foreground font-medium">{p.product_name}</td>
                  <td className="p-4 text-right text-muted-foreground">{p.total_sales}</td>
                  <td className="p-4 text-right text-foreground">R$ {p.total_revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
