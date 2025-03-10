import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { stockCache } from "@/lib/stockCache";
import { useState } from "react";
import { Card } from "@/components/ui/card";

const TRADING_APPS = [
  "Any",
  "Robinhood",
  "TD Ameritrade",
  "E*TRADE",
  "Fidelity",
  "Charles Schwab",
  "Webull",
  "Interactive Brokers",
];

const EXCHANGES = [
  "Any",
  "NYSE",
  "NASDAQ",
  "AMEX",
  "OTC",
];

const INDUSTRIES = [
  "Any",
  "Software",
  "Hardware",
  "Semiconductors",
  "Biotechnology",
  "Banking",
  "Insurance",
  "Retail",
  "Oil & Gas",
  "Mining",
  "Manufacturing",
  "Real Estate",
  "Airlines",
  "Automotive",
  "Cannabis",
  "Chemicals",
  "Construction",
  "Consumer Products",
  "Defense",
  "E-commerce",
  "Education",
  "Entertainment",
  "Food & Beverage",
  "Gaming",
  "Healthcare",
  "Internet Media",
  "Logistics",
  "Metals",
  "Pharmaceuticals",
  "Renewable Energy",
  "Telecommunications",
  "Travel & Leisure",
  "Utilities"
];

const filterSchema = z.object({
  search: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  minChangePercent: z.string().optional(),
  maxChangePercent: z.string().optional(),
  minAnalystRating: z.string().optional(),
  minVolume: z.string().optional(),
  maxVolume: z.string().optional(),
  minMarketCap: z.string().optional(),
  maxMarketCap: z.string().optional(),
  minBeta: z.string().optional(),
  maxBeta: z.string().optional(),
  industry: z.string().optional(),
  exchange: z.string().optional(),
  tradingApp: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  newOnly: z.boolean().optional(),
  afterHoursOnly: z.boolean().optional(),
});

type FilterValues = z.infer<typeof filterSchema>;

interface StockFiltersProps {
  onFilterChange: (filters: FilterValues) => void;
}

