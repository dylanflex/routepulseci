import React from "react";

export const StatChip = ({ label, value, hint, icon: Icon, tone = "primary" }) => (
  <div className="relative overflow-hidden rounded-2xl bg-card border border-border p-4 shadow-soft">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="mt-1 font-display text-2xl sm:text-3xl font-semibold text-foreground">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {Icon && (
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tone === "primary" ? "bg-primary/10 text-primary" : tone === "accent" ? "bg-accent/10 text-accent" : "bg-muted text-foreground"}`}>
          <Icon className="w-4 h-4" />
        </div>
      )}
    </div>
  </div>
);

export default StatChip;
