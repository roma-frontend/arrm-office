import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Employee } from "@/types/global";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { EmployeeModal } from "./EmployeeModal";

interface EmployeeItemProps {
  employee: Employee;
}

export function EmployeeItem({ employee }: EmployeeItemProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const deleteEmployee = useMutation(api.employees.remove);

  const handleDelete = async () => {
    if (confirm("Delete this employee? All assignments will be lost.")) {
      try {
        await deleteEmployee({ id: employee._id });
        toast.success("Employee deleted");
      } catch {
        toast.error("Delete failed");
      }
    }
  };

  return (
    <>
      <li className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="font-medium">{employee.name}</p>
          <p className="text-xs text-muted-foreground">{employee.email}</p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => setIsEditOpen(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </li>
      <EmployeeModal
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        employee={employee}
      />
    </>
  );
}