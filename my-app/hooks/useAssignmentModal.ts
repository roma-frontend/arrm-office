import { create } from "zustand";

export interface AssignmentModalData {
  employeeId: string;
  date: string;
  code?: string;
  comment?: string;
  amount?: number;
}

interface AssignmentModalStore {
  isOpen: boolean;
  data: AssignmentModalData | null;
  openModal: (data: AssignmentModalData) => void;
  closeModal: () => void;
}

export const useAssignmentModal = create<AssignmentModalStore>((set) => ({
  isOpen: false,
  data: null,
  openModal: (data) => set({ isOpen: true, data }),
  closeModal: () => set({ isOpen: false, data: null }),
}));