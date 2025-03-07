import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getIpoCalendar } from "@/lib/finnhub";
import type { IpoEvent } from "@/lib/finnhub";

export function IpoCalendar() {
  const { data: ipoEvents, isLoading } = useQuery({
    queryKey: ["/api/finnhub/calendar/ipo"],
    queryFn: getIpoCalendar,
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading IPO calendar...
      </div>
    );
  }

  if (!ipoEvents?.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No upcoming IPOs found.
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Price Range</TableHead>
              <TableHead>Shares (M)</TableHead>
              <TableHead>Exchange</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ipoEvents.map((ipo) => (
              <TableRow key={ipo.symbol}>
                <TableCell className="font-medium">{ipo.symbol}</TableCell>
                <TableCell>{ipo.name}</TableCell>
                <TableCell>{new Date(ipo.date).toLocaleDateString()}</TableCell>
                <TableCell>${ipo.price || "TBA"}</TableCell>
                <TableCell>{ipo.shares ? (ipo.shares / 1_000_000).toFixed(1) : "TBA"}</TableCell>
                <TableCell>{ipo.exchange}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
