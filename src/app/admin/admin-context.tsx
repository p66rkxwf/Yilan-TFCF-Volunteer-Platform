"use client";

import { createContext, useContext } from "react";
import type { StaffRole, StaffJobTitle, StaffAccountStatus } from "@/lib/types/database";

export interface AdminProfile {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  job_title: StaffJobTitle;
  status: StaffAccountStatus;
}

const AdminContext = createContext<AdminProfile | null>(null);

export function AdminProvider({
  profile,
  children,
}: {
  profile: AdminProfile;
  children: React.ReactNode;
}) {
  return (
    <AdminContext.Provider value={profile}>{children}</AdminContext.Provider>
  );
}

export function useAdminProfile() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdminProfile must be used within AdminProvider");
  return ctx;
}
