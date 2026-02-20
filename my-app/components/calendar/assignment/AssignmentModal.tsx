"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAssignmentModal } from "@/hooks/useAssignmentModal";
import { toast } from "sonner";
import { LEAVE_TYPES } from "@/lib/constants";
import { Id } from "@/convex/_generated/dataModel";

export function AssignmentModal() {
  const { isOpen, closeModal, data } = useAssignmentModal();
  const assignRange = useMutation(api.assignments.assignRange);
  const deleteRange = useMutation(api.assignments.deleteRange);

  const [type, setType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [comment, setComment] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (data) {
      setType(data.code || "");
      setStartDate(data.date);
      setEndDate(data.date);
      setComment(data.comment || "");
      setAmount(data.amount || "");
    }
  }, [data]);

  const handleSave = async () => {
    if (!data?.employeeId || !type || !startDate || !endDate) {
      toast.error("Please fill all required fields");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("End date must be after start date");
      return;
    }
    setLoading(true);
    try {
      await assignRange({
        employeeId: data.employeeId as Id<"employees">,
        startDate,
        endDate,
        code: type,
        comment: comment || undefined,
        amount: amount || undefined,
      });
      toast.success("Assignment saved");
      closeModal();
    } catch (error) {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!data?.employeeId || !startDate || !endDate) return;
    setLoading(true);
    try {
      await deleteRange({
        employeeId: data.employeeId as Id<"employees">,
        startDate,
        endDate,
      });
      toast.success("Block deleted");
      closeModal();
    } catch (error) {
      toast.error("Delete failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={closeModal}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assign Leave / Trip</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t.code} value={t.code}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Amount (AMD)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label>Comment</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add notes..."
              rows={3}
            />
          </div>
        </div>
        <div className="flex justify-between">
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            Delete Block
          </Button>
          <div className="space-x-2">
            <Button variant="outline" onClick={closeModal} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}