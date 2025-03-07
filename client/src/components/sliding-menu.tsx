import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

interface SlidingMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function SlidingMenu({ isOpen, onToggle, children }: SlidingMenuProps) {
  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onToggle}
        />
      )}
      
      {/* Sliding panel */}
      <div className={cn(
        "fixed top-0 left-0 z-50 h-full bg-card border-r transform transition-transform duration-200 ease-in-out",
        "w-[300px] lg:w-[350px]",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="h-full overflow-y-auto p-6">
          {children}
        </div>
        
        {/* Toggle button - visible only on mobile */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-12 top-4 lg:hidden"
          onClick={onToggle}
        >
          <ChevronRight className={cn(
            "h-4 w-4 transition-transform",
            isOpen && "rotate-180"
          )} />
        </Button>
      </div>
    </>
  );
}
