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

const filterSchema = z.object({
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
  sectors: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

type FilterValues = z.infer<typeof filterSchema>;

interface StockFiltersProps {
  onFilterChange: (filters: FilterValues) => void;
}

const SECTORS = [
  "Technology",
  "Healthcare",
  "Finance",
  "Consumer Discretionary",
  "Energy",
  "Materials",
  "Industrials",
  "Utilities",
  "Real Estate",
];

const INDUSTRIES = [
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
];

export function StockFilters({ onFilterChange }: StockFiltersProps) {
  const form = useForm<FilterValues>({
    resolver: zodResolver(filterSchema),
    defaultValues: {
      sortDir: "desc",
      minAnalystRating: "75",
    },
  });

  return (
    <Form {...form}>
      <form 
        onChange={() => onFilterChange(form.getValues())}
        className="space-y-4"
      >
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="minPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min Price</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Price</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="1000" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="minChangePercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min Change %</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="-10" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxChangePercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Change %</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="10" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="minAnalystRating"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min Analyst Rating</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="75" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="minVolume"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min Volume (M)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxVolume"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Volume (M)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="1000" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="minMarketCap"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min Market Cap (B)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxMarketCap"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Market Cap (B)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="1000" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="minBeta"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min Beta</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxBeta"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Beta</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="3" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sectors"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sector</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange([value])}
                  value={field.value?.[0]}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sector" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SECTORS.map((sector) => (
                      <SelectItem key={sector} value={sector}>
                        {sector}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="industries"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Industry</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange([value])}
                  value={field.value?.[0]}
                >
                  <FormControl>
                    <SelectTrigger>
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
            name="sortBy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sort By</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose field" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="price">Price</SelectItem>
                    <SelectItem value="changePercent">Change %</SelectItem>
                    <SelectItem value="analystRating">Analyst Rating</SelectItem>
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
                <FormLabel>Sort Direction</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
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
        </div>

        <Button 
          type="reset" 
          variant="outline"
          className="w-full"
          onClick={() => {
            form.reset();
            onFilterChange({});
          }}
        >
          Reset Filters
        </Button>
      </form>
    </Form>
  );
}