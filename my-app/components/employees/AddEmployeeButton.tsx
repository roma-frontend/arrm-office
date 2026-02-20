"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmployeeModal } from "./EmployeeModal";
import { Plus } from "lucide-react";

export function AddEmployeeButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button className="mt-4 w-full" onClick={() => setIsOpen(true)}>
        <Plus className="mr-2 h-4 w-4" /> Add Employee
      </Button>
      <EmployeeModal open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}