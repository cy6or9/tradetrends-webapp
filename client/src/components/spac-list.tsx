import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSpacList } from "@/lib/finnhub";
import type { Spac } from "@/lib/finnhub";

export function SpacList() {
  const { data: spacs, isLoading } = useQuery({
    queryKey: ["/api/finnhub/spacs"],
    queryFn: getSpacList,
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading SPACs...
      </div>
    );
  }

  if (!spacs?.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No active SPACs found.
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
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Trust Value ($M)</TableHead>
              <TableHead>Target Company</TableHead>
              <TableHead>Exchange</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spacs.map((spac) => (
              <TableRow key={spac.symbol}>
                <TableCell className="font-medium">{spac.symbol}</TableCell>
                <TableCell>{spac.name}</TableCell>
                <TableCell>{spac.status}</TableCell>
                <TableCell>${(spac.trustValue / 1_000_000).toFixed(1)}M</TableCell>
                <TableCell>{spac.targetCompany || "Searching"}</TableCell>
                <TableCell>{spac.exchange}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
