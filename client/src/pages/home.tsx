import { useState } from "react";
import { StockList } from "@/components/stock-list";
import { StockFilters } from "@/components/stock-filters";

export default function Home() {
  const [filters, setFilters] = useState({});

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2">Stock Market Analysis</h1>
        <p className="text-muted-foreground">
          Track stocks with high analyst ratings and market momentum
        </p>
      </div>

      <StockFilters onFilterChange={setFilters} />
      <StockList filters={filters} />
    </div>
  );
}
