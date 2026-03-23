"use client";
import { useContext } from "react";
import { CompanyContext } from "@/components/providers/company-provider";
export function useCompany() {
  return useContext(CompanyContext);
}
