import React, { useState, useMemo } from "react";
import "./index.css";
import { RepProfileHeader } from "@/src/components/RepProfileHeader";
import { ClientsPreview } from "@/src/components/ClientsPreview";
import { ClientProfileCardProps as ClientCardProps } from "@/src/components/ClientProfileCard";
import { Customer } from "@/types";
import { StatusBadge } from "@/src/components/StatusBadge";

export interface RepClientsPageProps {
  rep: import("@/types").User;
  allCustomers: Customer[];
  onRefresh?: () => void;
}

export const RepClientsPage: React.FC<RepClientsPageProps> = ({
  rep,
  allCustomers,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSector, setSelectedSector] = useState<"home" | "electrical" | "both" | "all" | "">("");
  const [selectedRep, setSelectedRep] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "mostIndebted">("mostIndebted");

  const filteredCustomers = useMemo(() => {
    return allCustomers.filter((customer) => {
      const matchesSearch =
        (!searchTerm ||
          customer.code.toLowerCase().includes(searchTerm.toLowerCase) ||
          customer.name.toLowerCase().includes(searchTerm.toLowerCase)) &&
      (!selectedSector || customer["sector"] === selectedSector) &&
      (!selectedRep || customer.repName === selectedRep) &&
      (!selectedBranch || customer.branchName === selectedBranch) &&
      (!selectedSupervisor || customer.supervisorName === selectedSupervisor);
      return matchesSearch;
    });
  }, [allCustomers, searchTerm, selectedSector, selectedRep, selectedBranch, selectedSupervisor]);

  const sortedCustomers = useMemo(() => {
    const copy = [...filteredCustomers];
    copy.sort((a, b) => {
      if (sortBy === "mostIndebted") {
        const aDebt = a.totalOverdueAndDue ?? 0;
        const bDebt = b.totalOverdueAndDue ?? 0;
        return bDebt - aDebt;
      } else if (sortBy === "newest") {
        const aDate = a.lastCollectionDate ? new Date(a.lastCollectionDate) : new Date(0);
        const bDate = b.lastCollectionDate ? new Date(b.lastCollectionDate) : new Date(0);
        return bDate.getTime() - aDate.getTime();
      } else {
        const aDate = a.lastCollectionDate ? new Date(a.lastCollectionDate) : new Date(0);
        const bDate = b.lastCollectionDate ? new Date(b.lastCollectionDate) : new Date(0);
        return aDate.getTime() - bDate.getTime();
      }
    });
    return copy;
  }, [filteredCustomers, sortBy]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = () => {
    setIsRefreshing(true);
    if (onRefresh) {
      onRefresh();
    }
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 mb-6 bg-white dark:bg-neutral-900 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 md:grid-cols-3 xl:grid-cols-4">
          <div>
            <label className="text-caption text-text-muted mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm((e.target.value as any))}
              placeholder="Code or name..."
              className="w-full rounded-md border border-border px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="text-caption text-text-muted mb-1">Sector</label>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector((e.target.value as any))}
              className="w-full rounded-md border border-border px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary appearance-none dark:text-neutral-100"
            >
              <option value="">All</option>
              <option value="home">Home</option>
              <option value="electrical">Electrical</option>
              <option value="both">Both</option>
              <option value="all">All</option>
            </select>
          </div>
          <div>
            <label className="text-caption text-text-muted mb-1">Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch((e.target.value as any))}
              className="w-full rounded-md border border-border px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary appearance-none dark:text-neutral-100"
            >
              <option value="">All</option>
              {allCustomers.map((c) => (
                <option key={c.branchName} value={c.branchName}>{c.branchName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-caption text-text-muted mb-1">Sort</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy((e.target.value as any))}
              className="w-full rounded-md border border-border px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary appearance-none dark:text-neutral-100"
            >
              <option value="mostIndebted">Most indebted</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedSector("");
                setSelectedRep("");
                setSelectedBranch("");
                setSelectedSupervisor("");
                setSortBy("mostIndebted");
              }}
              className="py-2 px-3 rounded-md bg-transparent border border-border text-caption hover:bg-primary/10 transition"
            >
              Clear all
            </button>
          </div>
        </div>
      </div>
      <ClientsPreview
        customers={sortedCustomers.slice(0, 5)}
        onSelect={(id) => console.log("Select:", id)}
        emptyMessage="No customers after filters"
      />
    </div>
  );
};
/*** End ***/