export function StockFilters({ onFilterChange }: StockFiltersProps) {
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ symbol: string; name: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const form = useForm<FilterValues>({
    resolver: zodResolver(filterSchema),
    defaultValues: {
      minPrice: "0.03",
      sortBy: "analystRating",
      sortDir: "desc",
      exchange: "Any",
      industry: "Any",
      tradingApp: "Any",
    },
  });

  // Handle search suggestions
  const handleSearchChange = (value: string) => {
    if (!value) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const stocks = stockCache.getAllStocks();
    const suggestions = stocks
      .filter(stock =>
        stock.symbol.toLowerCase().includes(value.toLowerCase()) ||
        stock.name.toLowerCase().includes(value.toLowerCase())
      )
      .slice(0, 5)
      .map(stock => ({
        symbol: stock.symbol,
        name: stock.name
      }));

    setSearchSuggestions(suggestions);
    setShowSuggestions(true);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault(); // Prevent form submission
          onFilterChange(form.getValues());
        }}
        onChange={() => onFilterChange(form.getValues())}
        className="space-y-4"
      >
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="search"
            render={({ field }) => (
              <FormItem className="relative">
                <FormLabel className="text-cyan-500">Search Stocks</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="Search by symbol or name..."
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      handleSearchChange(e.target.value);
                    }}
                    onFocus={() => field.value && setShowSuggestions(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault(); // Prevent form submission on enter
                        onFilterChange(form.getValues());
                      }
                    }}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
                {showSuggestions && searchSuggestions.length > 0 && (
                  <Card className="absolute w-full mt-1 z-50 max-h-[200px] overflow-y-auto">
                    <div className="p-2">
                      {searchSuggestions.map((suggestion) => (
                        <Button
                          key={suggestion.symbol}
                          variant="ghost"
                          className="w-full justify-start text-left hover:bg-cyan-500/10"
                          onClick={(e) => {
                            e.preventDefault(); // Prevent form submission
                            form.setValue("search", suggestion.symbol);
                            setShowSuggestions(false);
                            onFilterChange(form.getValues());
                          }}
                        >
                          <div>
                            <div className="font-medium">{suggestion.symbol}</div>
                            <div className="text-sm text-muted-foreground">{suggestion.name}</div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </Card>
                )}
              </FormItem>
            )}
          />
          <div className="flex flex-col gap-2">
            <FormField
              control={form.control}
              name="newOnly"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className={cn(
                        "form-checkbox h-4 w-4 border-cyan-500/20",
                        field.value ? "bg-background text-cyan-500" : "text-cyan-500"
                      )}
                    />
                  </FormControl>
                  <FormLabel className="text-cyan-500 mb-0">New Listings Only</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="afterHoursOnly"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className={cn(
                        "form-checkbox h-4 w-4 border-cyan-500/20",
                        field.value ? "bg-background text-cyan-500" : "text-cyan-500"
                      )}
                    />
                  </FormControl>
                  <FormLabel className="text-cyan-500 mb-0">After Hours Trading Only</FormLabel>
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="exchange"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Market</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border-cyan-500/20 focus:ring-cyan-500/20">
                      <SelectValue placeholder="Select market" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EXCHANGES.map((exchange) => (
                      <SelectItem key={exchange} value={exchange}>
                        {exchange}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tradingApp"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Trading Platform</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border-cyan-500/20 focus:ring-cyan-500/20">
                      <SelectValue placeholder="Select trading platform" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TRADING_APPS.map((app) => (
                      <SelectItem key={app} value={app}>
                        {app}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="industry"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Industry</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border-cyan-500/20 focus:ring-cyan-500/20">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {INDUSTRIES.map((industry) => (
                      <SelectItem key={industry} value={industry}>
                        {industry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="minPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Min Price</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0.03"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Max Price</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="1000"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="minChangePercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Min Change %</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="-10"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxChangePercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Max Change %</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="10"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="minAnalystRating"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Min Analyst Rating</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="75"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="minVolume"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Min Volume (M)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxVolume"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Max Volume (M)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="1000"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="minMarketCap"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Min Market Cap (B)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxMarketCap"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Max Market Cap (B)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="1000"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="minBeta"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Min Beta</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxBeta"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Max Beta</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="3"
                    {...field}
                    className="border-cyan-500/20 focus-visible:ring-cyan-500/20"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sortBy"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Sort By</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="border-cyan-500/20 focus:ring-cyan-500/20">
                      <SelectValue placeholder="Choose field" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="analystRating">Analyst Rating</SelectItem>
                    <SelectItem value="price">Price</SelectItem>
                    <SelectItem value="changePercent">Change %</SelectItem>
                    <SelectItem value="volume">Volume</SelectItem>
                    <SelectItem value="marketCap">Market Cap</SelectItem>
                    <SelectItem value="beta">Beta</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sortDir"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-cyan-500">Sort Direction</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="border-cyan-500/20 focus:ring-cyan-500/20">
                      <SelectValue placeholder="Choose direction" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <Button
            type="button" // Changed from "reset" to "button"
            variant="outline"
            className="w-full hover:bg-cyan-500/10 hover:text-cyan-500 border-cyan-500/20"
            onClick={(e) => {
              e.preventDefault(); // Prevent form submission
              form.reset({
                minPrice: "0.03",
                sortBy: "analystRating",
                sortDir: "desc",
                exchange: "Any",
                industry: "Any",
                tradingApp: "Any",
              });
              onFilterChange({
                minPrice: "0.03",
                sortBy: "analystRating",
                sortDir: "desc",
                exchange: "Any",
                industry: "Any",
                tradingApp: "Any",
              });
            }}
          >
            Reset Filters
          </Button>
        </div>
      </form>
    </Form>
  );
}