import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getIpoCalendar } from "@/lib/finnhub";
import type { IpoEvent } from "@/lib/finnhub";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function IpoCalendar() {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof IpoEvent;
    direction: 'asc' | 'desc';
  }>({ key: 'date', direction: 'desc' });

  const { data: ipoEvents, isLoading } = useQuery({
    queryKey: ["/api/finnhub/calendar/ipo"],
    queryFn: getIpoCalendar,
  });

  const handleSort = (key: keyof IpoEvent) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedEvents = ipoEvents?.sort((a, b) => {
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

  if (!sortedEvents?.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No upcoming IPOs found.
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
                  Company <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('date')} className="h-8 text-left font-medium">
                  Date <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('price')} className="h-8 text-left font-medium">
                  Price Range <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('shares')} className="h-8 text-left font-medium">
                  Shares <ArrowUpDown className="ml-2 h-4 w-4" />
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
            {sortedEvents.map((ipo) => (
              <TableRow key={ipo.symbol}>
                <TableCell className="font-medium">{ipo.symbol}</TableCell>
                <TableCell>{ipo.name}</TableCell>
                <TableCell>{new Date(ipo.date).toLocaleDateString()}</TableCell>
                <TableCell>${ipo.price?.toLocaleString() || "TBA"}</TableCell>
                <TableCell>{ipo.shares ? `${ipo.shares.toLocaleString()} shares` : "TBA"}</TableCell>
                <TableCell>{ipo.exchange}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}