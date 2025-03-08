import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSpacList } from "@/lib/finnhub";
import type { Spac } from "@/lib/finnhub";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SpacList() {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Spac;
    direction: 'asc' | 'desc';
  }>({ key: 'trustValue', direction: 'desc' });

  const { data: spacs, isLoading } = useQuery({
    queryKey: ["/api/finnhub/spacs"],
    queryFn: getSpacList,
  });

  const handleSort = (key: keyof Spac) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedSpacs = spacs?.sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    const modifier = sortConfig.direction === 'asc' ? 1 : -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * modifier;
    }
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return aVal.localeCompare(bVal) * modifier;
    }
    return 0;
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">
        <div className="h-8 w-32 bg-muted rounded mx-auto mb-4"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }

  if (!sortedSpacs?.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No active SPACs found.
      </div>
    );
  }

  return (
    <Card>
      <div className="w-full overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('symbol')} className="h-8 text-left font-medium">
                  Symbol <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('name')} className="h-8 text-left font-medium">
                  Name <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('status')} className="h-8 text-left font-medium">
                  Status <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('trustValue')} className="h-8 text-left font-medium">
                  Trust Value <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('targetCompany')} className="h-8 text-left font-medium">
                  Target Company <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('exchange')} className="h-8 text-left font-medium">
                  Exchange <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSpacs.map((spac) => (
              <TableRow key={spac.symbol}>
                <TableCell className="font-medium">{spac.symbol}</TableCell>
                <TableCell>{spac.name}</TableCell>
                <TableCell>{spac.status}</TableCell>
                <TableCell>${spac.trustValue.toLocaleString()}</TableCell>
                <TableCell>{spac.targetCompany || "Searching"}</TableCell>
                <TableCell>{spac.exchange}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}